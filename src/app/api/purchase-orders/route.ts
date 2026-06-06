export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/purchase-orders - List purchase orders
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');

    const where: Record<string, any> = {};
    if (supplierId) where.supplierId = supplierId;

    if (status && status !== 'সব') {
      if (status === 'পেন্ডিং') where.paymentStatus = 'Pending';
      else if (status === 'অর্ডার করা') where.paymentStatus = 'Ordered';
      else if (status === 'প্রাপ্ত') where.paymentStatus = 'Paid';
      else if (status === 'বাতিল') where.paymentStatus = 'Cancelled';
    } else {
      where.invoiceNumber = { startsWith: 'PO-' };
    }

    const purchases = await db.purchase.findMany({
      where,
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, nameBn: true, unit: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mappedOrders = purchases.map((p) => {
      let mappedStatus = 'পেন্ডিং';
      if (p.paymentStatus === 'Ordered') mappedStatus = 'অর্ডার করা';
      else if (p.paymentStatus === 'Paid') mappedStatus = 'প্রাপ্ত';
      else if (p.paymentStatus === 'Cancelled') mappedStatus = 'বাতিল';

      return {
        id: p.id,
        orderNumber: p.invoiceNumber || `PO-UNKNOWN-${p.id}`,
        supplierId: p.supplierId,
        status: mappedStatus,
        totalAmount: Number(p.totalAmount),
        paidAmount: p.paymentStatus === 'Paid' ? Number(p.totalAmount) : 0,
        notes: p.notes,
        expectedDate: p.createdAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        supplier: p.supplier ? {
          id: p.supplier.id,
          name: p.supplier.name,
          phone: p.supplier.phone,
        } : null,
        items: p.items.map((item) => ({
          id: item.id,
          purchaseOrderId: p.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: Number(item.buyingPrice),
          totalPrice: Number(item.totalPrice),
          receivedQty: p.paymentStatus === 'Paid' ? item.quantity : 0,
          product: item.product ? {
            id: item.product.id,
            name: item.product.name,
            nameBn: item.product.nameBn || item.product.name,
            unit: item.product.unit,
          } : undefined,
        })),
      };
    });

    return NextResponse.json({ success: true, data: mappedOrders });
  } catch (error) {
    console.error('ক্রয় অর্ডার লোড ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার লোড করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders - Create new purchase order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, items, expectedDate, notes } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'কমপক্ষে একটি পণ্য যোগ করুন' },
        { status: 400 }
      );
    }

    if (supplierId && supplierId !== 'none') {
      const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) {
        return NextResponse.json(
          { success: false, error: 'সাপ্লায়ার খুঁজে পাওয়া যায়নি' },
          { status: 400 }
        );
      }
    }

    for (const item of items) {
      const product = await db.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        return NextResponse.json(
          { success: false, error: `পণ্য খুঁজে পাওয়া যায়নি: ${item.productId}` },
          { status: 400 }
        );
      }
    }

    // Generate PO number
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    const todayOrders = await db.purchase.findMany({
      where: {
        invoiceNumber: { startsWith: `PO-${dateStr}` },
      },
    });
    const seq = String(todayOrders.length + 1).padStart(4, '0');
    const orderNumber = `PO-${dateStr}-${seq}`;

    const totalAmount = items.reduce(
      (sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice,
      0
    );

    const purchase = await db.purchase.create({
      data: {
        invoiceNumber: orderNumber,
        supplierId: (supplierId && supplierId !== 'none') ? supplierId : null,
        totalAmount,
        paymentStatus: 'Pending',
        notes: notes || null,
        items: {
          create: await Promise.all(items.map(async (item: { productId: string; quantity: number; unitPrice: number }) => {
            const product = await db.product.findUnique({ where: { id: item.productId } });
            return {
              productId: item.productId,
              productName: product?.name || 'Unknown',
              quantity: item.quantity,
              buyingPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            };
          })),
        },
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, nameBn: true, unit: true },
            },
          },
        },
      },
    });

    const mappedOrder = {
      id: purchase.id,
      orderNumber: purchase.invoiceNumber,
      supplierId: purchase.supplierId,
      status: 'পেন্ডিং',
      totalAmount: Number(purchase.totalAmount),
      paidAmount: 0,
      notes: purchase.notes,
      expectedDate: expectedDate || null,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
      supplier: purchase.supplier ? {
        id: purchase.supplier.id,
        name: purchase.supplier.name,
        phone: purchase.supplier.phone,
      } : null,
      items: purchase.items.map((item) => ({
        id: item.id,
        purchaseOrderId: purchase.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.buyingPrice),
        totalPrice: Number(item.totalPrice),
        receivedQty: 0,
        product: item.product ? {
          id: item.product.id,
          name: item.product.name,
          nameBn: item.product.nameBn || item.product.name,
          unit: item.product.unit,
        } : undefined,
      })),
    };

    return NextResponse.json(
      { success: true, data: mappedOrder, message: 'ক্রয় অর্ডার তৈরি হয়েছে' },
      { status: 201 }
    );
  } catch (error) {
    console.error('ক্রয় অর্ডার তৈরি ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার তৈরি করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}

// PUT /api/purchase-orders - Update purchase order (status change)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'অর্ডার আইডি আবশ্যক' },
        { status: 400 }
      );
    }

    const order = await db.purchase.findUnique({
      where: { id },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'ক্রয় অর্ডার খুঁজে পাওয়া যায়নি' },
        { status: 404 }
      );
    }

    let nextPaymentStatus = 'Pending';
    if (status === 'অর্ডার করা' && order.paymentStatus === 'Pending') {
      nextPaymentStatus = 'Ordered';
    } else if (status === 'বাতিল' && (order.paymentStatus === 'Pending' || order.paymentStatus === 'Ordered')) {
      nextPaymentStatus = 'Cancelled';
    } else {
      return NextResponse.json(
        { success: false, error: 'এই অবস্থা পরিবর্তন অনুমোদিত নয়' },
        { status: 400 }
      );
    }

    const updated = await db.purchase.update({
      where: { id },
      data: { paymentStatus: nextPaymentStatus },
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { id: true, name: true, nameBn: true, unit: true } },
          },
        },
      },
    });

    let mappedStatus = 'পেন্ডিং';
    if (updated.paymentStatus === 'Ordered') mappedStatus = 'অর্ডার করা';
    else if (updated.paymentStatus === 'Cancelled') mappedStatus = 'বাতিল';

    const mappedOrder = {
      id: updated.id,
      orderNumber: updated.invoiceNumber,
      supplierId: updated.supplierId,
      status: mappedStatus,
      totalAmount: Number(updated.totalAmount),
      paidAmount: 0,
      notes: updated.notes,
      expectedDate: updated.createdAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      supplier: updated.supplier ? {
        id: updated.supplier.id,
        name: updated.supplier.name,
        phone: updated.supplier.phone,
      } : null,
      items: updated.items.map((item) => ({
        id: item.id,
        purchaseOrderId: updated.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.buyingPrice),
        totalPrice: Number(item.totalPrice),
        receivedQty: 0,
        product: item.product ? {
          id: item.product.id,
          name: item.product.name,
          nameBn: item.product.nameBn || item.product.name,
          unit: item.product.unit,
        } : undefined,
      })),
    };

    return NextResponse.json({ success: true, data: mappedOrder, message: 'অর্ডার অবস্থা আপডেট হয়েছে' });
  } catch (error) {
    console.error('ক্রয় অর্ডার আপডেট ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার আপডেট করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
