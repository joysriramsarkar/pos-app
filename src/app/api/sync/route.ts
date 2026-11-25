// ============================================================================
// Sync API Route - Offline-First Synchronization
// Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ProductInputSchema, SaleInputSchema, CustomerInputSchema } from '@/schemas';
import { addMoney, subtractMoney, toMoneyNumber, toMoneyDecimal } from '@/lib/money';
import Decimal from 'decimal.js';
import { findSaleItemTotalMismatch } from '@/lib/sale-calculations';
import {
  applySaleStockPlans,
  costPriceForProduct,
  lockAndPlanSaleStock,
} from '@/lib/sale-stock';
import { logAudit } from '@/lib/audit';
import { checkSalePricingAuthority } from '@/lib/sale-pricing';
import { computeSaleTotals, SaleValidationError } from "@/domain/sales/sale-totals";
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  fingerprintFor,
  IdempotencyConflict,
  IdempotencyInProgress,
} from '@/lib/idempotency';
import { applyStockMovementTx } from '@/server/services/inventory.service';
import { DomainError, ERROR_CODES } from '@/lib/domain-errors';
const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

/**
 * P1-D: offline stock movements carry an optional unit cost so a real receipt
 * can update WAC, and an optional reason so an adjustment is never mislabeled
 * as a purchase. `purchasePrice` is what the device already queues today.
 */
const StockDeltaSyncPayloadSchema = z.object({
  productId: z.string().min(1),
  quantityChange: z.number().finite().refine((n) => n !== 0, "quantityChange must not be 0"),
  unitCost: z.number().nonnegative().optional(),
  purchasePrice: z.number().nonnegative().optional(),
  reason: z.string().max(200).optional(),
});

const ProductSyncPayloadSchema = z.union([
  ProductInputSchema,
  StockDeltaSyncPayloadSchema,
]);

import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";

/** Thrown for business-rule/validation failures — surfaced as HTTP 4xx. */
class SyncRejection extends Error {}

/**
 * MP-27: per-action permission map. Every sync action mutates business data,
 * so each one requires an explicit permission — checked BEFORE the transaction.
 */
const ACTION_PERMISSION: Record<string, string> = {
  "sale:create": "sales.create",
  "product:create": "products.create",
  "product:update": "products.update",
  "product:stock:update": "stock.create",
  "customer:create": "customers.create",
  "customer:update": "customers.update",
  "prepayment:create": "due.collect",
};

function errorId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// GET /api/sync - Get pending sync items or sync status
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext(authResult.session);
  if (ctx instanceof NextResponse) return ctx;

  const businessId = ctx.business.id;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "status") {
      // Return sync status
      const [pendingCount, lastSync] = await Promise.all([
        db.syncQueue.count({ where: { businessId, synced: false } }),
        db.syncQueue.findFirst({
          where: { businessId, synced: true },
          orderBy: { syncedAt: "desc" },
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          pendingCount,
          lastSyncTime: lastSync?.syncedAt || null,
        },
      });
    }

    // Return all pending sync items
    const pendingItems = await db.syncQueue.findMany({
      where: { businessId, synced: false },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: pendingItems,
    });
  } catch (error: unknown) {
    console.error("Error fetching sync status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sync status" },
      { status: 500 },
    );
  }
}

