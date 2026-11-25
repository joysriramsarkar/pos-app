export const dynamic = "force-dynamic";
// ============================================================================
// Sales API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { SaleItem } from "@prisma/client";

interface SaleItemWithProduct extends SaleItem {
  product?: { unit: string };
}
import { generateServerInvoiceNumber } from "@/lib/invoice";
import {
  SaleInputSchema,
  SalesListQuerySchema,
  SaleStatusUpdateSchema,
} from "@/schemas";
import { addMoney, subtractMoney, toMoneyDecimal, toMoneyNumber } from "@/lib/money";
import Decimal from "decimal.js";
import { findSaleItemTotalMismatch } from "@/lib/sale-calculations";
import {
  applySaleStockPlans,
  costPriceForProduct,
  lockAndPlanSaleStock,
} from "@/lib/sale-stock";

import { z } from "zod";
import { withBusinessContext, type RouteContext, type TenantContext } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { toClientError } from "@/lib/api-errors";
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  fingerprintFor,
  IdempotencyConflict,
  IdempotencyInProgress,
} from "@/lib/idempotency";
import { enforceRateLimit, salesCreateLimiter } from "@/lib/rate-limit";
import { checkSalePricingAuthority } from "@/lib/sale-pricing";
import { computeSaleTotals, SaleValidationError } from "@/domain/sales/sale-totals";

const getIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  undefined;

type CustomerLockRow = {
  id: string;
  totalDue: Prisma.Decimal | number | string;
  prepaidBalance: Prisma.Decimal | number | string;
};

// GET /api/sales - Fetch sales
export const GET = withBusinessContext(handleGet, { permissionCode: "sales.view" });

async function handleGet(request: NextRequest, ctx: RouteContext & { tenant: TenantContext }) {
  const businessId = ctx.tenant.business.id;
  try {
    const { searchParams } = new URL(request.url);
    const parsed = SalesListQuerySchema.safeParse({
      id: searchParams.get("id") ?? undefined,
      invoiceNumber: searchParams.get("invoiceNumber") ?? undefined,
      customerId: searchParams.get("customerId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters" },
        { status: 400 },
      );
    }

    const { id, invoiceNumber, customerId, status, dateFrom, dateTo, page, limit } =
      parsed.data;

    if (id) {
      const sale = await db.sale.findFirst({
        where: { id, businessId },
        include: {
          items: { include: { product: { select: { unit: true } } } },
          customer: true,
          user: true,
        },
      });

      if (!sale) {
        return NextResponse.json(
          { success: false, error: "Sale not found" },
          { status: 404 },
        );
      }

      const saleWithUnit = {
        ...sale,
        items: sale.items.map((item) => ({
          ...item,
          unit: (item as SaleItemWithProduct).product?.unit ?? "",
        })),
      };
      return NextResponse.json({ success: true, data: saleWithUnit });
    }

    const where: Prisma.SaleWhereInput = { businessId };

    if (invoiceNumber) {
      const q = invoiceNumber.trim();
      if (q.length > 0) {
        where.OR = [
          { invoiceNumber: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { customer: { phone: { contains: q, mode: "insensitive" } } },
          { items: { some: { productName: { contains: q, mode: "insensitive" } } } },
        ];
      }
    }

    if (customerId) where.customerId = customerId;
    if (status) where.status = (status.toUpperCase() as any);

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!Number.isNaN(from.getTime())) where.createdAt.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!Number.isNaN(to.getTime())) where.createdAt.lte = to;
      }
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          customerId: true,
          userId: true,
          subtotal: true,
          discount: true,
          tax: true,
          totalAmount: true,
          amountPaid: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
          cashAmount: true,
          upiAmount: true,
          notes: true,
          offlineSynced: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              saleId: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              createdAt: true,
              product: { select: { unit: true } },
            },
          },
          customer: { select: { id: true, name: true, nameEn: true, phone: true } },
          user: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sale.count({ where }),
    ]);

    const salesWithUnit = sales.map((sale) => ({
      ...sale,
      items: sale.items.map((item) => ({
        ...item,
        unit: (item as SaleItemWithProduct).product?.unit ?? "",
      })),
    }));

    return NextResponse.json({
      success: true,
      data: salesWithUnit,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=15',
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching sales:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sales" },
      { status: 500 },
    );
  }
}

