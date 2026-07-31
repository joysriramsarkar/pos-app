export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requirePermission } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { toMoneyNumber, toUnitPriceNumber } from '@/lib/money';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// POST /api/purchase-orders/[id]/receive - Mark order as received and update stock
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await requirePermission(request, 'suppliers.edit');
  if (authError) return authError;

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

    const order = await db.purchase.findUnique({
      where: { id },
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
      return NextResponse.json(
        { success: false, error: 'ক্রয় অর্ডার খুঁজে পাওয়া যায়নি' },
        { status: 404 }
      );
    }

    if (order.deliveryStatus === 'Received' || order.deliveryStatus === 'Cancelled') {
      return NextResponse.json(
        { success: false, error: 'শুধুমাত্র পেন্ডিং বা অর্ডার করা বা আংশিক প্রাপ্ত অর্ডার প্রাপ্ত করা যাবে' },
        { status: 400 }
      );
    }

    // Validate received quantities
    for (const receivedItem of receivedItems) {
      const orderItem = order.items.find((i) => i.id === receivedItem.id);
      if (!orderItem) {
        return NextResponse.json(
          { success: false, error: 'অর্ডার আইটেম খুঁজে পাওয়া যায়নি' },
          { status: 400 }
        );
      }
      if (receivedItem.receivedQty < 0 || receivedItem.receivedQty > Number(orderItem.quantity)) {
        return NextResponse.json(
          { success: false, error: `প্রাপ্ত পরিমাণ সঠিক নয়: ${orderItem.productName}` },
          { status: 400 }
        );
      }
    }

    // Determine delivery status
    let allFullyReceived = true;
    for (const item of order.items) {
      const receivedItem = receivedItems.find((ri) => ri.id === item.id);
      const qty = receivedItem ? receivedItem.receivedQty : 0;
      if (qty < Number(item.quantity)) {
        allFullyReceived = false;
      }
    }
    const nextDeliveryStatus = allFullyReceived ? 'Received' : 'PartiallyReceived';

    // Update stock and create stock entries in a transaction
    const result: any = await db.$transaction(async (tx) => {
      // Update each order item and update product stock
      for (const receivedItem of receivedItems) {
        const orderItem = order.items.find((i) => i.id === receivedItem.id);
        if (!orderItem) continue;

        const qty = receivedItem.receivedQty;
        if (qty <= 0) continue;

        // Update receivedQty and totalPrice (receivedQty * buyingPrice)
        const unitPrice = Number(orderItem.buyingPrice);
        await tx.purchaseItem.update({
          where: { id: receivedItem.id },
          data: {
            receivedQty: qty,
            totalPrice: qty * unitPrice
          },
        });

        // Update product stock and calculate WAC conditionally
        if (updateStock) {
          const product = await tx.product.findUnique({
            where: { id: orderItem.productId },
          });

          const updateData: any = {
            currentStock: { increment: qty },
            updatedAt: new Date(),
          };

          if (unitPrice > 0) {
            const currentStock = Number(product?.currentStock) || 0;
            const newStock = currentStock + qty;
            if (newStock > 0) {
              const currentPrice = product?.buyingPrice !== null && product?.buyingPrice !== undefined
                ? Number(product.buyingPrice)
                : unitPrice;
              const wac = ((currentStock * currentPrice) + (qty * unitPrice)) / newStock;
              updateData.buyingPrice = toUnitPriceNumber(wac);
            } else {
              updateData.buyingPrice = toUnitPriceNumber(unitPrice);
            }
          }

          await tx.product.update({
            where: { id: orderItem.productId },
            data: updateData,
          });

          // Create stock entry history
          await tx.stockHistory.create({
            data: {
              productId: orderItem.productId,
              changeType: 'purchase',
              quantity: qty,
              reason: `Purchase Order Received: ${order.invoiceNumber}`,
              referenceId: order.id,
              purchaseId: order.id,
              createdAt: order.createdAt,
            },
          });
        }
      }

      // Calculate receivedTotalAmount
      let receivedTotalAmount = 0;
      for (const receivedItem of receivedItems) {
        const orderItem = order.items.find((i) => i.id === receivedItem.id);
        if (orderItem) {
          receivedTotalAmount += receivedItem.receivedQty * Number(orderItem.buyingPrice);
        }
      }
      const actualAmountPaid = amountPaid !== undefined ? amountPaid : receivedTotalAmount;
      let paymentStatus = 'Paid';
      if (actualAmountPaid === 0) {
        paymentStatus = 'Pending';
      } else if (actualAmountPaid < receivedTotalAmount) {
        paymentStatus = 'Partial';
      }

      // Update purchase status to received (Paid) and set totalAmount based on received quantities
      const updatedOrder = await tx.purchase.update({
        where: { id },
        data: {
          paymentStatus,
          deliveryStatus: nextDeliveryStatus,
          totalAmount: receivedTotalAmount,
          paidAmount: actualAmountPaid,
          paymentMethod: paymentMethod || 'Cash'
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

      // Create Expense record for payment if actualAmountPaid > 0
      if (actualAmountPaid > 0) {
        let expenseNotes = `Paid for purchase order: ${order.invoiceNumber}${paymentMethod ? ` (Method: ${paymentMethod})` : ''}`;
        if (paymentMethod === 'Mixed' && (cashAmount !== undefined || upiAmount !== undefined)) {
          expenseNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
        }
        await tx.expense.create({
          data: {
            amount: actualAmountPaid,
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

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: user?.id,
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
      status: 'প্রাপ্ত',
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
      message: 'অর্ডার প্রাপ্ত হয়েছে',
    });
  } catch (error) {
    console.error('ক্রয় অর্ডার প্রাপ্ত ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার প্রাপ্ত করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
