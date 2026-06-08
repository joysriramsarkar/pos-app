export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// POST /api/purchase-orders/[id]/receive - Mark order as received and update stock
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { receivedItems } = body; // Array of { id: itemId, receivedQty: number }

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
            product: { select: { id: true, name: true, nameBn: true, unit: true, currentStock: true } },
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

    if (order.paymentStatus !== 'Pending' && order.paymentStatus !== 'Ordered') {
      return NextResponse.json(
        { success: false, error: 'শুধুমাত্র পেন্ডিং বা অর্ডার করা অর্ডার প্রাপ্ত করা যাবে' },
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
      if (receivedItem.receivedQty < 0 || receivedItem.receivedQty > orderItem.quantity) {
        return NextResponse.json(
          { success: false, error: `প্রাপ্ত পরিমাণ সঠিক নয়: ${orderItem.productName}` },
          { status: 400 }
        );
      }
    }

    // Update stock and create stock entries in a transaction
    const result = await db.$transaction(async (tx) => {
      // Update each order item and update product stock
      for (const receivedItem of receivedItems) {
        const orderItem = order.items.find((i) => i.id === receivedItem.id);
        if (!orderItem) continue;

        const qty = receivedItem.receivedQty;
        if (qty <= 0) continue;

        // Since we don't have receivedQty in schema, we can adjust quantity if they received less than ordered,
        // or we just log and update the product stock. Let's adjust purchaseItem.quantity to actual received qty.
        await tx.purchaseItem.update({
          where: { id: receivedItem.id },
          data: { quantity: qty },
        });

        // Update product stock and buying price
        const unitPrice = Number(orderItem.buyingPrice);
        await tx.product.update({
          where: { id: orderItem.productId },
          data: {
            currentStock: { increment: qty },
            ...(unitPrice > 0 ? { buyingPrice: unitPrice } : {}),
          },
        });

        // Create stock entry history
        await tx.stockHistory.create({
          data: {
            productId: orderItem.productId,
            changeType: 'purchase',
            quantity: qty,
            reason: `Purchase Order Received: ${order.invoiceNumber}`,
            referenceId: order.id,
          },
        });
      }

      // Update purchase status to received (Paid)
      const updatedOrder = await tx.purchase.update({
        where: { id },
        data: { paymentStatus: 'Paid' },
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, nameBn: true, unit: true } },
            },
          },
        },
      });

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
      paidAmount: Number(result.totalAmount),
      notes: result.notes,
      expectedDate: result.createdAt.toISOString(),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      supplier: result.supplier ? {
        id: result.supplier.id,
        name: result.supplier.name,
        phone: result.supplier.phone,
      } : null,
      items: result.items.map((item) => ({
        id: item.id,
        purchaseOrderId: result.id,
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.buyingPrice),
        totalPrice: Number(item.totalPrice),
        receivedQty: Number(item.quantity),
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
      message: 'অর্ডার প্রাপ্ত হয়েছে এবং স্টক আপডেট হয়েছে',
    });
  } catch (error) {
    console.error('ক্রয় অর্ডার প্রাপ্ত ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার প্রাপ্ত করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