// POST /api/sales - Create new sale
export const POST = withBusinessContext(handlePost, { permissionCode: "sales.create" });

async function handlePost(request: NextRequest, ctx: RouteContext & { tenant: TenantContext }) {
  try {
    const businessId = ctx.tenant.business.id;
    const userId = ctx.tenant.user.id;
    const rateKey = userId || getIp(request) || "unknown";
    const rate = await enforceRateLimit(`sales:create:${rateKey}`, {
      limit: 60,
      windowMs: 60_000,
      redisLimiter: salesCreateLimiter,
    });
    if (!rate.success) {
      return NextResponse.json(
        { success: false, error: "Too many sale requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body: JSON parsing failed" },
        { status: 400 },
      );
    }

    const result = SaleInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors).flat().join(", ");
      return NextResponse.json(
        { success: false, error: errors || "Validation failed" },
        { status: 400 },
      );
    }

    const validatedData = result.data;
    const { items: validatedItems, customerId, paymentMethod, notes } = validatedData;

    // P0-A: a cashier retry after a timeout must not create a second sale.
    // The key is claimed inside the sale transaction and bound to a canonical
    // hash of this body; a different body reusing the key is rejected.
    const rawIdempotencyKey = request.headers.get("X-Idempotency-Key");
    let idempotencyKey: string | null = null;
    if (rawIdempotencyKey !== null) {
      const parsedKey = z.string().min(8).max(128).safeParse(rawIdempotencyKey);
      if (!parsedKey.success) {
        return NextResponse.json(
          { success: false, error: "Invalid X-Idempotency-Key header" },
          { status: 400 },
        );
      }
      idempotencyKey = parsedKey.data;
    }
    const idempotencyFingerprint = fingerprintFor("sale:create", validatedData);

    // MP-21: canonical totals core shared with /api/sync (identical math + messages).
    let totals;
    try {
      totals = computeSaleTotals({
        items: validatedItems,
        discount: validatedData.discount,
        tax: validatedData.tax,
        amountPaid: validatedData.amountPaid,
        amountReceived: validatedData.amountReceived,
        prepaidAmountUsed: validatedData.prepaidAmountUsed,
        changeAsPrepayment: validatedData.changeAsPrepayment,
        debtRepaymentAmount: validatedData.debtRepaymentAmount,
        customerId,
        paymentMethod,
        cashAmount: validatedData.cashAmount,
        upiAmount: validatedData.upiAmount,
      });
    } catch (e) {
      if (e instanceof SaleValidationError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
      throw e;
    }
    const {
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      amountReceived,
      amountPaidValue,
      prepaidToUse,
      changeAsPrepayment,
      debtRepaymentAmount,
      externalPaidAmount,
      paymentStatus: computedPaymentStatus,
    } = totals;
    const paymentStatus: any = computedPaymentStatus;

    // Server-authoritative pricing / discount authorization.
    const priceRows = await db.product.findMany({
      where: { businessId, id: { in: validatedItems.map((i) => i.productId) } },
      select: { id: true, sellingPrice: true },
    });
    const sellingPriceByProductId = new Map(
      priceRows.map((p) => [p.id, Number(p.sellingPrice)]),
    );
    const pricingCheck = checkSalePricingAuthority(
      validatedItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        totalPrice: Number(item.totalPrice),
      })),
      discountAmount.toNumber(),
      sellingPriceByProductId,
      ctx.tenant.role,
    );
    if (!pricingCheck.ok) {
      return NextResponse.json({ success: false, error: pricingCheck.message }, { status: 403 });
    }

    // MP-39/H1: invoice numbers are UUID-based (collision ~impossible), but the
    // unique(businessId, invoiceNumber) constraint is the final authority.
    // On the freak P2002, regenerate once and retry (bounded — never a loop).
    let invoiceNumber = await generateServerInvoiceNumber();
    let saleResult: Awaited<ReturnType<typeof runSaleTransaction>> | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        saleResult = await runSaleTransaction(invoiceNumber);
        break;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        const target = (e as { meta?: { target?: unknown } })?.meta?.target;
        const isInvoiceCollision =
          code === "P2002" && Array.isArray(target) && target.includes("invoiceNumber");
        if (isInvoiceCollision && attempt === 0) {
          console.warn("[sales] invoice collision, regenerating once");
          invoiceNumber = await generateServerInvoiceNumber();
          continue;
        }
        // Idempotency outcomes are NOT failures — surface them as 409 and let
        // the client either back off (in progress) or mint a fresh key (reuse).
        if (e instanceof IdempotencyInProgress) {
          return NextResponse.json(
            { success: false, code: "INPROGRESS", error: "Same sale is already being processed. Retry shortly." },
            { status: 409, headers: { "Retry-After": "5" } },
          );
        }
        if (e instanceof IdempotencyConflict) {
          return NextResponse.json(
            {
              success: false,
              code: "IDEMPOTENCY_KEY_REUSED",
              error: "This idempotency key was already used for a different sale.",
            },
            { status: 409 },
          );
        }
        throw e;
      }
    }
    if (!saleResult) throw new Error("Sale transaction failed");

    async function runSaleTransaction(txInvoiceNumber: string) {
      return db.$transaction(
      async (tx) => {
        // P0-A: claim BEFORE any money/stock mutation. Claim + finalize commit
        // with the sale, so a retry can never insert a second sale and a
        // rollback never leaves a stuck claim behind.
        const claim = await claimIdempotencyTx<{ saleId?: string; invoiceNumber?: string }>(
          tx,
          businessId,
          "sale:create",
          idempotencyKey,
          {
            fingerprint: idempotencyFingerprint,
            requestPayload: validatedData,
            entityType: "Sale",
          },
        );
        if (claim.replay) {
          return { replay: true as const, cached: claim.result };
        }

        // Lock products first (sorted FOR UPDATE), plan auto-adjust + blended COGS
        const { plansByProductId, autoAdjusted } = await lockAndPlanSaleStock(
          tx,
          validatedItems,
          businessId,
          false, // allow auto-adjust shortage for loose goods / untracked inventory
        );

        const saleCreateData: Prisma.SaleCreateInput = {
          business: { connect: { id: businessId } },
          invoiceNumber,
          subtotal,
          discount: discountAmount,
          tax: taxAmount,
          totalAmount,
          amountPaid: amountPaidValue,
          paymentMethod: (paymentMethod ? paymentMethod.toUpperCase() : "CASH") as any,
          cashAmount: validatedData.cashAmount ?? null,
          upiAmount: validatedData.upiAmount ?? null,
          paymentStatus,
          status: "COMPLETED",
          notes: notes || null,
          offlineSynced: true,
          items: {
            create: validatedItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              // Owned qty at WAC; shortage (auto-adjusted) at 0 cost
              costPriceAtSale: costPriceForProduct(plansByProductId, item.productId, 0),
              totalPrice: item.totalPrice,
            })),
          },
        };

        if (customerId) saleCreateData.customer = { connect: { id: customerId } };
        if (userId) saleCreateData.user = { connect: { id: userId } };

        const newSale = await tx.sale.create({
          data: saleCreateData,
          include: {
            items: { include: { product: { select: { unit: true } } } },
            customer: true,
            user: true,
          },
        });

        await applySaleStockPlans(tx, {
          saleId: newSale.id,
          invoiceNumber: newSale.invoiceNumber,
          businessId,
          plans: Array.from(plansByProductId.values()),
          historyReasonPrefix: "Sale",
        });

        if (customerId) {
          const customerRaw = await tx.$queryRaw<CustomerLockRow[]>`
            SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
            FROM customers
            WHERE id = ${customerId} AND business_id = ${businessId}
            FOR UPDATE
          `;
          const customer = customerRaw[0];
          if (!customer) throw new Error(`Customer ${customerId} not found`);

          const currentTotalDue = toMoneyDecimal(customer.totalDue);
          const currentPrepaidBalance = toMoneyDecimal(customer.prepaidBalance);

          if (debtRepaymentAmount.gt(currentTotalDue)) {
            throw new Error(`Debt repayment amount (${debtRepaymentAmount.toString()}) cannot exceed current total due (${currentTotalDue.toString()})`);
          }

          const dueAmount = subtractMoney(totalAmount, amountPaidValue);

          let totalDueIncrement = new Decimal(0);
          let totalDueDecrement = new Decimal(0);
          const prepaidBalanceIncrement = changeAsPrepayment;
          const prepaidBalanceDecrement = prepaidToUse;
          let balanceAfterPayment = currentTotalDue;

          if (prepaidToUse.gt(0)) {
            if (currentPrepaidBalance.lt(prepaidToUse)) {
              throw new Error(
                `Insufficient prepaid balance. Available: ${currentPrepaidBalance}, Tried to use: ${prepaidToUse}`,
              );
            }
            await tx.ledgerEntry.create({
              data: {
                businessId,
                customerId,
                entryType: "PREPAYMENT_USED",
                amount: prepaidToUse,
                balanceAfter: currentTotalDue,
                description: `Prepaid used for sale: ${newSale.invoiceNumber}`,
                referenceId: newSale.id,
              },
            });
          }

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
                  customerId,
                  entryType: "CREDIT",
                  amount: creditAmount,
                  balanceAfter: creditBalanceAfter,
                  description: `Credit purchase: ${newSale.invoiceNumber}`,
                  referenceId: newSale.id,
                },
              });
            }
            if (externalPaidAmount.gt(0)) {
              await tx.ledgerEntry.create({
                data: {
                  businessId,
                  customerId,
                  entryType: "DEBIT",
                  amount: externalPaidAmount,
                  balanceAfter: balanceAfterPayment,
                  description: `Payment for sale: ${newSale.invoiceNumber}`,
                  referenceId: newSale.id,
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
                customerId,
                entryType: "DEBIT",
                amount: debtRepaymentAmount,
                balanceAfter: balanceAfterPayment,
                description: `Due clearance during sale: ${newSale.invoiceNumber}`,
                referenceId: newSale.id,
              },
            });
          }

          if (changeAsPrepayment.gt(0)) {
            await tx.ledgerEntry.create({
              data: {
                businessId,
                customerId,
                entryType: "PREPAYMENT_ADDED",
                amount: changeAsPrepayment,
                balanceAfter: balanceAfterPayment,
                description: `Change added as prepaid: ${newSale.invoiceNumber}`,
                referenceId: newSale.id,
              },
            });
          }

          if (
            totalDueIncrement.gt(0) ||
            totalDueDecrement.gt(0) ||
            prepaidBalanceIncrement.gt(0) ||
            prepaidBalanceDecrement.gt(0)
          ) {
            const dataUpdate: Prisma.CustomerUpdateInput = { updatedAt: new Date() };
            if (totalDueIncrement.gt(0) || totalDueDecrement.gt(0)) {
              const newTotalDue = currentTotalDue.plus(totalDueIncrement).minus(totalDueDecrement);
              dataUpdate.totalDue = newTotalDue.gt(0) ? newTotalDue : new Decimal(0);
            }
            if (prepaidBalanceIncrement.gt(0) || prepaidBalanceDecrement.gt(0)) {
              const newPrepaidBalance = currentPrepaidBalance.plus(prepaidBalanceIncrement).minus(prepaidBalanceDecrement);
              dataUpdate.prepaidBalance = newPrepaidBalance.gt(0) ? newPrepaidBalance : new Decimal(0);
            }

            await tx.customer.updateMany({
              where: { id: customerId, businessId },
              data: dataUpdate,
            });
          }
        }

        // P1-C: the financial audit row commits with the sale. A failed audit
        // insert rolls the whole sale back instead of silently leaving money
        // movement without a trace.
        await logAudit(
          {
            userId: userId ?? undefined,
            businessId,
            action: "CREATE_SALE",
            entityType: "Sale",
            entityId: newSale.id,
            details: {
              invoiceNumber: newSale.invoiceNumber,
              totalAmount: toMoneyNumber(newSale.totalAmount),
              itemCount: validatedItems.length,
              autoAdjustedCount: autoAdjusted.length,
              autoAdjusted: autoAdjusted.map((a) => ({
                productId: a.productId,
                shortageQty: a.shortageQty,
                stockBefore: a.stockBefore,
              })),
            },
            ipAddress: getIp(request),
          },
          tx,
        );

        if (claim.claim) {
          await finalizeIdempotencyTx(
            tx,
            claim.claim,
            { saleId: newSale.id, invoiceNumber: newSale.invoiceNumber },
            { entityId: newSale.id },
          );
        }

        return {
          replay: false as const,
          sale: {
            ...newSale,
            items: newSale.items.map((item) => ({
              ...item,
              unit: (item as SaleItemWithProduct).product?.unit ?? "",
            })),
          },
          autoAdjusted,
        };
      },
      { timeout: 60000, maxWait: 10000 },
      );
      }

    if (saleResult.replay) {
      const cached = (saleResult.cached ?? {}) as { saleId?: string };
      const replaySale = cached.saleId
        ? await db.sale.findFirst({
            where: { id: cached.saleId, businessId },
            include: {
              items: { include: { product: { select: { unit: true } } } },
              customer: true,
              user: true,
            },
          })
        : null;

      if (!replaySale) {
        return NextResponse.json(
          { success: false, error: "Previous sale result is no longer available" },
          { status: 409 },
        );
      }

      return NextResponse.json({
        success: true,
        data: replaySale,
        autoAdjusted: [],
        idempotent: true,
        message: "Sale already recorded — returning the original result",
      });
    }

    const { sale, autoAdjusted } = saleResult;

    // Update product popularity in background
    try {
      const now = new Date();
      // Use the first day of the current month as the period start to allow upserting
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      await Promise.all(validatedItems.map(async (item) => {
        const qty = Number(item.quantity);
        const revenue = Number(item.totalPrice);
        
        await db.productPopularity.upsert({
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
      console.error("Failed to update product popularity:", popError);
    }

    return NextResponse.json({
      success: true,
      data: sale,
      autoAdjusted,
      message:
        autoAdjusted.length > 0
          ? "Sale completed (stock auto-adjusted for some items)"
          : "Sale completed successfully",
    });
  } catch (error: unknown) {
    console.error("Error creating sale:", error);
    const { message, status } = toClientError(error, "Failed to create sale");
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// PUT /api/sales - Update sale (cancel/refund)
export const PUT = withBusinessContext(handlePut, { permissionCode: "sales.edit" });

async function handlePut(request: NextRequest, ctx: RouteContext & { tenant: TenantContext }) {
  try {
    const businessId = ctx.tenant.business.id;
    const userId = ctx.tenant.user.id;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const parsed = SaleStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = Object.values(parsed.error.flatten().fieldErrors).flat().join(", ");
      return NextResponse.json(
        { success: false, error: errors || "Validation failed" },
        { status: 400 },
      );
    }

    const { id, status, reason } = parsed.data;
    const targetStatus =
      status.toUpperCase() === "CANCELLED" ? "CANCELLED" : "REFUNDED";

    const rawIdempotencyKey = request.headers.get("X-Idempotency-Key");
    let idempotencyKey: string | null = null;
    if (rawIdempotencyKey !== null) {
      const parsedKey = z.string().min(8).max(128).safeParse(rawIdempotencyKey);
      if (!parsedKey.success) {
        return NextResponse.json(
          { success: false, error: "Invalid X-Idempotency-Key header" },
          { status: 400 },
        );
      }
      idempotencyKey = parsedKey.data;
    }
    const fingerprint = fingerprintFor("sale:cancel", {
      id,
      status: targetStatus,
      reason: reason ?? null,
    });

    let outcome:
      | { replay: true; cached: { saleId?: string; status?: string } | null }
      | { replay: false; saleId: string };

    try {
      outcome = await db.$transaction(
        async (tx) => {
          const claim = await claimIdempotencyTx<{ saleId?: string; status?: string }>(
            tx,
            businessId,
            "sale:cancel",
            idempotencyKey,
            {
              fingerprint,
              requestPayload: { id, status: targetStatus, reason: reason ?? null },
              entityType: "Sale",
              entityId: id,
            },
          );
          if (claim.replay) return { replay: true as const, cached: claim.result };

          // P0-B: lock the sale row BEFORE reading its state. The state check,
          // the prior-returns check and the stock restore then all happen under
          // the same lock, so two concurrent cancels cannot both pass.
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM sales WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE
          `;
          if (!locked[0]) {
            throw Object.assign(new Error("Sale not found"), { status: 404 });
          }

          const existingSale = await tx.sale.findFirst({
            where: { id, businessId },
            include: { items: true, customer: true },
          });

          if (!existingSale) {
            throw Object.assign(new Error("Sale not found"), { status: 404 });
          }

          if (existingSale.status !== "COMPLETED") {
            throw Object.assign(
              new Error("Only completed sales can be cancelled or refunded"),
              { status: 409 },
            );
          }

          // Conditional transition from COMPLETED: the database arbitrates, so
          // a stale concurrent request can never re-apply the same refund.
          const transition = await tx.sale.updateMany({
            where: { id, businessId, status: "COMPLETED" },
            data: {
              status: targetStatus as any,
              notes: reason
                ? `${existingSale.notes || ""}\n${status}: ${reason}`
                : existingSale.notes,
              updatedAt: new Date(),
            },
          });
          if (transition.count === 0) {
            throw Object.assign(
              new Error("Sale state changed concurrently. Reload the sale and try again."),
              { status: 409 },
            );
          }

          // Do not restore stock already returned via SaleReturn / prior refunds
          const priorReturnItems = await tx.saleReturnItem.findMany({
            where: { saleItem: { saleId: id } },
            select: { productId: true, quantity: true },
          });

          if (priorReturnItems.length > 0) {
            throw Object.assign(
              new Error(
                "Cannot cancel/refund a sale that already has returns. Process remaining items via returns instead.",
              ),
              { status: 409 },
            );
          }

          const productReturnQuantities = existingSale.items.reduce((acc, item) => {
            acc.set(item.productId, (acc.get(item.productId) || 0) + Number(item.quantity));
            return acc;
          }, new Map<string, number>());

          const productIds = Array.from(productReturnQuantities.keys()).sort();
          const quantities = productIds.map((pid) => productReturnQuantities.get(pid) || 0);

          if (productIds.length > 0) {
            // Sorted product locks — deadlock-safe against concurrent sales.
            for (let i = 0; i < productIds.length; i++) {
              if (quantities[i] <= 0) continue;
              await tx.$queryRaw`SELECT id FROM products WHERE id = ${productIds[i]} FOR UPDATE`;
              await tx.product.update({
                where: { id: productIds[i] },
                data: { currentStock: { increment: quantities[i] }, updatedAt: new Date() },
              });
            }

            await tx.stockHistory.createMany({
              data: productIds
                .map((pid, index) => ({
                  businessId,
                  productId: pid,
                  changeType: "RETURN" as const,
                  quantity: quantities[index],
                  reason: `${status}: ${existingSale.invoiceNumber}`,
                  referenceId: existingSale.id,
                  saleId: existingSale.id,
                }))
                .filter((row) => row.quantity > 0),
            });
          }

          if (existingSale.customerId) {
            const [relatedLedgerEntries, customerRaw] = await Promise.all([
              tx.ledgerEntry.findMany({
                where: { customerId: existingSale.customerId, referenceId: existingSale.id },
                select: { entryType: true, amount: true, description: true },
              }),
              tx.$queryRaw<CustomerLockRow[]>`
                SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
                FROM customers
                WHERE id = ${existingSale.customerId}
                FOR UPDATE
              `,
            ]);

            const customer = customerRaw[0];
            if (!customer) throw new Error(`Customer ${existingSale.customerId} not found`);

            const prepaidUsedAmount = addMoney(
              ...relatedLedgerEntries
                .filter((e) => e.entryType === "PREPAYMENT_USED" || (e.entryType as any) === "prepayment-used")
                .map((e) => e.amount),
            );
            const changePrepaymentAmount = addMoney(
              ...relatedLedgerEntries
                .filter((e) => e.description?.startsWith("Change added as prepaid:"))
                .map((e) => e.amount),
            );
            const subDue = subtractMoney(existingSale.totalAmount, existingSale.amountPaid);
            const dueAmount = subDue.gt(0) ? subDue : new Decimal(0);

            const currentTotalDue = toMoneyDecimal(customer.totalDue);
            const currentPrepaidBalance = toMoneyDecimal(customer.prepaidBalance);

            // Floor due at 0 — absolute set avoids negative balance under concurrent collections
            const newTotalDue = dueAmount.gt(0)
              ? currentTotalDue.minus(dueAmount).gt(0)
                ? currentTotalDue.minus(dueAmount)
                : new Decimal(0)
              : currentTotalDue;
            const prepaidBalanceAdjustment = subtractMoney(
              prepaidUsedAmount,
              changePrepaymentAmount,
            );
            const addPrepaid = currentPrepaidBalance.plus(prepaidBalanceAdjustment);
            const newPrepaidBalance = addPrepaid.gt(0) ? addPrepaid : new Decimal(0);

            const customerUpdateData: Record<string, unknown> = { updatedAt: new Date() };
            if (dueAmount.gt(0)) customerUpdateData.totalDue = newTotalDue;
            if (!prepaidBalanceAdjustment.isZero()) {
              customerUpdateData.prepaidBalance = newPrepaidBalance;
            }

            if (dueAmount.gt(0) || !prepaidBalanceAdjustment.isZero()) {
              await tx.customer.update({
                where: { id: existingSale.customerId },
                data: customerUpdateData,
              });
            }

            if (dueAmount.gt(0)) {
              await tx.ledgerEntry.create({
                data: {
                  businessId,
                  customerId: existingSale.customerId,
                  entryType: "DEBIT",
                  amount: dueAmount,
                  balanceAfter: newTotalDue,
                  description: `${status}: reverse due for ${existingSale.invoiceNumber}`,
                  referenceId: existingSale.id,
                },
              });
            }
            if (prepaidUsedAmount.gt(0)) {
              await tx.ledgerEntry.create({
                data: {
                  businessId,
                  customerId: existingSale.customerId,
                  entryType: "PREPAYMENT_RESTORED",
                  amount: prepaidUsedAmount,
                  balanceAfter: newTotalDue,
                  description: `${status}: prepaid restored for ${existingSale.invoiceNumber}`,
                  referenceId: existingSale.id,
                },
              });
            }
            if (changePrepaymentAmount.gt(0)) {
              await tx.ledgerEntry.create({
                data: {
                  businessId,
                  customerId: existingSale.customerId,
                  entryType: "CREDIT",
                  amount: changePrepaymentAmount,
                  balanceAfter: newTotalDue,
                  description: `${status}: reverse prepaid change for ${existingSale.invoiceNumber}`,
                  referenceId: existingSale.id,
                },
              });
            }
          }

          // P1-C: the audit row commits with the cancellation/refund.
          await logAudit(
            {
              userId,
              businessId,
              action:
                targetStatus === "CANCELLED" ? "SALE_CANCELLED" : "SALE_REFUNDED",
              entityType: "Sale",
              entityId: id,
              details: {
                invoiceNumber: existingSale.invoiceNumber,
                status: targetStatus,
                reason: reason ?? null,
                restoredProductCount: productIds.length,
              },
              ipAddress: getIp(request),
            },
            tx,
          );

          if (claim.claim) {
            await finalizeIdempotencyTx(
              tx,
              claim.claim,
              { saleId: id, status: targetStatus },
              { entityId: id },
            );
          }

          return { replay: false as const, saleId: id };
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (txError) {
      if (txError instanceof IdempotencyInProgress) {
        return NextResponse.json(
          {
            success: false,
            code: "INPROGRESS",
            error: "Same request is already being processed. Retry shortly.",
          },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
      if (txError instanceof IdempotencyConflict) {
        return NextResponse.json(
          {
            success: false,
            code: "IDEMPOTENCY_KEY_REUSED",
            error: "This idempotency key was already used for a different request.",
          },
          { status: 409 },
        );
      }
      throw txError;
    }

    if (outcome.replay) {
      const cached = (outcome.cached ?? {}) as { saleId?: string };
      const replaySale = cached.saleId
        ? await db.sale.findFirst({
            where: { id: cached.saleId, businessId },
            include: { items: true },
          })
        : null;

      if (!replaySale) {
        return NextResponse.json(
          { success: false, error: "Previous result is no longer available" },
          { status: 409 },
        );
      }

      return NextResponse.json({
        success: true,
        data: replaySale,
        idempotent: true,
        message: "Already processed",
      });
    }

    const sale = await db.sale.findFirst({
      where: { id: outcome.saleId, businessId },
      include: { items: true },
    });

    return NextResponse.json({
      success: true,
      data: sale,
      message: `Sale ${status.toLowerCase()} successfully`,
    });
  } catch (error: unknown) {
    console.error("Error updating sale:", error);
    const coded = (error as { status?: number })?.status;
    if (coded === 400 || coded === 404 || coded === 409) {
      const message = error instanceof Error ? error.message : "Failed to update sale";
      return NextResponse.json({ success: false, error: message }, { status: coded });
    }
    const { message, status: httpStatus } = toClientError(error, "Failed to update sale");
    return NextResponse.json({ success: false, error: message }, { status: httpStatus });
  }
}