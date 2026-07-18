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
import { addMoney, subtractMoney, toMoneyDecimal } from "@/lib/money";
import Decimal from "decimal.js";
import { findSaleItemTotalMismatch } from "@/lib/sale-calculations";
import {
  applySaleStockPlans,
  costPriceForProduct,
  lockAndPlanSaleStock,
} from "@/lib/sale-stock";

import { withAuthMiddleware, type RouteContext } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { toClientError } from "@/lib/api-errors";
import { enforceRateLimit, salesCreateLimiter } from "@/lib/rate-limit";

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
export const GET = withAuthMiddleware(handleGet, { permissionCode: "sales.view" });

async function handleGet(request: NextRequest, _ctx: RouteContext) {
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
      const sale = await db.sale.findUnique({
        where: { id },
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

    const where: Prisma.SaleWhereInput = {};

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
    if (status) where.status = status;

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
          customer: { select: { id: true, name: true, phone: true } },
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
export const POST = withAuthMiddleware(handlePost, { permissionCode: "sales.create" });

async function handlePost(request: NextRequest, ctx: RouteContext) {
  try {
    const rateKey = ctx.auth?.user?.id || getIp(request) || "unknown";
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

    const itemTotalMismatch = findSaleItemTotalMismatch(validatedItems);
    if (itemTotalMismatch) {
      return NextResponse.json({ success: false, error: itemTotalMismatch }, { status: 400 });
    }

    const subtotal = addMoney(...validatedItems.map((item) => item.totalPrice));
    const discountAmount = toMoneyDecimal(validatedData.discount);
    const taxAmount = toMoneyDecimal(validatedData.tax);
    const totalAmount = addMoney(subtractMoney(subtotal, discountAmount), taxAmount);
    const amountReceived = toMoneyDecimal(validatedData.amountReceived || 0);
    const amountPaidValue = toMoneyDecimal(validatedData.amountPaid);
    const prepaidToUse = toMoneyDecimal(validatedData.prepaidAmountUsed || 0);
    const changeAsPrepayment = toMoneyDecimal(validatedData.changeAsPrepayment || 0);
    const debtRepaymentAmount = toMoneyDecimal(validatedData.debtRepaymentAmount || 0);
    const externalPaidAmount = subtractMoney(amountPaidValue, prepaidToUse);

    if (amountPaidValue.gt(totalAmount)) {
      return NextResponse.json({ success: false, error: "Amount paid cannot exceed sale total" }, { status: 400 });
    }
    if (prepaidToUse.gt(amountPaidValue)) {
      return NextResponse.json({ success: false, error: "Prepaid amount cannot exceed total amount paid" }, { status: 400 });
    }
    if (!customerId && (prepaidToUse.gt(0) || changeAsPrepayment.gt(0))) {
      return NextResponse.json({ success: false, error: "Prepaid balance can only be used with a selected customer" }, { status: 400 });
    }
    if (changeAsPrepayment.gt(0) && amountReceived.lt(addMoney(externalPaidAmount, changeAsPrepayment))) {
      return NextResponse.json({ success: false, error: "Received amount does not cover sale payment and prepaid change" }, { status: 400 });
    }

    let paymentStatus = "Paid";
    if (customerId) {
      if (amountPaidValue.isZero()) paymentStatus = "Due";
      else if (amountPaidValue.lt(totalAmount)) paymentStatus = "Partial";
    } else {
      // Walk-in customers must pay full amount
      if (amountPaidValue.lt(totalAmount)) {
        return NextResponse.json({ success: false, error: "Walk-in customers must pay the full amount" }, { status: 400 });
      }
    }

    const invoiceNumber = await generateServerInvoiceNumber();

    // Auth from middleware context — no second session fetch
    const userId = ctx.auth?.user?.id ?? null;

    const saleResult = await db.$transaction(
      async (tx) => {
        // Lock products first (sorted FOR UPDATE), plan auto-adjust + blended COGS
        const { plansByProductId, autoAdjusted } = await lockAndPlanSaleStock(
          tx,
          validatedItems,
        );

        const saleCreateData: Prisma.SaleCreateInput = {
          invoiceNumber,
          subtotal,
          discount: discountAmount,
          tax: taxAmount,
          totalAmount,
          amountPaid: amountPaidValue,
          paymentMethod: paymentMethod || "Cash",
          cashAmount: validatedData.cashAmount ?? null,
          upiAmount: validatedData.upiAmount ?? null,
          paymentStatus,
          status: "Completed",
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
          plans: Array.from(plansByProductId.values()),
          historyReasonPrefix: "Sale",
        });

        if (customerId) {
          const customerRaw = await tx.$queryRaw<CustomerLockRow[]>`
            SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
            FROM customers
            WHERE id = ${customerId}
            FOR UPDATE
          `;
          const customer = customerRaw[0];
          if (!customer) throw new Error(`Customer ${customerId} not found`);

          const currentTotalDue = toMoneyDecimal(customer.totalDue);
          const currentPrepaidBalance = toMoneyDecimal(customer.prepaidBalance);

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
                customerId,
                entryType: "prepayment-used",
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
                  customerId,
                  entryType: "credit",
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
                  customerId,
                  entryType: "debit",
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
                customerId,
                entryType: "debit",
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
                customerId,
                entryType: "prepayment-added",
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
              if (totalDueIncrement.gt(totalDueDecrement)) {
                dataUpdate.totalDue = { increment: totalDueIncrement.minus(totalDueDecrement) };
              } else {
                dataUpdate.totalDue = { decrement: totalDueDecrement.minus(totalDueIncrement) };
              }
            }
            if (prepaidBalanceIncrement.gt(0) || prepaidBalanceDecrement.gt(0)) {
              if (prepaidBalanceIncrement.gt(prepaidBalanceDecrement)) {
                dataUpdate.prepaidBalance = {
                  increment: prepaidBalanceIncrement.minus(prepaidBalanceDecrement),
                };
              } else {
                dataUpdate.prepaidBalance = {
                  decrement: prepaidBalanceDecrement.minus(prepaidBalanceIncrement),
                };
              }
            }

            await tx.customer.update({
              where: { id: customerId },
              data: dataUpdate,
            });
          }
        }

        return {
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

    const { sale, autoAdjusted } = saleResult;

    await logAudit({
      userId: userId ?? undefined,
      action: "CREATE_SALE",
      entityType: "Sale",
      entityId: sale.id,
      details: {
        invoiceNumber: sale.invoiceNumber,
        totalAmount: sale.totalAmount.toNumber(),
        autoAdjustedCount: autoAdjusted.length,
        autoAdjusted: autoAdjusted.map((a) => ({
          productId: a.productId,
          shortageQty: a.shortageQty,
          stockBefore: a.stockBefore,
        })),
      },
      ipAddress: getIp(request),
    });

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
export const PUT = withAuthMiddleware(handlePut, { permissionCode: "sales.edit" });

async function handlePut(request: NextRequest, _ctx: RouteContext) {
  try {
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

    const existingSale = await db.sale.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    if (!existingSale) {
      return NextResponse.json({ success: false, error: "Sale not found" }, { status: 404 });
    }

    if (existingSale.status !== "Completed") {
      return NextResponse.json(
        { success: false, error: "Only completed sales can be cancelled or refunded" },
        { status: 400 },
      );
    }

    const sale = await db.$transaction(async (tx) => {
      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          status,
          notes: reason ? `${existingSale.notes || ""}\n${status}: ${reason}` : existingSale.notes,
          updatedAt: new Date(),
        },
        include: { items: true },
      });

      // Do not restore stock already returned via SaleReturn / prior refunds
      const priorReturnItems = await tx.saleReturnItem.findMany({
        where: { saleItem: { saleId: id } },
        select: { productId: true, quantity: true },
      });
      const alreadyReturnedByProduct = priorReturnItems.reduce((acc, r) => {
        acc.set(r.productId, (acc.get(r.productId) || 0) + Number(r.quantity));
        return acc;
      }, new Map<string, number>());

      if (priorReturnItems.length > 0) {
        throw new Error(
          "Cannot cancel/refund a sale that already has returns. Process remaining items via returns instead.",
        );
      }

      const productReturnQuantities = existingSale.items.reduce((acc, item) => {
        const already = alreadyReturnedByProduct.get(item.productId) || 0;
        // If multiple lines share a product, already is product-level — only subtract once below
        acc.set(item.productId, (acc.get(item.productId) || 0) + Number(item.quantity));
        return acc;
      }, new Map<string, number>());

      // Net restore = sold qty − already returned
      for (const [pid, soldQty] of productReturnQuantities) {
        const already = alreadyReturnedByProduct.get(pid) || 0;
        productReturnQuantities.set(pid, Math.max(0, soldQty - already));
      }

      const productIds = Array.from(productReturnQuantities.keys()).sort();
      const quantities = productIds.map((pid) => productReturnQuantities.get(pid) || 0);

      if (productIds.length > 0) {
        for (let i = 0; i < productIds.length; i++) {
          if (quantities[i] <= 0) continue;
          await tx.$executeRaw`SELECT id FROM products WHERE id = ${productIds[i]} FOR UPDATE`;
          await tx.product.update({
            where: { id: productIds[i] },
            data: { currentStock: { increment: quantities[i] }, updatedAt: new Date() }
          });
        }

        await tx.stockHistory.createMany({
          data: productIds
            .map((pid, index) => ({
              productId: pid,
              changeType: "return",
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
          `
        ]);

        const customer = customerRaw[0];
        if (!customer) throw new Error(`Customer ${existingSale.customerId} not found`);

        const prepaidUsedAmount = addMoney(
          ...relatedLedgerEntries.filter((e) => e.entryType === "prepayment-used").map((e) => e.amount),
        );
        const changePrepaymentAmount = addMoney(
          ...relatedLedgerEntries.filter((e) => e.description?.startsWith("Change added as prepaid:")).map((e) => e.amount),
        );
        const subDue = subtractMoney(existingSale.totalAmount, existingSale.amountPaid);
        const dueAmount = subDue.gt(0) ? subDue : new Decimal(0);

        const currentTotalDue = toMoneyDecimal(customer.totalDue);
        const currentPrepaidBalance = toMoneyDecimal(customer.prepaidBalance);

        // Floor due at 0 — absolute set avoids negative balance under concurrent collections
        const newTotalDue = dueAmount.gt(0)
          ? (currentTotalDue.minus(dueAmount).gt(0) ? currentTotalDue.minus(dueAmount) : new Decimal(0))
          : currentTotalDue;
        const prepaidBalanceAdjustment = subtractMoney(prepaidUsedAmount, changePrepaymentAmount);
        const addPrepaid = currentPrepaidBalance.plus(prepaidBalanceAdjustment);
        const newPrepaidBalance = addPrepaid.gt(0) ? addPrepaid : new Decimal(0);

        const customerUpdateData: Record<string, unknown> = { updatedAt: new Date() };
        if (dueAmount.gt(0)) customerUpdateData.totalDue = newTotalDue;
        if (!prepaidBalanceAdjustment.isZero()) {
          customerUpdateData.prepaidBalance = newPrepaidBalance;
        }

        if (dueAmount.gt(0) || !prepaidBalanceAdjustment.isZero()) {
          await tx.customer.update({ where: { id: existingSale.customerId }, data: customerUpdateData });
        }

        if (dueAmount.gt(0)) {
          await tx.ledgerEntry.create({
            data: {
              customerId: existingSale.customerId,
              entryType: "debit",
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
              customerId: existingSale.customerId,
              entryType: "prepayment-restored",
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
              customerId: existingSale.customerId,
              entryType: "credit",
              amount: changePrepaymentAmount,
              balanceAfter: newTotalDue,
              description: `${status}: reverse prepaid change for ${existingSale.invoiceNumber}`,
              referenceId: existingSale.id,
            },
          });
        }
      }

      return updatedSale;
    });

    return NextResponse.json({ success: true, data: sale, message: `Sale ${status.toLowerCase()} successfully` });
  } catch (error: unknown) {
    console.error("Error updating sale:", error);
    const { message, status: httpStatus } = toClientError(error, "Failed to update sale");
    return NextResponse.json({ success: false, error: message }, { status: httpStatus });
  }
}
