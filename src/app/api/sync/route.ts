// ============================================================================
// Sync API Route - Offline-First Synchronization
// Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
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
const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

const ProductSyncPayloadSchema = z.union([
  ProductInputSchema,
  z.object({
    productId: z.string(),
    quantityChange: z.number(),
  }),
]);

import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext } from "@/lib/tenant";

/** Thrown for business-rule/validation failures — surfaced as HTTP 4xx. */
class SyncRejection extends Error {}

// GET /api/sync - Get pending sync items or sync status
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
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

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const businessId = ctx.business.id;

  try {
    const idempotencyKey = request.headers.get("X-Idempotency-Key");
    if (!idempotencyKey) {
      return NextResponse.json(
        { success: false, error: "Missing X-Idempotency-Key header" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { actionType, payload, businessId: payloadBusinessId } = body;

    // Multi-tenant security: forbid cross-tenant sync queues
    if (payloadBusinessId && payloadBusinessId !== businessId) {
      return NextResponse.json(
        { success: false, error: "Cross-tenant sync forbidden" },
        { status: 403 },
      );
    }

    if (!actionType || !payload) {
      return NextResponse.json(
        { success: false, error: "Missing actionType or payload" },
        { status: 400 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      const existingSync = await tx.syncQueue.findUnique({
        where: { idempotencyKey },
      });

      if (existingSync && existingSync.synced) {
        return {
          cached: true,
          data: existingSync.result,
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
          operationResult = await syncSale(tx, saleResult.data, "create", businessId, ctx.role);
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

      // ⚠️ CRITICAL: Use upsert to handle idempotency correctly
      // If same idempotencyKey appears twice, we update (don't create duplicate)
      await tx.syncQueue.upsert({
        where: { idempotencyKey },
        update: {
          synced: true,
          syncedAt: new Date(),
          result: operationResult as any,
          entityId, // Update entity_id on retry
        },
        create: {
          id: uuidv4(),
          businessId,
          idempotencyKey,
          entityType: actionType,
          entityId, // Set entity_id to track which entity this syncs
          action: "sync",
          payload: payload as any,
          synced: true,
          syncedAt: new Date(),
          retryCount: 0,
          result: operationResult as any,
        },
      });

      return { cached: false, data: operationResult };
    });

    // Log audit for successful offline sale sync
    if (actionType === "sale:create" && result.data && !result.cached) {
      await logAudit({
        businessId,
        userId: (result.data as { userId?: string }).userId || undefined,
        action: 'CREATE_SALE',
        entityType: 'Sale',
        entityId: (result.data as { id: string }).id,
        details: { 
          invoiceNumber: (result.data as { invoiceNumber: string }).invoiceNumber,
          totalAmount: (result.data as { totalAmount: number }).totalAmount,
          syncMethod: 'offline-sync'
        },
        ipAddress: getIp(request),
      });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      cached: result.cached,
      message: `${actionType} synced successfully`,
    });
  } catch (error: unknown) {
    console.error("Error syncing data:", error);
    if (error instanceof SyncRejection) {
      const status = error.message.startsWith("CONFLICT:") ? 409 : 400;
      return NextResponse.json(
        { success: false, error: error.message },
        { status },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync data",
      },
      { status: 500 },
    );
  }
}
// Sync sale from offline
async function syncSale(tx: Prisma.TransactionClient, saleData: z.infer<typeof SaleInputSchema>, action: string, businessId: string, role: string) {
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

    const itemTotalMismatch = findSaleItemTotalMismatch(saleData.items);
    if (itemTotalMismatch) {
      throw new SyncRejection(itemTotalMismatch);
    }

    // 1. Lock products + plan stock (FOR UPDATE, auto-adjust, blended COGS)
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

    // 3. Validate basic sale data
    if (!saleData.items || saleData.items.length === 0) {
      throw new SyncRejection("Sale must have at least one item");
    }

    if ((saleData.totalAmount || 0) < 0) {
      throw new SyncRejection("Total amount cannot be negative");
    }
    const totalAmount = toMoneyDecimal(saleData.totalAmount || 0);
    const amountReceived = toMoneyDecimal(saleData.amountReceived || 0);
    const amountPaid = toMoneyDecimal(saleData.amountPaid || 0);
    const prepaidToUse = toMoneyDecimal(saleData.prepaidAmountUsed || 0);
    const changeAsPrepayment = toMoneyDecimal(saleData.changeAsPrepayment || 0);
    const debtRepaymentAmount = toMoneyDecimal(saleData.debtRepaymentAmount || 0);
    const externalPaidAmount = subtractMoney(amountPaid, prepaidToUse);

    if (amountPaid.gt(totalAmount)) {
      throw new SyncRejection(`Amount paid (${amountPaid.toString()}) cannot exceed sale total (${totalAmount.toString()})`);
    }

    if (prepaidToUse.gt(amountPaid)) {
      throw new SyncRejection("Prepaid amount cannot exceed total amount paid");
    }

    if (!saleData.customerId && (prepaidToUse.gt(0) || changeAsPrepayment.gt(0))) {
      throw new SyncRejection("Prepaid balance can only be used with a selected customer");
    }

    if (
      (changeAsPrepayment.gt(0) || debtRepaymentAmount.gt(0)) &&
      amountReceived.lt(addMoney(externalPaidAmount, addMoney(changeAsPrepayment, debtRepaymentAmount)))
    ) {
      throw new SyncRejection("Received amount does not cover sale payment, prepaid change, and due clearance");
    }

    // Bug 3 fix: determine payment method and preserve cash/UPI breakdown
    const pMethodRaw = saleData.paymentMethod ? String(saleData.paymentMethod).toUpperCase() : 'CASH';
    const cashAmt = (saleData as any).cashAmount ?? null;
    const upiAmt = (saleData as any).upiAmount ?? null;

    // Split-payment consistency for MIXED sales.
    if (pMethodRaw === 'MIXED' && (cashAmt != null || upiAmt != null)) {
      const cash = toMoneyDecimal(cashAmt || 0);
      const upi = toMoneyDecimal(upiAmt || 0);
      if (cash.lt(0) || upi.lt(0)) {
        throw new SyncRejection('Cash/UPI amounts cannot be negative');
      }
      if (!addMoney(cash, upi).equals(externalPaidAmount)) {
        throw new SyncRejection('Mixed payment: cash + UPI must equal the externally paid amount');
      }
    }

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

    // CREATE PHASE: sale rows use blended cost (owned @ WAC, shortage @ 0)
    let sale: any;
    try {
      sale = await tx.sale.create({
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
    } catch (createErr: any) {
      if (
        createErr?.message?.includes('SaleStatus') ||
        createErr?.message?.includes('shift_id') ||
        createErr?.code === '42704' ||
        createErr?.code === '42703'
      ) {
        console.warn('[sync] Prisma sale.create failed due to schema mismatch, falling back to raw query:', createErr.message);
        const saleId = saleData.id || uuidv4();
        const pMethod = (saleData.paymentMethod ? String(saleData.paymentMethod).toUpperCase() : 'CASH');
        const pStatus = (saleData.paymentStatus ? String(saleData.paymentStatus).toUpperCase() : 'PAID');
        const sStatus = (saleData.status ? String(saleData.status).toUpperCase() : 'COMPLETED');

        await tx.$executeRaw`
          INSERT INTO "sales" (
            "id", "business_id", "invoice_number", "user_id", "customer_id",
            "subtotal", "discount", "tax", "total_amount", "amount_paid",
            "cash_amount", "upi_amount",
            "payment_method", "payment_status", "status", "notes", "offline_synced",
            "created_at", "updated_at"
          ) VALUES (
            ${saleId}, ${businessId}, ${saleData.invoiceNumber}, ${saleData.userId || null}, ${saleData.customerId || null},
            ${saleData.subtotal || 0}, ${saleData.discount || 0}, ${saleData.tax || 0}, ${saleData.totalAmount || 0}, ${saleData.amountPaid || 0},
            ${cashAmt}, ${upiAmt},
            ${pMethod}::"PaymentMethod", ${pStatus}::"PaymentStatus", ${sStatus}, ${saleData.notes || null}, true,
            NOW(), NOW()
          )
        `;

        for (const item of saleData.items) {
          const itemId = uuidv4();
          const costPrice = costPriceForProduct(plansByProductId, item.productId, 0);
          await tx.$executeRaw`
            INSERT INTO "sale_items" (
              "id", "sale_id", "product_id", "product_name", "quantity",
              "unit_price", "cost_price_at_sale", "total_price", "discount", "tax_rate"
            ) VALUES (
              ${itemId}, ${saleId}, ${item.productId}, ${item.productName}, ${item.quantity},
              ${item.unitPrice}, ${costPrice}, ${item.totalPrice}, 0, 0
            )
          `;
        }

        sale = {
          id: saleId,
          businessId,
          invoiceNumber: saleData.invoiceNumber,
          userId: saleData.userId,
          customerId: saleData.customerId,
          totalAmount: saleData.totalAmount,
          items: saleData.items,
        };
      } else {
        throw createErr;
      }
    }

    await applySaleStockPlans(tx, {
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      businessId,
      plans: Array.from(plansByProductId.values()),
      historyReasonPrefix: "Offline sync sale",
    });

    // Attach auto-adjust metadata for callers / audit
    (sale as { autoAdjusted?: typeof autoAdjusted }).autoAdjusted = autoAdjusted;

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

             await tx.customer.update({
                where: { id: saleData.customerId },
                data: dataUpdate
             });
          }
        }
      }

      // Update product popularity for synced sale
      try {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        await Promise.all(saleData.items.map(async (item) => {
          const qty = Number(item.quantity);
          const revenue = Number(item.totalPrice);
          
          await tx.productPopularity.upsert({
            where: {
              productId_periodStart: {
                productId: item.productId,
                periodStart: periodStart
              }
            },
            update: {
              monthlySalesCount: { increment: qty },
              totalRevenue: { increment: revenue },
              periodEnd: periodEnd,
              updatedAt: new Date()
            },
            create: {
              businessId,
              productId: item.productId,
              monthlySalesCount: qty,
              totalRevenue: revenue,
              periodStart: periodStart,
              periodEnd: periodEnd
            }
          });
        }));
      } catch (popError) {
        console.error("Failed to update product popularity in sync:", popError);
      }

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
      const { productId, quantityChange } = productData;

      // Lock product row
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM products WHERE id = ${productId} AND business_id = ${businessId} FOR UPDATE
      `;
      if (!locked[0]) {
        throw new SyncRejection(`Product ${productId} not found during stock sync`);
      }

      let updated;
      if (quantityChange < 0) {
        const result = await tx.product.updateMany({
          where: { id: productId, businessId, currentStock: { gte: Math.abs(quantityChange) } },
          data: { currentStock: { decrement: Math.abs(quantityChange) }, updatedAt: new Date() },
        });
        updated = await tx.product.findFirstOrThrow({ where: { id: productId, businessId } });
        // Only write history when stock actually changed — avoids ledger drift
        if (result.count === 0) {
          return updated;
        }
      } else {
        await tx.product.updateMany({
          where: { id: productId, businessId },
          data: { currentStock: { increment: quantityChange }, updatedAt: new Date() },
        });
        updated = await tx.product.findFirstOrThrow({ where: { id: productId, businessId } });
      }

      await tx.stockHistory.create({
        data: {
          businessId,
          productId,
          changeType: quantityChange > 0 ? "PURCHASE" : "SALE",
          quantity: quantityChange,
          reason: "Offline sync",
        },
      });

      return updated;
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

        const result = await tx.product.update({
          where: { id },
          data: {
            barcode: barcode || null,
            name,
            nameBn: nameBn || null,
            category,
            buyingPrice,
            sellingPrice,
            unit,
            currentStock: newStock,
            minStockLevel,
            isActive,
          },
        });

        // Keep the inventory audit trail consistent when an offline edit changes stock.
        if (delta !== 0) {
          await tx.stockHistory.create({
            data: {
              businessId,
              productId: id,
              changeType: 'ADJUSTMENT',
              quantity: delta,
              reason: `Offline product edit stock adjustment (${previousStock} → ${newStock})`,
              referenceId: id,
            },
          });
        }

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

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

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