// POST /api/sync - Sync offline data with idempotency guarantee
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ctx = await requireBusinessContext(authResult.session);
  if (ctx instanceof NextResponse) return ctx;

  const businessId = ctx.business.id;

  try {
    const rawKey = request.headers.get("X-Idempotency-Key");
    const keyCheck = z.string().min(8).max(128).safeParse(rawKey ?? "");
    if (!keyCheck.success) {
      return NextResponse.json(
        { success: false, code: "VALIDATION_FAILED", error: "Missing or invalid X-Idempotency-Key header" },
        { status: 400 },
      );
    }
    const idempotencyKey = keyCheck.data;

    const body = await request.json();
    const { actionType, payload, businessId: payloadBusinessId } = body;

    // Multi-tenant security: forbid cross-tenant sync queues
    if (payloadBusinessId && payloadBusinessId !== businessId) {
      return NextResponse.json(
        { success: false, code: "PERMISSION_DENIED", error: "Cross-tenant sync forbidden" },
        { status: 403 },
      );
    }

    if (!actionType || !payload) {
      return NextResponse.json(
        { success: false, code: "VALIDATION_FAILED", error: "Missing actionType or payload" },
        { status: 400 },
      );
    }

    // MP-27: enforce per-action permission before touching the database.
    const required = ACTION_PERMISSION[actionType];
    if (!required) {
      return NextResponse.json(
        { success: false, code: "VALIDATION_FAILED", error: "Unknown action" },
        { status: 400 },
      );
    }
    const denied = checkPermission(ctx, required);
    if (denied) return denied;

    // P0-A: the key is claimed INSIDE the business transaction, namespaced by
    // tenant + action and bound to a canonical hash of the payload. Two
    // concurrent requests can no longer both "see no key" and both move money:
    // the second insert conflicts, waits for the first to commit, then replays
    // its cached result (or gets a transient 409 INPROGRESS).
    const fingerprint = fingerprintFor(actionType, payload);

    let result: { cached: boolean; data: any };
    try {
      result = await db.$transaction(async (tx): Promise<{ cached: boolean; data: any }> => {
        const claim = await claimIdempotencyTx<unknown>(tx, businessId, actionType, idempotencyKey, {
          fingerprint,
          requestPayload: payload,
          entityType: actionType,
        });

        if (claim.replay) {
          return {
            cached: true,
            data: claim.result,
          };
        }

        let operationResult;

        switch (actionType) {
          case "sale:create": {
            const saleResult = SaleInputSchema.safeParse(payload);
            if (!saleResult.success)
              throw new SyncRejection(
                "Invalid Sale payload: " + saleResult.error.message,
              );
            operationResult = await syncSale(
              tx,
              saleResult.data,
              "create",
              businessId,
              ctx.role,
              ctx.user.id,
              getIp(request),
            );
            break;
          }
          case "customer:create": {
            const customerResult = CustomerInputSchema.safeParse(payload);
            if (!customerResult.success)
              throw new SyncRejection(
                "Invalid Customer payload: " + customerResult.error.message,
              );
            operationResult = await syncCustomer(
              tx,
              customerResult.data,
              "create",
              businessId,
            );
            break;
          }
          case "customer:update": {
            const customerResult = CustomerInputSchema.safeParse(payload);
            if (!customerResult.success)
              throw new SyncRejection(
                "Invalid Customer payload: " + customerResult.error.message,
              );
            operationResult = await syncCustomer(
              tx,
              customerResult.data,
              "update",
              businessId,
            );
            break;
          }
          case "product:stock:update": {
            const productResult = ProductSyncPayloadSchema.safeParse(payload);
            if (!productResult.success)
              throw new SyncRejection(
                "Invalid Product payload: " + productResult.error.message,
              );
            operationResult = await syncProduct(tx, productResult.data, "update", businessId);
            break;
          }
          case "product:create": {
            const productResult = ProductInputSchema.safeParse(payload);
            if (!productResult.success)
              throw new SyncRejection(
                "Invalid Product payload: " + productResult.error.message,
              );
            operationResult = await syncProduct(tx, productResult.data, "create", businessId);
            break;
          }
          case "product:update": {
            const productResult = ProductInputSchema.safeParse(payload);
            if (!productResult.success)
              throw new SyncRejection(
                "Invalid Product payload: " + productResult.error.message,
              );
            operationResult = await syncProduct(tx, productResult.data, "update", businessId);
            break;
          }
          case "prepayment:create": {
            const prepaymentSchema = z.object({
              customerId: z.string().cuid(),
              amount: z.number().positive(),
            });
            const prepaymentResult = prepaymentSchema.safeParse(payload);
            if (!prepaymentResult.success)
              throw new SyncRejection(
                "Invalid Prepayment payload: " + prepaymentResult.error.message,
              );

            operationResult = await syncPrepayment(tx, prepaymentResult.data, businessId);
            break;
          }
          default:
            throw new SyncRejection(`Unknown action type: ${actionType}`);
        }

        // Extract entity ID from payload or result if available
        let entityId: string | undefined;
        if (typeof payload === "object" && payload !== null) {
          const p = payload as Record<string, unknown>;
          const id = typeof p.id === "string" ? p.id : undefined;
          const customerId =
            typeof p.customerId === "string" ? p.customerId : undefined;
          const productId =
            typeof p.productId === "string" ? p.productId : undefined;
          entityId = id || customerId || productId;
        }

        // P0-A: finalize inside the SAME transaction — the cached result and the
        // money movement commit (or roll back) together.
        if (claim.claim) {
          await finalizeIdempotencyTx(tx, claim.claim, operationResult, {
            entityId,
            payload,
          });
        }

        return { cached: false, data: operationResult };
      }, { timeout: 60000, maxWait: 15000 });
    } catch (txError) {
      if (txError instanceof IdempotencyInProgress) {
        return NextResponse.json(
          { success: false, code: "INPROGRESS", error: "Same request is already being processed. Retry shortly." },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
      // Permanent: the key belongs to a different tenant/action/payload.
      // Replaying it would leak another business' result or move money twice.
      if (txError instanceof IdempotencyConflict) {
        return NextResponse.json(
          {
            success: false,
            code: "IDEMPOTENCY_KEY_REUSED",
            error: "This idempotency key was already used for a different request. Generate a new key.",
          },
          { status: 409 },
        );
      }
      throw txError;
    }

    // MP-31: best-effort popularity AFTER commit (never inside the sale tx).
    try {
      const popItems = (result.data as { __popularityItems?: Array<{ productId: string; quantity: number; totalPrice: number }> })?.__popularityItems;
      if (actionType === 'sale:create' && popItems?.length && !result.cached) {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        for (const item of popItems) {
          await db.productPopularity.upsert({
            where: { productId_periodStart: { productId: item.productId, periodStart } },
            update: { monthlySalesCount: { increment: item.quantity }, totalRevenue: { increment: item.totalPrice }, periodEnd, updatedAt: new Date() },
            create: { businessId, productId: item.productId, monthlySalesCount: item.quantity, totalRevenue: item.totalPrice, periodStart, periodEnd },
          });
        }
      }
    } catch (popError) {
      console.error('Failed to update product popularity in sync (post-commit):', popError);
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      cached: result.cached,
      message: `${actionType} synced successfully`,
    });
  } catch (error: unknown) {
    const rid = errorId();
    console.error("Error syncing data:", { rid, error });
    if (error instanceof SyncRejection) {
      const isConflict = error.message.startsWith("CONFLICT:");
      return NextResponse.json(
        {
          success: false,
          code: isConflict ? "VERSION_CONFLICT" : "VALIDATION_FAILED",
          error: error.message,
          requestId: rid,
        },
        { status: isConflict ? 409 : 400 },
      );
    }
    // MP-35/SEC-003: never leak internal/prisma details to the client.
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        error: "Request could not be completed",
        requestId: rid,
      },
      { status: 500 },
    );
  }
}
// Sync sale from offline
async function syncSale(
  tx: Prisma.TransactionClient,
  saleData: z.infer<typeof SaleInputSchema>,
  action: string,
  businessId: string,
  role: string,
  actorUserId?: string,
  ipAddress?: string,
) {
  if (action === 'create') {

    if (!saleData.invoiceNumber) {
      throw new SyncRejection("Invoice number is required for sync");
    }
    // Bug 17 fix: idempotency is handled via X-Idempotency-Key / syncQueue above.
    // If we reach here and an invoice with this number already exists it is a genuine
    // collision between two different sales — treat it as a CONFLICT, not a silent replay.
    const existing = await tx.sale.findFirst({
      where: { businessId, invoiceNumber: saleData.invoiceNumber },
    });

    if (existing) {
      // Allow exact same sale id (true idempotent replay from a retried sync key that
      // slipped past the syncQueue check, e.g. a race between two concurrent requests).
      if (saleData.id && existing.id === saleData.id) {
        return existing;
      }
      // Different sale — real invoice number collision. Surface it so the cashier can
      // investigate rather than silently losing the second sale.
      throw new SyncRejection(
        `CONFLICT: Invoice number ${saleData.invoiceNumber} already exists for a different sale. Please re-sync or manually assign a new invoice number.`
      );
    }

    // Create sale with items
    // already in tx
    // VALIDATION PHASE: Check all prerequisites before creating anything

    // 1. Lock products + plan stock FIRST (sorted FOR UPDATE, auto-adjust, blended COGS).
    // Lock ordering is the deadlock guard — validation never precedes locking.
    // Bug 7 note: rejectOnShortage=false here because the sale ALREADY HAPPENED offline —
    // the customer physically received the goods. Blocking sync retroactively would corrupt
    // the ledger. The shortage is recorded in autoAdjusted for transparency.
    const { plansByProductId, autoAdjusted } = await lockAndPlanSaleStock(
      tx,
      saleData.items,
      businessId,
      false, // allow shortage — don't reject past offline sales
    );

    // 2. Validate customer exists if specified
    if (saleData.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: saleData.customerId, businessId },
      });

      if (!customer) {
        throw new SyncRejection(
          `Customer ${saleData.customerId} not found during sync validation`,
        );
      }
    }

    // MP-21: canonical totals core shared with /api/sales (identical math + messages).
    // Walk-in full-payment is enforced here too (parity): due without a customer
    // is uncollectible; violations dead-letter with local rollback on device.
    let totalAmount: Decimal;
    let amountReceived: Decimal;
    let amountPaid: Decimal;
    let prepaidToUse: Decimal;
    let changeAsPrepayment: Decimal;
    let debtRepaymentAmount: Decimal;
    let externalPaidAmount: Decimal;
    try {
      const totals = computeSaleTotals({
        items: saleData.items,
        discount: saleData.discount,
        tax: saleData.tax,
        amountPaid: saleData.amountPaid,
        amountReceived: saleData.amountReceived,
        prepaidAmountUsed: saleData.prepaidAmountUsed,
        changeAsPrepayment: saleData.changeAsPrepayment,
        debtRepaymentAmount: saleData.debtRepaymentAmount,
        customerId: saleData.customerId,
        paymentMethod: saleData.paymentMethod,
        cashAmount: (saleData as any).cashAmount,
        upiAmount: (saleData as any).upiAmount,
      });
      totalAmount = totals.totalAmount;
      amountReceived = totals.amountReceived;
      amountPaid = totals.amountPaidValue;
      prepaidToUse = totals.prepaidToUse;
      changeAsPrepayment = totals.changeAsPrepayment;
      debtRepaymentAmount = totals.debtRepaymentAmount;
      externalPaidAmount = totals.externalPaidAmount;
    } catch (e) {
      if (e instanceof SaleValidationError) throw new SyncRejection(e.message);
      throw e;
    }

    // Bug 3 fix: determine payment method and preserve cash/UPI breakdown
    const pMethodRaw = saleData.paymentMethod ? String(saleData.paymentMethod).toUpperCase() : 'CASH';
    const cashAmt = (saleData as any).cashAmount ?? null;
    const upiAmt = (saleData as any).upiAmount ?? null;

    // Server-authoritative pricing / discount authorization.
    const priceRows = await tx.product.findMany({
      where: { businessId, id: { in: saleData.items.map((i) => i.productId) } },
      select: { id: true, sellingPrice: true },
    });
    const sellingPriceByProductId = new Map(
      priceRows.map((p) => [p.id, Number(p.sellingPrice)]),
    );
    const pricingCheck = checkSalePricingAuthority(
      saleData.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        totalPrice: Number(item.totalPrice),
      })),
      Number(saleData.discount || 0),
      sellingPriceByProductId,
      role,
    );
    if (!pricingCheck.ok) {
      throw new SyncRejection(pricingCheck.message);
    }

    // CREATE PHASE: sale rows use blended cost (owned @ WAC, shortage @ 0).
    // MP-31: no raw-SQL fallback. If Prisma create fails the transaction
    // aborts and must stay aborted — running INSERTs afterwards can never
    // work ("current transaction is aborted") and only hides schema drift.
    // Fix drift with a migration instead.
    const sale: any = await tx.sale.create({
        data: {
          id: saleData.id,
          businessId,
          invoiceNumber: saleData.invoiceNumber as string,
          userId: saleData.userId || null,
          customerId: saleData.customerId || null,
          subtotal: saleData.subtotal || 0,
          discount: saleData.discount || 0,
          tax: saleData.tax || 0,
          totalAmount: saleData.totalAmount || 0,
          amountPaid: saleData.amountPaid || 0,
          // Bug 3: preserve split payment breakdown for reconciliation reports
          cashAmount: cashAmt,
          upiAmount: upiAmt,
          paymentMethod: pMethodRaw as any,
          paymentStatus: (saleData.paymentStatus ? (saleData.paymentStatus as string).toUpperCase() : 'PAID') as any,
          status: (saleData.status ? (saleData.status as string).toUpperCase() : 'COMPLETED') as any,
          notes: saleData.notes || null,
          offlineSynced: true,
          items: {
            create: saleData.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPriceAtSale: costPriceForProduct(plansByProductId, item.productId, 0),
              totalPrice: item.totalPrice,
            })),
          },
        },
        include: { items: true },
      });

    await applySaleStockPlans(tx, {
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      businessId,
      plans: Array.from(plansByProductId.values()),
      historyReasonPrefix: "Offline sync sale",
    });

    // Attach auto-adjust metadata for callers / audit
    (sale as { autoAdjusted?: typeof autoAdjusted }).autoAdjusted = autoAdjusted;

    // P1-C: the audit row is written with the SAME transaction client as the
    // sale. A missing financial audit record now rolls the sale back instead of
    // committing silently, and a cached replay can never skip it.
    await logAudit(
      {
        businessId,
        userId: actorUserId || saleData.userId || undefined,
        action: "CREATE_SALE",
        entityType: "Sale",
        entityId: sale.id,
        details: {
          invoiceNumber: sale.invoiceNumber,
          totalAmount: toMoneyNumber(sale.totalAmount),
          itemCount: saleData.items.length,
          syncMethod: "offline-sync",
          autoAdjustedCount: autoAdjusted.length,
        },
        ipAddress,
      },
      tx,
    );

    // Update customer due/prepaid if applicable
    if (
      saleData.customerId &&
      (amountPaid.lt(totalAmount) ||
        prepaidToUse.gt(0) ||
        changeAsPrepayment.gt(0) ||
        debtRepaymentAmount.gt(0))
    ) {
      const dueAmount = subtractMoney(totalAmount, amountPaid);

      // Fetch customer BEFORE updating with raw SELECT FOR UPDATE for concurrency safety
      const customerRaw = await tx.$queryRaw<any[]>`
        SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
        FROM customers
        WHERE id = ${saleData.customerId} AND "business_id" = ${businessId}
        FOR UPDATE
      `;
      const customer = customerRaw[0];

      if (customer) {
        const currentTotalDue = toMoneyDecimal(customer.totalDue);
        const currentPrepaidBalance = toMoneyDecimal(customer.prepaidBalance);

        if (debtRepaymentAmount.gt(currentTotalDue)) {
          throw new SyncRejection(`Debt repayment amount (${debtRepaymentAmount.toString()}) cannot exceed current total due (${currentTotalDue.toString()})`);
        }

        if (prepaidToUse.gt(0)) {
            if (currentPrepaidBalance.lt(prepaidToUse)) {
              throw new SyncRejection(`Insufficient prepaid balance. Available: ${currentPrepaidBalance}, Tried to use: ${prepaidToUse}`);
            }
            await tx.ledgerEntry.create({
              data: {
                businessId,
                customerId: saleData.customerId,
                entryType: "PREPAYMENT_USED",
                amount: prepaidToUse,
                balanceAfter: currentTotalDue,
                description: `Prepaid used for offline sale: ${saleData.invoiceNumber}`,
                referenceId: sale.id,
              },
            });
          }

          let totalDueIncrement = new Decimal(0);
          let totalDueDecrement = new Decimal(0);
          let prepaidBalanceIncrement = changeAsPrepayment;
          let prepaidBalanceDecrement = prepaidToUse;
          let balanceAfterPayment = currentTotalDue;

          if (dueAmount.gt(0) || externalPaidAmount.gt(0)) {
            const creditAmount = subtractMoney(totalAmount, prepaidToUse);
            totalDueIncrement = creditAmount;
            totalDueDecrement = externalPaidAmount;

            const creditBalanceAfter = addMoney(currentTotalDue, creditAmount);
            const subAmt = subtractMoney(creditBalanceAfter, externalPaidAmount);
            balanceAfterPayment = subAmt.gt(0) ? subAmt : new Decimal(0);

            if (creditAmount.gt(0)) {
              await tx.ledgerEntry.create({
                data: {
                  businessId,
                  customerId: saleData.customerId,
                  entryType: "CREDIT",
                  amount: creditAmount,
                  balanceAfter: creditBalanceAfter,
                  description: `Offline sync credit purchase: ${saleData.invoiceNumber}`,
                  referenceId: sale.id,
                },
              });
            }
            if (externalPaidAmount.gt(0)) {
              await tx.ledgerEntry.create({
                data: {
                  businessId,
                  customerId: saleData.customerId,
                  entryType: "DEBIT",
                  amount: externalPaidAmount,
                  balanceAfter: balanceAfterPayment,
                  description: `Offline sync payment for: ${saleData.invoiceNumber}`,
                  referenceId: sale.id,
                },
              });
            }
          }

          if (debtRepaymentAmount.gt(0)) {
            totalDueDecrement = totalDueDecrement.plus(debtRepaymentAmount);
            const subAmt = subtractMoney(balanceAfterPayment, debtRepaymentAmount);
            balanceAfterPayment = subAmt.gt(0) ? subAmt : new Decimal(0);
            
            await tx.ledgerEntry.create({
              data: {
                businessId,
                customerId: saleData.customerId,
                entryType: "DEBIT",
                amount: debtRepaymentAmount,
                balanceAfter: balanceAfterPayment,
                description: `Offline sync due clearance: ${saleData.invoiceNumber}`,
                referenceId: sale.id,
              },
            });
          }

          if (changeAsPrepayment.gt(0)) {
            await tx.ledgerEntry.create({
              data: {
                businessId,
                customerId: saleData.customerId,
                entryType: "PREPAYMENT_ADDED",
                amount: changeAsPrepayment,
                balanceAfter: balanceAfterPayment,
                description: `Offline sync change added as prepaid: ${saleData.invoiceNumber}`,
                referenceId: sale.id,
              },
            });
          }

          if (totalDueIncrement.gt(0) || totalDueDecrement.gt(0) || prepaidBalanceIncrement.gt(0) || prepaidBalanceDecrement.gt(0)) {
             const dataUpdate: any = { updatedAt: new Date() };
             if (totalDueIncrement.gt(0) || totalDueDecrement.gt(0)) {
               const newTotalDue = currentTotalDue.plus(totalDueIncrement).minus(totalDueDecrement);
               dataUpdate.totalDue = newTotalDue.gt(0) ? newTotalDue : new Decimal(0);
             }
             if (prepaidBalanceIncrement.gt(0) || prepaidBalanceDecrement.gt(0)) {
               const newPrepaidBalance = currentPrepaidBalance.plus(prepaidBalanceIncrement).minus(prepaidBalanceDecrement);
               dataUpdate.prepaidBalance = newPrepaidBalance.gt(0) ? newPrepaidBalance : new Decimal(0);
             }
             // Bug 4 fix: totalPaid was not incremented during offline sync.
             // createSale() does { increment: paid } — match that behaviour here.
             const externalPaid = amountPaid.minus(prepaidToUse);
             if (externalPaid.gt(0)) {
               dataUpdate.totalPaid = { increment: externalPaid.toNumber() };
             }

             await tx.customer.updateMany({
                where: { id: saleData.customerId, businessId },
                data: dataUpdate
             });
          }
        }
      }

      // MP-31: popularity is best-effort analytics — stash items for AFTER commit.
      // A popularity failure inside the sale transaction would abort the whole
      // sale in Postgres (a failed statement poisons the tx; catch cannot save it).
      (sale as { __popularityItems?: Array<{ productId: string; quantity: number; totalPrice: number }> }).__popularityItems =
        saleData.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          totalPrice: Number(item.totalPrice),
        }));

      return sale;
    }

    throw new SyncRejection(`Unknown action: ${action}`);
}

