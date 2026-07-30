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

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

const ProductSyncPayloadSchema = z.union([
  ProductInputSchema,
  z.object({
    productId: z.string(),
    quantityChange: z.number(),
  }),
]);

import { requireAuth } from "@/lib/api-middleware";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET /api/sync - Get pending sync items or sync status
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "status") {
      // Return sync status
      const [pendingCount, lastSync] = await Promise.all([
        db.syncQueue.count({ where: { synced: false } }),
        db.syncQueue.findFirst({
          where: { synced: true },
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
      where: { synced: false },
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
  const session = authResult.session;

  try {
    const idempotencyKey = request.headers.get("X-Idempotency-Key");
    if (!idempotencyKey) {
      return NextResponse.json(
        { success: false, error: "Missing X-Idempotency-Key header" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { actionType, payload } = body;

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
            throw new Error(
              "Invalid Sale payload: " + saleResult.error.message,
            );
          operationResult = await syncSale(tx, saleResult.data, "create");
          break;
        }
        case "customer:create": {
          const customerResult = CustomerInputSchema.safeParse(payload);
          if (!customerResult.success)
            throw new Error(
              "Invalid Customer payload: " + customerResult.error.message,
            );
          operationResult = await syncCustomer(
            tx,
            customerResult.data,
            "create",
          );
          break;
        }
        case "customer:update": {
          const customerResult = CustomerInputSchema.safeParse(payload);
          if (!customerResult.success)
            throw new Error(
              "Invalid Customer payload: " + customerResult.error.message,
            );
          operationResult = await syncCustomer(
            tx,
            customerResult.data,
            "update",
          );
          break;
        }
        case "product:stock:update": {
          const productResult = ProductSyncPayloadSchema.safeParse(payload);
          if (!productResult.success)
            throw new Error(
              "Invalid Product payload: " + productResult.error.message,
            );
          operationResult = await syncProduct(tx, productResult.data, "update");
          break;
        }
        case "product:create": {
          const productResult = ProductInputSchema.safeParse(payload);
          if (!productResult.success)
            throw new Error(
              "Invalid Product payload: " + productResult.error.message,
            );
          operationResult = await syncProduct(tx, productResult.data, "create");
          break;
        }
        case "product:update": {
          const productResult = ProductInputSchema.safeParse(payload);
          if (!productResult.success)
            throw new Error(
              "Invalid Product payload: " + productResult.error.message,
            );
          operationResult = await syncProduct(tx, productResult.data, "update");
          break;
        }
        case "prepayment:create": {
          const prepaymentSchema = z.object({
            customerId: z.string().cuid(),
            amount: z.number().positive(),
          });
          const prepaymentResult = prepaymentSchema.safeParse(payload);
          if (!prepaymentResult.success)
            throw new Error(
              "Invalid Prepayment payload: " + prepaymentResult.error.message,
            );

          operationResult = await syncPrepayment(tx, prepaymentResult.data);
          break;
        }
        default:
          throw new Error(`Unknown action type: ${actionType}`);
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
async function syncSale(tx: Prisma.TransactionClient, saleData: z.infer<typeof SaleInputSchema>, action: string) {
  if (action === 'create') {

    if (!saleData.invoiceNumber) {
      throw new Error("Invoice number is required for sync");
    }
    // Check if sale already exists (prevent duplicates)
    const existing = await tx.sale.findUnique({
      where: { invoiceNumber: saleData.invoiceNumber },
    });

    if (existing) {
      return existing;
    }

    // Create sale with items
    // already in tx
    // VALIDATION PHASE: Check all prerequisites before creating anything

    const itemTotalMismatch = findSaleItemTotalMismatch(saleData.items);
    if (itemTotalMismatch) {
      throw new Error(itemTotalMismatch);
    }

    // 1. Lock products + plan stock (FOR UPDATE, auto-adjust, blended COGS)
    const { plansByProductId, autoAdjusted } = await lockAndPlanSaleStock(
      tx,
      saleData.items,
    );

    // 2. Validate customer exists if specified
    if (saleData.customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: saleData.customerId },
      });

      if (!customer) {
        throw new Error(
          `Customer ${saleData.customerId} not found during sync validation`,
        );
      }
    }

    // 3. Validate basic sale data
    if (!saleData.items || saleData.items.length === 0) {
      throw new Error("Sale must have at least one item");
    }

    if ((saleData.totalAmount || 0) < 0) {
      throw new Error("Total amount cannot be negative");
    }
    const totalAmount = toMoneyDecimal(saleData.totalAmount || 0);
    const amountReceived = toMoneyDecimal(saleData.amountReceived || 0);
    const amountPaid = toMoneyDecimal(saleData.amountPaid || 0);
    const prepaidToUse = toMoneyDecimal(saleData.prepaidAmountUsed || 0);
    const changeAsPrepayment = toMoneyDecimal(saleData.changeAsPrepayment || 0);
    const debtRepaymentAmount = toMoneyDecimal(saleData.debtRepaymentAmount || 0);
    const externalPaidAmount = subtractMoney(amountPaid, prepaidToUse);

    if (amountPaid.gt(totalAmount)) {
      throw new Error(`Amount paid (${amountPaid.toString()}) cannot exceed sale total (${totalAmount.toString()})`);
    }

    if (prepaidToUse.gt(amountPaid)) {
      throw new Error("Prepaid amount cannot exceed total amount paid");
    }

    if (!saleData.customerId && (prepaidToUse.gt(0) || changeAsPrepayment.gt(0))) {
      throw new Error("Prepaid balance can only be used with a selected customer");
    }

    if (
      (changeAsPrepayment.gt(0) || debtRepaymentAmount.gt(0)) &&
      amountReceived.lt(addMoney(externalPaidAmount, addMoney(changeAsPrepayment, debtRepaymentAmount)))
    ) {
      throw new Error("Received amount does not cover sale payment, prepaid change, and due clearance");
    }

    // CREATE PHASE: sale rows use blended cost (owned @ WAC, shortage @ 0)
    const sale = await tx.sale.create({
      data: {
        id: saleData.id,
        invoiceNumber: saleData.invoiceNumber as string,
        userId: saleData.userId || null,
        customerId: saleData.customerId || null,
        subtotal: saleData.subtotal || 0,
        discount: saleData.discount || 0,
        tax: saleData.tax || 0,
        totalAmount: saleData.totalAmount || 0,
        amountPaid: saleData.amountPaid || 0,
        paymentMethod: saleData.paymentMethod || "Cash",
        paymentStatus: saleData.paymentStatus || "Paid",
        status: saleData.status || "Completed",
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
        WHERE id = ${saleData.customerId}
        FOR UPDATE
      `;
      const customer = customerRaw[0];

      if (customer) {
        const currentTotalDue = toMoneyDecimal(customer.totalDue);
        const currentPrepaidBalance = toMoneyDecimal(customer.prepaidBalance);

        if (debtRepaymentAmount.gt(currentTotalDue)) {
          throw new Error(`Debt repayment amount (${debtRepaymentAmount.toString()}) cannot exceed current total due (${currentTotalDue.toString()})`);
        }

        if (prepaidToUse.gt(0)) {
            if (currentPrepaidBalance.lt(prepaidToUse)) {
              throw new Error(`Insufficient prepaid balance. Available: ${currentPrepaidBalance}, Tried to use: ${prepaidToUse}`);
            }
            await tx.ledgerEntry.create({
              data: {
                customerId: saleData.customerId,
                entryType: "prepayment-used",
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
                  customerId: saleData.customerId,
                  entryType: "credit",
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
                  customerId: saleData.customerId,
                  entryType: "debit",
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
                customerId: saleData.customerId,
                entryType: "debit",
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
                customerId: saleData.customerId,
                entryType: "prepayment-added",
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

             await tx.customer.update({
                where: { id: saleData.customerId },
                data: dataUpdate
             });
          }
        }
      }

      return sale;
    }

    throw new Error(`Unknown action: ${action}`);
}

// Sync prepayment from offline
async function syncPrepayment(tx: Prisma.TransactionClient, prepaymentData: { customerId: string; amount: number }) {
  const customerRaw = await tx.$queryRaw<any[]>`
    SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
    FROM customers
    WHERE id = ${prepaymentData.customerId}
    FOR UPDATE
  `;
  const customer = customerRaw[0];

  if (!customer) {
    throw new Error(`Customer ${prepaymentData.customerId} not found during sync validation`);
  }

  const updatedCustomer = await tx.customer.update({
    where: { id: prepaymentData.customerId },
    data: { prepaidBalance: { increment: prepaymentData.amount }, updatedAt: new Date() },
  });

  await tx.ledgerEntry.create({
    data: {
      customerId: prepaymentData.customerId,
      entryType: "prepayment-added",
      amount: prepaymentData.amount,
      balanceAfter: customer.totalDue,
      description: "Offline sync prepayment added",
      referenceId: `PREPAY-${Date.now()}`,
    },
  });

  return updatedCustomer;
}

// Sync customer from offline
async function syncCustomer(tx: Prisma.TransactionClient, customerData: z.infer<typeof CustomerInputSchema>, action: string) {
  if (action === 'create') {

    // Check if customer already exists (Server-wins)
    if (customerData.phone) {
      const existing = await tx.customer.findUnique({
        where: { phone: customerData.phone },
      });

      if (existing) {
        return existing;
      }
    }

    // Never trust client-provided balances — ledger is server-authoritative
    return tx.customer.create({
      data: {
        id: customerData.id,
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
      throw new Error("Customer ID is required for update");
    }

    return tx.customer.update({
      where: { id: customerData.id },
      data: {
        name: customerData.name,
        phone: customerData.phone || null,
        address: customerData.address || null,
        notes: customerData.notes || null,
        updatedAt: new Date(),
      },
    });
  }

  throw new Error(`Unknown action: ${action}`);
}

// Sync product updates (primarily stock changes) from offline
async function syncProduct(tx: Prisma.TransactionClient, productData: z.infer<typeof ProductSyncPayloadSchema> | z.infer<typeof ProductInputSchema>, action: string) {
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
        const existing = await tx.product.findUnique({ where: { id } });
        if (existing) {
          return existing;
        }
      }

      return tx.product.create({
        data: {
          id,
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
    }

    throw new Error("Invalid product data for create action");
  } else if (action === "update") {
    if ("productId" in productData && "quantityChange" in productData) {
      const { productId, quantityChange } = productData;

      // Lock product row
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM products WHERE id = ${productId} FOR UPDATE
      `;
      if (!locked[0]) {
        throw new Error(`Product ${productId} not found during stock sync`);
      }

      let updated;
      if (quantityChange < 0) {
        const result = await tx.product.updateMany({
          where: { id: productId, currentStock: { gte: Math.abs(quantityChange) } },
          data: { currentStock: { decrement: Math.abs(quantityChange) }, updatedAt: new Date() },
        });
        updated = await tx.product.findUniqueOrThrow({ where: { id: productId } });
        // Only write history when stock actually changed — avoids ledger drift
        if (result.count === 0) {
          return updated;
        }
      } else {
        updated = await tx.product.update({
          where: { id: productId },
          data: { currentStock: { increment: quantityChange }, updatedAt: new Date() },
        });
      }

      await tx.stockHistory.create({
        data: {
          productId,
          changeType: quantityChange > 0 ? "purchase" : "sale",
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
        throw new Error("Product ID is required for update sync");
      }

      return tx.product.upsert({
        where: { id },
        create: {
          id,
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
        update: {
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
    }

    throw new Error("Invalid product data payload");
  }

  throw new Error(`Unknown action: ${action}`);
}

// PUT /api/sync - Mark sync item as complete
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  try {
    const body = await request.json();
    const { id, error } = body;

    if (error) {
      // Log sync error
      await db.syncQueue.update({
        where: { id },
        data: {
          retryCount: { increment: 1 },
          error,
        },
      });
    } else {
      // Mark as synced
      await db.syncQueue.update({
        where: { id },
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
