/**
 * Shared sale-return / refund processing.
 * Both /api/sales/returns and /api/refunds (compat) call this so stock and
 * ledger accounting stay single-sourced.
 */
import type { Prisma } from "@prisma/client";
import { addMoney, multiplyMoney, subtractMoney, toMoneyDecimal, toMoneyNumber } from "@/lib/money";
import Decimal from "decimal.js";

export type RefundMethod = "Cash" | "Due" | "Prepaid";

export interface ReturnItemInput {
  saleItemId: string;
  quantity: number;
}

export interface ProcessSaleReturnInput {
  saleId: string;
  items: ReturnItemInput[];
  refundMethod: RefundMethod;
  reason?: string | null;
  userId?: string | null;
}

export function mapRefundMethod(raw: string | undefined): RefundMethod | null {
  const methodMap: Record<string, RefundMethod> = {
    নগদ: "Cash",
    Cash: "Cash",
    বাকি: "Due",
    Due: "Due",
    Prepaid: "Prepaid",
    প্রিপেইড: "Prepaid",
  };
  if (!raw) return "Cash";
  return methodMap[raw] ?? (["Cash", "Due", "Prepaid"].includes(raw) ? (raw as RefundMethod) : null);
}

export async function processSaleReturn(
  tx: Prisma.TransactionClient,
  input: ProcessSaleReturnInput,
) {
  const { saleId, items, refundMethod: mappedMethod, reason, userId } = input;

  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { items: true, customer: true },
  });

  if (!sale) throw Object.assign(new Error("Sale not found"), { status: 404 });
  if (sale.status === "Cancelled") {
    throw Object.assign(new Error("Cannot return items from a cancelled sale"), { status: 400 });
  }
  if (sale.status === "Refunded") {
    throw Object.assign(new Error("Sale is already fully refunded"), { status: 400 });
  }

  const existingReturns = await tx.saleReturnItem.findMany({
    where: { saleItem: { saleId } },
    select: { saleItemId: true, quantity: true },
  });

  const alreadyReturnedMap = existingReturns.reduce<Record<string, number>>((acc, r) => {
    acc[r.saleItemId] = (acc[r.saleItemId] || 0) + Number(r.quantity);
    return acc;
  }, {});

  // Legacy negative-sale refunds against this invoice (pre-unification data)
  const legacyRefundItems = await tx.saleItem.findMany({
    where: {
      quantity: { lt: 0 },
      sale: {
        notes: { contains: sale.invoiceNumber },
        status: "Refunded",
      },
    },
    select: { productId: true, quantity: true },
  });
  const legacyByProduct = legacyRefundItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = (acc[item.productId] || 0) + Math.abs(Number(item.quantity));
    return acc;
  }, {});

  const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));
  let grossRefund = new Decimal(0);
  const returnItemsData: {
    saleItemId: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[] = [];
  const allocating: Record<string, number> = {};

  for (const { saleItemId, quantity } of items) {
    if (!quantity || quantity <= 0) {
      throw Object.assign(new Error(`Invalid quantity for item ${saleItemId}`), { status: 400 });
    }

    const saleItem = saleItemMap.get(saleItemId);
    if (!saleItem) {
      throw Object.assign(new Error(`Sale item ${saleItemId} not found in this sale`), { status: 400 });
    }

    const alreadyLine = (alreadyReturnedMap[saleItemId] || 0) + (allocating[saleItemId] || 0);
    const productLegacy = legacyByProduct[saleItem.productId] || 0;
    const productAlreadyViaReturns = sale.items
      .filter((i) => i.productId === saleItem.productId)
      .reduce((s, i) => s + (alreadyReturnedMap[i.id] || 0) + (allocating[i.id] || 0), 0);
    const productSold = sale.items
      .filter((i) => i.productId === saleItem.productId)
      .reduce((s, i) => s + Number(i.quantity), 0);
    const productRemaining = Math.max(0, productSold - productAlreadyViaReturns - productLegacy);
    const lineRemaining = Math.max(0, Number(saleItem.quantity) - alreadyLine);
    const maxReturnable = Math.min(lineRemaining, productRemaining);

    if (new Decimal(quantity).gt(maxReturnable)) {
      throw Object.assign(
        new Error(
          `Cannot return ${quantity} of "${saleItem.productName}". Max returnable: ${maxReturnable}`,
        ),
        { status: 400 },
      );
    }

    const itemRefund = multiplyMoney(quantity, saleItem.unitPrice);
    grossRefund = addMoney(grossRefund, itemRefund);
    allocating[saleItemId] = (allocating[saleItemId] || 0) + Number(quantity);

    returnItemsData.push({
      saleItemId,
      productId: saleItem.productId,
      productName: saleItem.productName,
      quantity: Number(quantity),
      unitPrice: toMoneyNumber(saleItem.unitPrice),
      totalPrice: itemRefund.toNumber(),
    });
  }

  const originalSubtotal = toMoneyDecimal(sale.subtotal);
  const refundRatio = originalSubtotal.gt(0) ? grossRefund.div(originalSubtotal) : new Decimal(0);
  const refundDiscount = toMoneyDecimal(toMoneyDecimal(sale.discount).times(refundRatio));
  const refundTax = toMoneyDecimal(toMoneyDecimal(sale.tax).times(refundRatio));
  const refundAmount = addMoney(subtractMoney(grossRefund, refundDiscount), refundTax);

  if ((mappedMethod === "Due" || mappedMethod === "Prepaid") && !sale.customerId) {
    throw Object.assign(
      new Error("Customer required for Due or Prepaid refund method"),
      { status: 400 },
    );
  }

  if (mappedMethod === "Due" && sale.customerId) {
    const peek = await tx.$queryRaw<Array<{ totalDue: unknown }>>`
      SELECT "total_due" as "totalDue" FROM customers WHERE id = ${sale.customerId} FOR UPDATE
    `;
    if (toMoneyNumber(Number(peek[0]?.totalDue ?? 0)) <= 0) {
      throw Object.assign(
        new Error("Customer has no outstanding due. Use Cash refund instead."),
        { status: 400 },
      );
    }
  }

  const newReturn = await tx.saleReturn.create({
    data: {
      saleId,
      userId: userId || null,
      refundAmount,
      refundMethod: mappedMethod,
      reason: reason || null,
      items: { create: returnItemsData },
    },
    include: { items: true },
  });

  const productReturnMap = returnItemsData.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = (acc[item.productId] || 0) + Number(item.quantity);
    return acc;
  }, {});
  const productIds = Object.keys(productReturnMap).sort();

  for (const pid of productIds) {
    await tx.$executeRaw`SELECT id FROM products WHERE id = ${pid} FOR UPDATE`;
    await tx.product.update({
      where: { id: pid },
      data: {
        currentStock: { increment: productReturnMap[pid] },
        updatedAt: new Date(),
      },
    });
  }

  await tx.stockHistory.createMany({
    data: productIds.map((pid) => ({
      productId: pid,
      changeType: "return",
      quantity: productReturnMap[pid],
      reason: `Partial return: ${sale.invoiceNumber}`,
      referenceId: newReturn.id,
      saleReturnId: newReturn.id,
    })),
  });

  const allReturns = await tx.saleReturnItem.findMany({
    where: { saleItem: { saleId } },
    select: { saleItemId: true, quantity: true },
  });
  const totalReturnedMap = allReturns.reduce<Record<string, number>>((acc, r) => {
    acc[r.saleItemId] = (acc[r.saleItemId] || 0) + Number(r.quantity);
    return acc;
  }, {});

  const allItemsFullyReturned = sale.items.every((item) => {
    const lineRet = totalReturnedMap[item.id] || 0;
    const productLines = sale.items.filter((i) => i.productId === item.productId);
    const legacyShare = productLines.length === 1 ? (legacyByProduct[item.productId] || 0) : 0;
    return lineRet + legacyShare >= Number(item.quantity);
  });

  await tx.sale.update({
    where: { id: saleId },
    data: { status: allItemsFullyReturned ? "Refunded" : "PartialReturn" },
  });

  if (sale.customerId) {
    const customerRaw = await tx.$queryRaw<
      Array<{ id: string; totalDue: unknown; prepaidBalance: unknown }>
    >`
      SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
      FROM customers
      WHERE id = ${sale.customerId}
      FOR UPDATE
    `;
    const customer = customerRaw[0];
    if (!customer) throw Object.assign(new Error("Customer not found"), { status: 404 });

    const currentDue = toMoneyDecimal(Number(customer.totalDue));
    const currentPrepaid = toMoneyDecimal(Number(customer.prepaidBalance));
    const saleTotal = toMoneyDecimal(sale.totalAmount);
    const salePaid = toMoneyDecimal(sale.amountPaid);
    const paidRatio = saleTotal.gt(0) ? salePaid.div(saleTotal) : new Decimal(1);
    const duePortion = toMoneyDecimal(refundAmount.times(new Decimal(1).minus(paidRatio)));
    const paidPortion = toMoneyDecimal(refundAmount.times(paidRatio));

    if (mappedMethod === "Due") {
      const dueReduction = Decimal.min(refundAmount, currentDue);
      const newDue = toMoneyDecimal(currentDue.minus(dueReduction));
      if (dueReduction.gt(0)) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalDue: newDue, updatedAt: new Date() },
        });
        await tx.ledgerEntry.create({
          data: {
            customerId: sale.customerId,
            entryType: "debit",
            amount: dueReduction,
            balanceAfter: newDue,
            description: `Partial return: reverse due for ${sale.invoiceNumber}`,
            referenceId: newReturn.id,
          },
        });
      }
    } else if (mappedMethod === "Prepaid") {
      const dueReduction = Decimal.min(duePortion, currentDue);
      const newDue = toMoneyDecimal(currentDue.minus(dueReduction));
      const prepaidAdd = addMoney(paidPortion, duePortion.minus(dueReduction));
      const newPrepaid = addMoney(currentPrepaid, prepaidAdd);

      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          totalDue: newDue,
          prepaidBalance: newPrepaid,
          updatedAt: new Date(),
        },
      });

      if (dueReduction.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            customerId: sale.customerId,
            entryType: "debit",
            amount: dueReduction,
            balanceAfter: newDue,
            description: `Partial return: reverse due for ${sale.invoiceNumber}`,
            referenceId: newReturn.id,
          },
        });
      }
      if (prepaidAdd.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            customerId: sale.customerId,
            entryType: "prepayment-added",
            amount: prepaidAdd,
            balanceAfter: newDue,
            description: `Partial return refund (prepaid): ${sale.invoiceNumber}`,
            referenceId: newReturn.id,
          },
        });
      }
    } else {
      const dueReduction = Decimal.min(duePortion, currentDue);
      if (dueReduction.gt(0)) {
        const newDue = toMoneyDecimal(currentDue.minus(dueReduction));
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { totalDue: newDue, updatedAt: new Date() },
        });
        await tx.ledgerEntry.create({
          data: {
            customerId: sale.customerId,
            entryType: "debit",
            amount: dueReduction,
            balanceAfter: newDue,
            description: `Partial return cash: reverse due for ${sale.invoiceNumber}`,
            referenceId: newReturn.id,
          },
        });
      }
    }
  }

  return {
    saleReturn: newReturn,
    isFullRefund: allItemsFullyReturned,
    refundAmount: toMoneyNumber(refundAmount),
    originalInvoice: sale.invoiceNumber,
    originalSaleId: sale.id,
  };
}