// Sync prepayment from offline
async function syncPrepayment(tx: Prisma.TransactionClient, prepaymentData: { customerId: string; amount: number }, businessId: string) {
  const customerRaw = await tx.$queryRaw<any[]>`
    SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
    FROM customers
    WHERE id = ${prepaymentData.customerId} AND "business_id" = ${businessId}
    FOR UPDATE
  `;
  const customer = customerRaw[0];

  if (!customer) {
    throw new SyncRejection(`Customer ${prepaymentData.customerId} not found during sync validation`);
  }

  const updatedCustomer = await tx.customer.update({
    where: { id: prepaymentData.customerId },
    data: { prepaidBalance: { increment: prepaymentData.amount }, updatedAt: new Date() },
  });

  await tx.ledgerEntry.create({
    data: {
      businessId,
      customerId: prepaymentData.customerId,
      entryType: "PREPAYMENT_ADDED",
      amount: prepaymentData.amount,
      balanceAfter: customer.totalDue,
      description: "Offline sync prepayment added",
      referenceId: `PREPAY-${Date.now()}`,
    },
  });

  // P1-C: prepayment moves customer money — audit it atomically.
  await logAudit(
    {
      businessId,
      action: "PREPAYMENT_ADDED",
      entityType: "Customer",
      entityId: prepaymentData.customerId,
      details: { amount: prepaymentData.amount, syncMethod: "offline-sync" },
    },
    tx,
  );

  return updatedCustomer;
}

