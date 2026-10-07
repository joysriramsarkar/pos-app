export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { logAudit } from "@/lib/audit";
import { toUnitPriceNumber } from '@/lib/money';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

class ReceiveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// POST /api/purchase-orders/[id]/receive - Receive (a portion of) a purchase order
//
// IMPORTANT: receiving is CUMULATIVE. `receivedQty` on each item is the amount
// received so far, and each request may only receive the REMAINING quantity.
// This prevents the double-add bug where re-opening the dialog and submitting
// the full ordered quantity added stock twice.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'suppliers.edit');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { receivedItems, amountPaid, paymentMethod, cashAmount, upiAmount, updateStock } = body as {
      receivedItems: { id: string; receivedQty: number }[];
      amountPaid?: number;
      paymentMethod?: string;
      cashAmount?: number;
      upiAmount?: number;
      updateStock?: boolean;
    };

    if (!receivedItems || receivedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'প্রাপ্ত পরিমাণ আবশ্যক' },
        { status: 400 }
      );
    }

    // Validate split payment before touching the DB.
    const normalizedMethod = paymentMethod ? paymentMethod.toUpperCase() : undefined;
    if (normalizedMethod === 'MIXED') {
      const cash = Number(cashAmount || 0);
      const upi = Number(upiAmount || 0);
      const declaredPaid = amountPaid !== undefined ? Math.round(amountPaid) : cash + upi;
      if (cash < 0 || upi < 0) {
        return NextResponse.json({ success: false, error: 'নগদ/ইউপিআই পরিমাণ ঋণাত্মক হতে পারে না' }, { status: 400 });
      }
      if (cash + upi !== declaredPaid) {
        return NextResponse.json(
          { success: false, error: 'Mixed পেমেন্টে নগদ + ইউপিআই = মোট পরিশোধিত হতে হবে' },
          { status: 400 }
        );
      }
    }

    const result: any = await db.$transaction(async (tx) => {
      // Lock the purchase row first to serialize concurrent receives.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM purchases WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE
      `;
      if (!locked[0]) {
        throw new ReceiveError('ক্রয় অর্ডার খুঁজে পাওয়া যায়নি', 404);
      }

      const order = await tx.purchase.findFirst({
        where: { id, businessId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, nameBn: true, unit: true, currentStock: true, buyingPrice: true } },
            },
          },
          supplier: true,
        },
      });

      if (!order) {
        throw new ReceiveError('ক্রয় অর্ডার খুঁজে পাওয়া যায়নি', 404);
      }

      if (order.deliveryStatus === 'RECEIVED' || order.deliveryStatus === 'CANCELLED') {
        throw new ReceiveError('শুধুমাত্র পেন্ডিং বা অর্ডার করা বা আংশিক প্রাপ্ত অর্ডার প্রাপ্ত করা যাবে', 400);
      }

      const receivedByItemId = new Map(receivedItems.map((r) => [r.id, Number(r.receivedQty)]));

      let receivedTotalAmount = 0;

      for (const orderItem of order.items) {
        const requested = receivedByItemId.get(orderItem.id) ?? 0;
        if (!Number.isFinite(requested) || requested < 0) {
          throw new ReceiveError(`প্রাপ্ত পরিমাণ সঠিক নয়: ${orderItem.productName}`, 400);
        }
        if (requested === 0) continue;

        const alreadyReceived = Number(orderItem.receivedQty) || 0;
        const orderedQty = Number(orderItem.quantity) || 0;
        const remaining = orderedQty - alreadyReceived;

        // Cumulative guard: cannot receive more than what is still outstanding.
        if (requested > remaining) {
          throw new ReceiveError(
            `প্রাপ্ত পরিমাণ অর্ডারের বাকি পরিমাণের (${remaining}) চেয়ে বেশি হতে পারে না: ${orderItem.productName}`,
            400,
          );
        }

        const unitPrice = Number(orderItem.buyingPrice);
        const cumulativeReceived = alreadyReceived + requested;

        await tx.purchaseItem.update({
          where: { id: orderItem.id },
          data: {
            receivedQty: cumulativeReceived,
            totalPrice: cumulativeReceived * unitPrice,
          },
        });

        receivedTotalAmount += requested * unitPrice;

        // Only add the newly received delta to stock (never the cumulative amount).
        if (updateStock) {
          const productRaw = await tx.$queryRaw<Array<{ id: string; currentStock: unknown; buyingPrice: unknown }>>`
            SELECT id, "current_stock" as "currentStock", "buying_price" as "buyingPrice"
            FROM products
            WHERE id = ${orderItem.productId} AND business_id = ${businessId}
            FOR UPDATE
          `;
          if (!productRaw[0]) {
            throw new ReceiveError(`পণ্য খুঁজে পাওয়া যায়নি: ${orderItem.productName}`, 404);
          }

          const currentStock = Number(productRaw[0].currentStock) || 0;
          const currentPrice = productRaw[0].buyingPrice !== null && productRaw[0].buyingPrice !== undefined
            ? Number(productRaw[0].buyingPrice)
            : unitPrice;

          const updateData: Record<string, unknown> = {
            currentStock: { increment: requested },
            updatedAt: new Date(),
          };

          if (unitPrice > 0) {
            const newStock = currentStock + requested;
            if (newStock > 0) {
              const wac = ((currentStock * currentPrice) + (requested * unitPrice)) / newStock;
              updateData.buyingPrice = toUnitPriceNumber(wac);
            } else {
              updateData.buyingPrice = toUnitPriceNumber(unitPrice);
            }
          }

          await tx.product.update({ where: { id: orderItem.productId }, data: updateData });

          await tx.stockHistory.create({
            data: {
              businessId,
              productId: orderItem.productId,
              changeType: 'PURCHASE',
              quantity: requested,
              reason: `Purchase Order Received: ${order.invoiceNumber}`,
              referenceId: order.id,
              purchaseId: order.id,
              createdAt: new Date(),
            },
          });
        }
      }

      // Recompute cumulative state from the (now updated) items.
      const refreshedItems = await tx.purchaseItem.findMany({
        where: { purchaseId: id },
        select: { quantity: true, receivedQty: true, buyingPrice: true },
      });

      const cumulativeTotal = refreshedItems.reduce(
        (sum, item) => sum + (Number(item.receivedQty) || 0) * Number(item.buyingPrice),
        0,
      );
      const roundedTotal = Math.round(cumulativeTotal);
      const allFullyReceived = refreshedItems.every(
        (item) => (Number(item.receivedQty) || 0) >= (Number(item.quantity) || 0),
      );
      const nextDeliveryStatus: any = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      // Payment applied in THIS request, accumulated onto existing paidAmount.
      const thisPayment = amountPaid !== undefined ? Math.round(amountPaid) : Math.round(receivedTotalAmount);
      if (thisPayment < 0) {
        throw new ReceiveError('পরিশোধিত পরিমাণ সঠিক নয়', 400);
      }
      const previousPaid = Number(order.paidAmount) || 0;
      const newPaidAmount = Math.min(previousPaid + thisPayment, roundedTotal);

      let paymentStatus: any = 'PAID';
      if (newPaidAmount === 0) {
        paymentStatus = 'PENDING';
      } else if (newPaidAmount < roundedTotal) {
        paymentStatus = 'PARTIAL';
      }

      const updatedOrder = await tx.purchase.update({
        where: { id },
        data: {
          paymentStatus,
          deliveryStatus: nextDeliveryStatus,
          totalAmount: roundedTotal,
          paidAmount: newPaidAmount,
          paymentMethod: (paymentMethod ? paymentMethod.toUpperCase() : order.paymentMethod) as any,
        },
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, nameBn: true, unit: true } },
            },
          },
        },
      });

      // Expense only for the amount actually paid in this request.
      const appliedPayment = Math.min(Math.max(thisPayment, 0), Math.max(roundedTotal - previousPaid, 0));
      if (appliedPayment > 0) {
        let expenseNotes = `Paid for purchase order: ${order.invoiceNumber}${paymentMethod ? ` (Method: ${paymentMethod})` : ''}`;
        if (normalizedMethod === 'MIXED' && (cashAmount !== undefined || upiAmount !== undefined)) {
          expenseNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
        }
        await tx.expense.create({
          data: {
            businessId,
            amount: appliedPayment,
            category: 'Supplier Payment',
            notes: expenseNotes,
            date: new Date(),
            supplierId: order.supplierId,
            supplierName: order.supplier?.name || null,
          },
        });
      }

      return updatedOrder;
    });

    await logAudit({
      userId: ctx.user.id,
      businessId,
      action: 'RECEIVE_PURCHASE_ORDER',
      entityType: 'Purchase',
      entityId: result.id,
      details: {
        orderNumber: result.invoiceNumber,
        totalAmount: Number(result.totalAmount),
        receivedItemsCount: receivedItems.length,
      },
      ipAddress: getIp(request)
    });

    // Map output to expected frontend format
    const mappedOrder = {
      id: result.id,
      orderNumber: result.invoiceNumber,
      supplierId: result.supplierId,
      status: result.deliveryStatus === 'RECEIVED' ? 'প্রাপ্ত' : 'আংশিক প্রাপ্ত',
      deliveryStatus: result.deliveryStatus,
      totalAmount: Number(result.totalAmount),
      paidAmount: Number(result.paidAmount || 0),
      paymentMethod: result.paymentMethod || 'Cash',
      paymentStatus: result.paymentStatus,
      notes: result.notes,
      expectedDate: result.createdAt.toISOString(),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      supplier: result.supplier ? {
        id: result.supplier.id,
        name: result.supplier.name,
        phone: result.supplier.phone,
      } : null,
      items: result.items.map((item: any) => ({
        id: item.id,
        purchaseOrderId: result.id,
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.buyingPrice),
        totalPrice: Number(item.totalPrice),
        receivedQty: Number(item.receivedQty || 0),
        product: item.product ? {
          id: item.product.id,
          name: item.product.name,
          nameBn: item.product.nameBn || item.product.name,
          unit: item.product.unit,
        } : undefined,
      })),
    };

    return NextResponse.json({
      success: true,
      data: mappedOrder,
      message: result.deliveryStatus === 'RECEIVED' ? 'অর্ডার প্রাপ্ত হয়েছে' : 'আংশিকভাবে প্রাপ্ত হয়েছে',
    });
  } catch (error) {
    if (error instanceof ReceiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('ক্রয় অর্ডার প্রাপ্ত ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার প্রাপ্ত করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
