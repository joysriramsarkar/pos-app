export const dynamic = "force-dynamic";
// ============================================================================
// Sales API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateServerInvoiceNumber } from "@/lib/invoice";
import { v4 as uuidv4 } from "uuid";
import { SaleInputSchema } from "@/schemas";
import { addMoney, subtractMoney, toMoneyNumber } from "@/lib/money";
import {
  aggregateSaleItemQuantities,
  findSaleItemTotalMismatch,
} from "@/lib/sale-calculations";

import { requirePermission, getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// GET /api/sales - Fetch sales
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "sales.view");
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const invoiceNumber = searchParams.get("invoiceNumber");
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

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

      const saleWithUnit = { ...sale, items: sale.items.map(item => ({ ...item, unit: (item as any).product?.unit ?? '' })) };
      return NextResponse.json({ success: true, data: saleWithUnit });
    }

    const where: any = {};

    if (invoiceNumber) {
      where.OR = [
        { invoiceNumber: { contains: invoiceNumber, mode: "insensitive" } },
        { customer: { name: { contains: invoiceNumber, mode: "insensitive" } } },
        { customer: { phone: { contains: invoiceNumber, mode: "insensitive" } } },
        { items: { some: { productName: { contains: invoiceNumber, mode: "insensitive" } } } },
      ];
    }

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
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

    const salesWithUnit = sales.map(sale => ({
      ...sale,
      items: sale.items.map(item => ({ ...item, unit: (item as any).product?.unit ?? '' })),
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
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "sales.create");
  if (authError) return authError;

  try {
    let body;
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
    const discountAmount = Math.max(0, toMoneyNumber(validatedData.discount));
    const taxAmount = Math.max(0, toMoneyNumber(validatedData.tax));
    const totalAmount = addMoney(subtractMoney(subtotal, discountAmount), taxAmount);
    const amountReceived = Math.max(0, toMoneyNumber(validatedData.amountReceived || 0));
    const amountPaidValue = Math.max(0, toMoneyNumber(validatedData.amountPaid));
    const prepaidToUse = Math.max(0, toMoneyNumber(validatedData.prepaidAmountUsed || 0));
    const changeAsPrepayment = Math.max(0, toMoneyNumber(validatedData.changeAsPrepayment || 0));
    const externalPaidAmount = subtractMoney(amountPaidValue, prepaidToUse);

    if (amountPaidValue > totalAmount) {
      return NextResponse.json({ success: false, error: "Amount paid cannot exceed sale total" }, { status: 400 });
    }
    if (prepaidToUse > amountPaidValue) {
      return NextResponse.json({ success: false, error: "Prepaid amount cannot exceed total amount paid" }, { status: 400 });
    }
    if (!customerId && (prepaidToUse > 0 || changeAsPrepayment > 0)) {
      return NextResponse.json({ success: false, error: "Prepaid balance can only be used with a selected customer" }, { status: 400 });
    }
    if (changeAsPrepayment > 0 && amountReceived < addMoney(externalPaidAmount, changeAsPrepayment)) {
      return NextResponse.json({ success: false, error: "Received amount does not cover sale payment and prepaid change" }, { status: 400 });
    }

    let paymentStatus = "Paid";
    if (customerId) {
      if (amountPaidValue === 0) paymentStatus = "Due";
      else if (amountPaidValue < totalAmount) paymentStatus = "Partial";
    } else {
      if (amountPaidValue < totalAmount) {
        return NextResponse.json({ success: false, error: "Walk-in customers must pay the full amount" }, { status: 400 });
      }
    }

    const invoiceNumber = await generateServerInvoiceNumber();

    // Get current user ID — single session call
    const authUser = await getAuthenticatedUser(request);
    const userId = (authUser as { id?: string })?.id || null;

    const sale = await db.$transaction(
      async (tx) => {
        const saleCreateData: any = {
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

        (newSale as any).items = (newSale as any).items.map((item: any) => ({ ...item, unit: item.product?.unit ?? '' }));

        const stockDeductions = aggregateSaleItemQuantities(validatedItems);
        const productIds = stockDeductions.map((item) => item.productId);
        const productsInDb = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, currentStock: true },
        });

        const productMap = new Map(productsInDb.map((p) => [p.id, p]));
        for (const item of stockDeductions) {
          const product = productMap.get(item.productId);
          if (!product) throw new Error(`Product ${item.productId} not found`);
          if (product.currentStock < item.quantity) {
            throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.currentStock}, Requested: ${item.quantity}`);
          }
        }

        if (stockDeductions.length > 0) {
          const itemProductIds = stockDeductions.map((item) => item.productId);
          const itemQuantities = stockDeductions.map((item) => item.quantity);

          const updateResult = await tx.$executeRaw`
          UPDATE products AS p
          SET
            "current_stock" = p."current_stock" - u.quantity::float,
            "updated_at" = NOW()
          FROM (
            SELECT unnest(${itemProductIds}::text[]) as id, unnest(${itemQuantities}::float[]) as quantity
          ) AS u
          WHERE p.id = u.id AND p."current_stock" >= u.quantity::float
        `;

          if (updateResult !== stockDeductions.length) {
            throw new Error(`Atomic stock update failed. Another transaction may have depleted stock.`);
          }
        }

        await tx.stockHistory.createMany({
          data: stockDeductions.map((item) => ({
            productId: item.productId,
            changeType: "sale",
            quantity: -item.quantity,
            reason: `Sale: ${newSale.invoiceNumber}`,
            referenceId: newSale.id,
          })),
        });

        if (customerId) {
          const customer = await tx.customer.findUnique({ where: { id: customerId } });
          if (!customer) throw new Error(`Customer ${customerId} not found`);

          if (prepaidToUse > 0) {
            if (Number(customer.prepaidBalance) < prepaidToUse) {
              throw new Error(`Insufficient prepaid balance. Available: ${customer.prepaidBalance}, Tried to use: ${prepaidToUse}`);
            }
            await tx.customer.update({
              where: { id: customerId },
              data: { prepaidBalance: subtractMoney(Number(customer.prepaidBalance), prepaidToUse), updatedAt: new Date() },
            });
            await tx.ledgerEntry.create({
              data: {
                customerId,
                entryType: "prepayment-used",
                amount: prepaidToUse,
                balanceAfter: customer.totalDue,
                description: `Prepaid used for sale: ${newSale.invoiceNumber}`,
                referenceId: newSale.id,
              },
            });
          }

          const dueAmount = subtractMoney(totalAmount, amountPaidValue);
          if (dueAmount > 0) {
            const creditAmount = subtractMoney(totalAmount, prepaidToUse);
            const creditBalanceAfter = addMoney(customer.totalDue, creditAmount);
            const newTotalDue = subtractMoney(creditBalanceAfter, externalPaidAmount);

            await tx.customer.update({
              where: { id: customerId },
              data: { totalDue: { increment: dueAmount }, updatedAt: new Date() },
            });
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
            if (externalPaidAmount > 0) {
              await tx.ledgerEntry.create({
                data: {
                  customerId,
                  entryType: "debit",
                  amount: externalPaidAmount,
                  balanceAfter: newTotalDue,
                  description: `Partial payment for: ${newSale.invoiceNumber}`,
                  referenceId: newSale.id,
                },
              });
            }
          }

          if (changeAsPrepayment > 0) {
            await tx.customer.update({
              where: { id: customerId },
              data: { prepaidBalance: { increment: changeAsPrepayment }, updatedAt: new Date() },
            });
            await tx.ledgerEntry.create({
              data: {
                customerId,
                entryType: "debit",
                amount: changeAsPrepayment,
                balanceAfter: customer.totalDue,
                description: `Change added as prepaid: ${newSale.invoiceNumber}`,
                referenceId: newSale.id,
              },
            });
          }
        }

        return newSale;
      },
      { timeout: 60000, maxWait: 10000 },
    );

    await logAudit({
      userId: userId ?? undefined,
      action: 'CREATE_SALE',
      entityType: 'Sale',
      entityId: sale.id,
      details: { invoiceNumber: (sale as any).invoiceNumber, totalAmount: (sale as any).totalAmount },
      ipAddress: getIp(request),
    });

    return NextResponse.json({ success: true, data: sale, message: "Sale completed successfully" });
  } catch (error: unknown) {
    console.error("Error creating sale:", error);

    let errorMessage = "Failed to create sale";
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes("Insufficient stock")) {
        errorMessage = error.message;
        statusCode = 400;
      } else if (error.message.includes("not found")) {
        errorMessage = error.message;
        statusCode = 404;
      } else if (error.message.includes("No items")) {
        errorMessage = error.message;
        statusCode = 400;
      } else {
        errorMessage = error.message || "Failed to create sale";
      }
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}

// PUT /api/sales - Update sale (cancel/refund)
export async function PUT(request: NextRequest) {
  const authError = await requirePermission(request, "sales.edit");
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, status, reason } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Sale ID is required" }, { status: 400 });
    }

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

      const productReturnQuantities = existingSale.items.reduce((acc, item) => {
        acc.set(item.productId, (acc.get(item.productId) || 0) + item.quantity);
        return acc;
      }, new Map<string, number>());

      const productIds = Array.from(productReturnQuantities.keys());
      const quantities = Array.from(productReturnQuantities.values());

      if (productIds.length > 0) {
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
          data: productIds.map((id, index) => ({
            productId: id,
            changeType: "return",
            quantity: quantities[index],
            reason: `${status}: ${existingSale.invoiceNumber}`,
            referenceId: existingSale.id,
          })),
        });
      }

      if (existingSale.customerId) {
        const [relatedLedgerEntries, customer] = await Promise.all([
          tx.ledgerEntry.findMany({
            where: { customerId: existingSale.customerId, referenceId: existingSale.id },
            select: { entryType: true, amount: true, description: true },
          }),
          tx.customer.findUnique({ where: { id: existingSale.customerId } }),
        ]);

        if (!customer) throw new Error(`Customer ${existingSale.customerId} not found`);

        const prepaidUsedAmount = addMoney(
          ...relatedLedgerEntries.filter((e) => e.entryType === "prepayment-used").map((e) => e.amount),
        );
        const changePrepaymentAmount = addMoney(
          ...relatedLedgerEntries.filter((e) => e.description?.startsWith("Change added as prepaid:")).map((e) => e.amount),
        );
        const dueAmount = Math.max(0, subtractMoney(existingSale.totalAmount, existingSale.amountPaid));

        const newTotalDue = dueAmount > 0 ? Math.max(0, subtractMoney(customer.totalDue, dueAmount)) : customer.totalDue;
        const prepaidBalanceAdjustment = subtractMoney(prepaidUsedAmount, changePrepaymentAmount);
        const newPrepaidBalance = Math.max(0, addMoney(customer.prepaidBalance, prepaidBalanceAdjustment));

        const customerUpdateData: any = { updatedAt: new Date() };
        if (dueAmount > 0) customerUpdateData.totalDue = newTotalDue;
        if (prepaidBalanceAdjustment !== 0) customerUpdateData.prepaidBalance = newPrepaidBalance;

        if (dueAmount > 0 || prepaidBalanceAdjustment !== 0) {
          await tx.customer.update({ where: { id: existingSale.customerId }, data: customerUpdateData });
        }

        if (dueAmount > 0) {
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
        if (prepaidUsedAmount > 0) {
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
        if (changePrepaymentAmount > 0) {
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
    return NextResponse.json({ success: false, error: "Failed to update sale" }, { status: 500 });
  }
}