// Sync customer from offline
async function syncCustomer(tx: Prisma.TransactionClient, customerData: z.infer<typeof CustomerInputSchema>, action: string, businessId: string) {
  if (action === 'create') {

    // Check if customer already exists (Server-wins)
    if (customerData.phone) {
      const existing = await tx.customer.findFirst({
        where: { businessId, phone: customerData.phone },
      });

      if (existing) {
        return existing;
      }
    }

    // Never trust client-provided balances — ledger is server-authoritative
    return tx.customer.create({
      data: {
        id: customerData.id,
        businessId,
        name: customerData.name,
        phone: customerData.phone || null,
        address: customerData.address || null,
        notes: customerData.notes || null,
        totalDue: 0,
        totalPaid: 0,
        isActive: true,
      },
    });
  }

  if (action === "update") {
    if (!customerData.id) {
      throw new SyncRejection("Customer ID is required for update");
    }

    await tx.customer.updateMany({
      where: { id: customerData.id, businessId },
      data: {
        name: customerData.name,
        phone: customerData.phone || null,
        address: customerData.address || null,
        notes: customerData.notes || null,
        updatedAt: new Date(),
      },
    });

    return tx.customer.findFirst({
      where: { id: customerData.id, businessId },
    });
  }

  throw new SyncRejection(`Unknown action: ${action}`);
}