/**
 * Resolve productId-based refund lines to saleItemId (for RefundDialog / legacy clients).
 */
export function resolveReturnItems(
  saleItems: Array<{ id: string; productId: string; quantity: unknown }>,
  alreadyReturnedMap: Record<string, number>,
  inputItems: Array<{ saleItemId?: string; productId?: string; quantity: number }>,
): ReturnItemInput[] {
  const byId = new Map(saleItems.map((i) => [i.id, i]));
  const byProduct = new Map<string, typeof saleItems>();
  for (const item of saleItems) {
    const list = byProduct.get(item.productId) || [];
    list.push(item);
    byProduct.set(item.productId, list);
  }

  const allocating: Record<string, number> = {};
  const resolved: ReturnItemInput[] = [];

  for (const raw of inputItems) {
    let saleItemId = raw.saleItemId;
    if (!saleItemId && raw.productId) {
      const candidates = byProduct.get(raw.productId) || [];
      const match = candidates.find((c) => {
        const used = (alreadyReturnedMap[c.id] || 0) + (allocating[c.id] || 0);
        return used < Number(c.quantity);
      });
      saleItemId = match?.id || candidates[0]?.id;
    }
    if (!saleItemId || !byId.has(saleItemId)) {
      throw Object.assign(
        new Error(`Sale item not found: ${raw.saleItemId || raw.productId}`),
        { status: 400 },
      );
    }
    allocating[saleItemId] = (allocating[saleItemId] || 0) + Number(raw.quantity);
    resolved.push({ saleItemId, quantity: Number(raw.quantity) });
  }

  return resolved;
}
