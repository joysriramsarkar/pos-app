export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { requirePermission, getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { addMoney, subtractMoney } from "@/lib/money";

const getIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;

// GET /api/sales/returns?saleId=xxx
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "sales.view");
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("saleId");

  try {
    const returns = await db.saleReturn.findMany({
      where: saleId ? { saleId } : undefined,
      include: { items: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: returns });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: "Failed to fetch returns" }, { status: 500 });
  }
}

// POST /api/sales/returns
// Body: { saleId, items: [{ saleItemId, quantity }], refundMethod, reason }
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "sales.edit");
  if (authError) return authError;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id || null;

  try {
    const body = await request.json();
    const { saleId, items, refundMethod = "Cash", reason } = body;

    if (!saleId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "saleId and items are required" },
        { status: 400 },
      );
    }

    const saleReturn = await db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true, customer: true },
      });

      if (!sale) throw new Error("Sale not found");
      if (sale.status === "Cancelled") throw new Error("Cannot return items from a cancelled sale");

      // Validate each return item against original sale items
      // and check already-returned quantities
      const existingReturns = await tx.saleReturnItem.findMany({
        where: { saleItem: { saleId } },
        select: { saleItemId: true, quantity: true },
      });

      const alreadyReturnedMap = existingReturns.reduce<Record<string, number>>((acc, r) => {
        acc[r.saleItemId] = (acc[r.saleItemId] || 0) + r.quantity;
        return acc;
      }, {});

      const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));
      let refundAmount = 0;
      const returnItemsData: {
        saleItemId: string;
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }[] = [];

      for (const { saleItemId, quantity } of items) {
        if (!quantity || quantity <= 0) throw new Error(`Invalid quantity for item ${saleItemId}`);

        const saleItem = saleItemMap.get(saleItemId);
        if (!saleItem) throw new Error(`Sale item ${saleItemId} not found in this sale`);

        const alreadyReturned = alreadyReturnedMap[saleItemId] || 0;
        const maxReturnable = subtractMoney(saleItem.quantity, alreadyReturned);

        if (quantity > maxReturnable) {
          throw new Error(
            `Cannot return ${quantity} of "${saleItem.productName}". Max returnable: ${maxReturnable}`,
          );
        }

        const itemRefund = quantity * Number(saleItem.unitPrice);
        refundAmount = addMoney(refundAmount, itemRefund);
        returnItemsData.push({
          saleItemId,
          productId: saleItem.productId,
          productName: saleItem.productName,
          quantity,
          unitPrice: Number(saleItem.unitPrice),
          totalPrice: itemRefund,
        });
      }

      // Create the SaleReturn record
      const newReturn = await tx.saleReturn.create({
        data: {
          saleId,
          userId,
          refundAmount,
          refundMethod,
          reason: reason || null,
          items: { create: returnItemsData },
        },
        include: { items: true },
      });

      // Restore stock for returned products
      const productReturnMap = returnItemsData.reduce<Record<string, number>>((acc, item) => {
        acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
        return acc;
      }, {});

      const productIds = Object.keys(productReturnMap);
      const quantities = Object.values(productReturnMap);

      await tx.$executeRaw`
        UPDATE products AS p
        SET "current_stock" = p."current_stock" + update_data.quantity,
            "updated_at" = NOW()
        FROM (
          SELECT unnest(${productIds}::text[]) AS id, unnest(${quantities}::float[]) AS quantity
        ) AS update_data
        WHERE p.id = update_data.id
      `;

      await tx.stockHistory.createMany({
        data: productIds.map((pid, i) => ({
          productId: pid,
          changeType: "return",
          quantity: quantities[i],
          reason: `Partial return: ${sale.invoiceNumber}`,
          referenceId: newReturn.id,
        })),
      });

      // Update sale status to PartialReturn (or Refunded if all items returned)
      const allReturns = await tx.saleReturnItem.findMany({
        where: { saleItem: { saleId } },
        select: { saleItemId: true, quantity: true },
      });

      const totalReturnedMap = allReturns.reduce<Record<string, number>>((acc, r) => {
        acc[r.saleItemId] = (acc[r.saleItemId] || 0) + r.quantity;
        return acc;
      }, {});

      const allItemsFullyReturned = sale.items.every(
        (item) => (totalReturnedMap[item.id] || 0) >= item.quantity,
      );

      await tx.sale.update({
        where: { id: saleId },
        data: { status: allItemsFullyReturned ? "Refunded" : "PartialReturn" },
      });

      // Handle customer ledger if refund goes to prepaid balance
      if (sale.customerId && refundMethod === "Prepaid") {
        const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
        if (!customer) throw new Error("Customer not found");

        const newPrepaid = addMoney(customer.prepaidBalance, refundAmount);
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { prepaidBalance: newPrepaid },
        });

        await tx.ledgerEntry.create({
          data: {
            customerId: sale.customerId,
            entryType: "debit",
            amount: refundAmount,
            balanceAfter: customer.totalDue,
            description: `Partial return refund (prepaid): ${sale.invoiceNumber}`,
            referenceId: newReturn.id,
          },
        });
      }

      return newReturn;
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: (user as any)?.id,
      action: "CREATE_SALE_RETURN",
      entityType: "SaleReturn",
      entityId: saleReturn.id,
      details: { saleId, refundAmount: saleReturn.refundAmount, refundMethod },
      ipAddress: getIp(request),
    });

    return NextResponse.json({ success: true, data: saleReturn });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process return";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