// Sync product updates (primarily stock changes) from offline
async function syncProduct(tx: Prisma.TransactionClient, productData: z.infer<typeof ProductSyncPayloadSchema> | z.infer<typeof ProductInputSchema>, action: string, businessId: string) {
  if (action === 'create') {
    if (
      "name" in productData &&
      "category" in productData &&
      "buyingPrice" in productData &&
      "sellingPrice" in productData
    ) {
      const {
        id,
        barcode,
        name,
        nameBn,
        category,
        buyingPrice,
        sellingPrice,
        unit,
        currentStock,
        minStockLevel,
        isActive,
      } = productData as { id: string, barcode?: string, name: string, nameBn?: string, category: string, buyingPrice: number, sellingPrice: number, unit: string, currentStock: number, minStockLevel: number, isActive: boolean };

      // Check if product already exists (prevent duplicates)
      if (id) {
        const existing = await tx.product.findFirst({ where: { id, businessId } });
        if (existing) {
          return existing;
        }
      }

      const created = await tx.product.create({
        data: {
          id,
          businessId,
          barcode: barcode || null,
          name,
          nameBn: nameBn || null,
          category,
          buyingPrice,
          sellingPrice,
          unit,
          currentStock,
          minStockLevel,
          isActive,
        },
      });

      if (Number(currentStock) > 0) {
        await tx.stockHistory.create({
          data: {
            businessId,
            productId: created.id,
            changeType: 'OPENING',
            quantity: Number(currentStock),
            reason: 'Opening stock on offline product creation',
            referenceId: created.id,
          },
        });
      }

      return created;
    }

    throw new SyncRejection("Invalid product data for create action");
  } else if (action === "update") {
    if ("productId" in productData && "quantityChange" in productData) {
      const delta = productData as z.infer<typeof StockDeltaSyncPayloadSchema>;
      const unitCost = delta.unitCost ?? delta.purchasePrice;

      // P1-D: every offline stock movement goes through the canonical inventory
      // service — row lock, explicit underflow rejection, WAC on receipts,
      // honest change type, stock history and audit, all inside this
      // transaction. A movement that cannot be applied stays visibly failed
      // instead of being acknowledged as "synced".
      try {
        await applyStockMovementTx(tx, {
          businessId,
          productId: delta.productId,
          quantityChange: Number(delta.quantityChange),
          unitCost: unitCost ?? null,
          reason: delta.reason ?? "Offline sync stock movement",
        });
      } catch (error) {
        if (error instanceof DomainError) {
          if (error.code === ERROR_CODES.INSUFFICIENT_STOCK) {
            throw new SyncRejection(`CONFLICT: ${error.message}`);
          }
          throw new SyncRejection(error.message);
        }
        throw error;
      }

      return tx.product.findFirstOrThrow({ where: { id: delta.productId, businessId } });
    }

    // fallback to update entire object if no quantityChange provided
    if (
      "name" in productData &&
      "category" in productData &&
      "buyingPrice" in productData &&
      "sellingPrice" in productData
    ) {
      const {
        id,
        barcode,
        name,
        nameBn,
        category,
        buyingPrice,
        sellingPrice,
        unit,
        currentStock,
        minStockLevel,
        isActive,
      } = productData as { id: string, barcode?: string, name: string, nameBn?: string, category: string, buyingPrice: number, sellingPrice: number, unit: string, currentStock: number, minStockLevel: number, isActive: boolean };

      if (!id) {
        throw new SyncRejection("Product ID is required for update sync");
      }

      const existing = await tx.product.findFirst({ where: { id, businessId } });
      if (existing) {
        const previousStock = Number(existing.currentStock);
        const newStock = Number(currentStock);
        const delta = Number.isFinite(newStock) ? newStock - previousStock : 0;

        // MP-29: offline product edit must NOT overwrite server stock/cost.
        // Stock moves only via quantityChange/stock-entry (WAC + history).
        // A name fix from a stale device must never rewind server stock.
        const result = await tx.product.update({
          where: { id },
          data: {
            barcode: barcode || null,
            name,
            nameBn: nameBn || null,
            category,
            sellingPrice,
            unit,
            minStockLevel,
            isActive,
          },
        });

        // MP-29: stock intentionally untouched — no ADJUSTMENT history here.
        // Stock moves only via quantityChange/stock-entry paths.
        void previousStock; void newStock; void delta;

        return result;
      }

      const created = await tx.product.create({
        data: {
          id,
          businessId,
          barcode: barcode || null,
          name,
          nameBn: nameBn || null,
          category,
          buyingPrice,
          sellingPrice,
          unit,
          currentStock,
          minStockLevel,
          isActive,
        },
      });

      if (Number(currentStock) > 0) {
        await tx.stockHistory.create({
          data: {
            businessId,
            productId: created.id,
            changeType: 'OPENING',
            quantity: Number(currentStock),
            reason: 'Opening stock on offline product creation',
            referenceId: created.id,
          },
        });
      }

      return created;
    }

    throw new SyncRejection("Invalid product data payload");
  }

  throw new SyncRejection(`Unknown action: ${action}`);
}

// PUT /api/sync - Mark sync item as complete
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ctx = await requireBusinessContext(authResult.session);
  if (ctx instanceof NextResponse) return ctx;
  // MP-27: marking items synced rewrites sync state — require sales.create.
  const denied = checkPermission(ctx, 'sales.create');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const body = await request.json();
    const { id, error } = body;

    if (error) {
      // Log sync error
      await db.syncQueue.updateMany({
        where: { id, businessId },
        data: {
          retryCount: { increment: 1 },
          error,
        },
      });
    } else {
      // Mark as synced
      await db.syncQueue.updateMany({
        where: { id, businessId },
        data: {
          synced: true,
          syncedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Error updating sync status:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update sync status" },
      { status: 500 },
    );
  }
}

