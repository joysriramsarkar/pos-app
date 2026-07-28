export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requirePermission } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { toMoneyNumber, toUnitPriceNumber } from '@/lib/money';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// GET /api/purchase-orders - List purchase orders
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'suppliers.view');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');

    const where: Record<string, any> = {};
    if (supplierId) where.supplierId = supplierId;

    if (status && status !== 'সব') {
      if (status === 'পেন্ডিং') where.deliveryStatus = 'Pending';
      else if (status === 'অর্ডার করা') where.deliveryStatus = 'Ordered';
      else if (status === 'প্রাপ্ত') where.deliveryStatus = { in: ['Received', 'PartiallyReceived'] };
      else if (status === 'বাতিল') where.deliveryStatus = 'Cancelled';
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
      if (p.deliveryStatus === 'Ordered') mappedStatus = 'অর্ডার করা';
      else if (p.deliveryStatus === 'Received' || p.deliveryStatus === 'PartiallyReceived') mappedStatus = 'প্রাপ্ত';
      else if (p.deliveryStatus === 'Cancelled') mappedStatus = 'বাতিল';

      return {
        id: p.id,
        orderNumber: p.invoiceNumber || `PO-UNKNOWN-${p.id}`,
        supplierId: p.supplierId,
        status: mappedStatus,
        totalAmount: Number(p.totalAmount),
        paidAmount: Number(p.paidAmount || 0),
        paymentMethod: p.paymentMethod || 'Cash',
        paymentStatus: p.paymentStatus,
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
  const authError = await requirePermission(request, 'suppliers.create');
  if (authError) return authError;

  try {
    const body = await request.json();
    const { supplierId, items, expectedDate, notes, directReceive, amountPaid, paymentMethod, cashAmount, upiAmount, gstPercentage } = body;

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

    const generalGstRate = gstPercentage ? Number(gstPercentage) : 0;
    let totalAmount = 0;
    let totalGstAmount = 0;

    const processedItems = items.map((item: { productId: string; quantity: number; unitPrice: number; gstPercentage?: number }) => {
      const qty = item.quantity;
      const price = item.unitPrice;
      const itemSubtotal = qty * price;
      const itemGstRate = item.gstPercentage !== undefined && item.gstPercentage !== null && !isNaN(Number(item.gstPercentage))
        ? Number(item.gstPercentage)
        : generalGstRate;
      const itemGstAmount = toMoneyNumber(itemSubtotal * (itemGstRate / 100));
      totalGstAmount += itemGstAmount;
      const itemTotalPrice = toMoneyNumber(itemSubtotal + itemGstAmount);
      totalAmount += itemTotalPrice;

      return {
        ...item,
        totalPrice: itemTotalPrice
      };
    });

    totalAmount = toMoneyNumber(totalAmount);

    let finalNotes = notes || '';
    if (totalGstAmount > 0) {
      const currencyRow = await db.setting.findUnique({ where: { key: 'currency_symbol' } });
      const currencySymbol = currencyRow?.value || '₹';
      const gstNote = `মোট জিএসটি: ${currencySymbol}${totalGstAmount.toFixed(2)}`;
      finalNotes = finalNotes ? `${finalNotes}\n${gstNote}` : gstNote;
    }

    let purchaseDate = new Date();
    if (expectedDate) {
      const parts = expectedDate.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        purchaseDate = new Date(year, month, day, 12, 0, 0);
      } else {
        purchaseDate = new Date(expectedDate);
      }
    }
    const dateStr = purchaseDate.getFullYear().toString() +
      String(purchaseDate.getMonth() + 1).padStart(2, '0') +
      String(purchaseDate.getDate()).padStart(2, '0');

    let purchase: any;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        purchase = await db.$transaction(async (tx) => {
          // Find the latest order number for today inside transaction to be serial and safe
          const latestOrder = await tx.purchase.findFirst({
            where: {
              invoiceNumber: { startsWith: `PO-${dateStr}-` },
            },
            orderBy: {
              invoiceNumber: 'desc',
            },
          });

          let nextSeq = 1;
          if (latestOrder && latestOrder.invoiceNumber) {
            const parts = latestOrder.invoiceNumber.split('-');
            const lastSeqStr = parts[parts.length - 1];
            const lastSeq = parseInt(lastSeqStr, 10);
            if (!isNaN(lastSeq)) {
              nextSeq = lastSeq + 1;
            }
          }
          const seq = String(nextSeq).padStart(4, '0');
          const orderNumber = `PO-${dateStr}-${seq}`;

          if (directReceive) {
            let paymentStatus = 'Paid';
            const actualAmountPaid = amountPaid !== undefined ? amountPaid : Math.round(totalAmount);
            if (actualAmountPaid === 0) {
              paymentStatus = 'Pending';
            } else if (actualAmountPaid < totalAmount) {
              paymentStatus = 'Partial';
            }

            // Create and receive in one transaction
            const p = await tx.purchase.create({
              data: {
                invoiceNumber: orderNumber,
                supplierId: (supplierId && supplierId !== 'none') ? supplierId : null,
                totalAmount,
                paidAmount: actualAmountPaid,
                paymentStatus,
                paymentMethod: paymentMethod || 'Cash',
                deliveryStatus: 'Received',
                notes: finalNotes || null,
                createdAt: purchaseDate,
                 items: {
                  create: await Promise.all(processedItems.map(async (item: any) => {
                    const product = await tx.product.findUnique({ where: { id: item.productId } });
                    return {
                      productId: item.productId,
                      productName: product?.name || 'Unknown',
                      quantity: item.quantity,
                      receivedQty: item.quantity,
                      buyingPrice: item.unitPrice,
                      totalPrice: item.totalPrice,
                    };
                  })),
                },
              },
              include: {
                supplier: true,
                items: {
                  include: {
                    product: {
                      select: { id: true, name: true, nameBn: true, unit: true, currentStock: true, buyingPrice: true },
                    },
                  },
                },
              },
            });

            // Update product stock and WAC and create stock history (FEATURE DISABLED TEMPORARILY)
            /*
            for (const item of p.items) {
              const qty = Number(item.quantity);
              const unitPrice = Number(item.buyingPrice);

              const product = await tx.product.findUnique({
                where: { id: item.productId }
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
                where: { id: item.productId },
                data: updateData,
              });

              await tx.stockHistory.create({
                data: {
                  productId: item.productId,
                  changeType: 'purchase',
                  quantity: qty,
                  reason: `Direct Purchase: ${p.invoiceNumber}`,
                  referenceId: p.id,
                  purchaseId: p.id,
                  createdAt: purchaseDate,
                },
              });
            }
            */


            if (actualAmountPaid > 0) {
              let expenseNotes = `Paid for direct purchase: ${p.invoiceNumber}${paymentMethod ? ` (Method: ${paymentMethod})` : ''}`;
              if (paymentMethod === 'Mixed' && (cashAmount !== undefined || upiAmount !== undefined)) {
                expenseNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
              }
              await tx.expense.create({
                data: {
                  amount: actualAmountPaid,
                  category: 'Supplier Payment',
                  notes: expenseNotes,
                  date: purchaseDate,
                  supplierId: p.supplierId,
                  supplierName: p.supplier?.name || null,
                },
              });
            }

            return p;
          } else {
            // Normal flow (Pending status)
            return await tx.purchase.create({
              data: {
                invoiceNumber: orderNumber,
                supplierId: (supplierId && supplierId !== 'none') ? supplierId : null,
                totalAmount,
                paidAmount: 0,
                paymentStatus: 'Pending',
                paymentMethod: paymentMethod || 'Cash',
                deliveryStatus: 'Pending',
                notes: finalNotes || null,
                createdAt: purchaseDate,
                 items: {
                  create: await Promise.all(processedItems.map(async (item: any) => {
                    const product = await tx.product.findUnique({ where: { id: item.productId } });
                    return {
                      productId: item.productId,
                      productName: product?.name || 'Unknown',
                      quantity: item.quantity,
                      receivedQty: 0,
                      buyingPrice: item.unitPrice,
                      totalPrice: item.totalPrice,
                    };
                  })),
                },
              },
              include: {
                supplier: true,
                items: {
                  include: {
                    product: {
                      select: { id: true, name: true, nameBn: true, unit: true, currentStock: true, buyingPrice: true },
                    },
                  },
                },
              },
            });
          }
        });
        break; // break the retry loop on success
      } catch (err: any) {
        if (err.code === 'P2002' && attempts < maxAttempts - 1) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
          continue;
        }
        throw err;
      }
    }

    if (!purchase) {
      throw new Error('Failed to generate purchase order');
    }

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: user?.id,
      action: directReceive ? 'RECEIVE_PURCHASE_ORDER' : 'CREATE_PURCHASE_ORDER',
      entityType: 'Purchase',
      entityId: purchase.id,
      details: {
        orderNumber: purchase.invoiceNumber,
        totalAmount: Number(purchase.totalAmount),
        supplierId: purchase.supplierId,
        itemCount: purchase.items.length,
        direct: directReceive,
      },
      ipAddress: getIp(request)
    });

    const isPaid = purchase.paymentStatus === 'Paid';
    let mappedStatus = 'পেন্ডিং';
    if (purchase.deliveryStatus === 'Ordered') mappedStatus = 'অর্ডার করা';
    else if (purchase.deliveryStatus === 'Received' || purchase.deliveryStatus === 'PartiallyReceived') mappedStatus = 'প্রাপ্ত';
    else if (purchase.deliveryStatus === 'Cancelled') mappedStatus = 'বাতিল';

    const mappedOrder = {
      id: purchase.id,
      orderNumber: purchase.invoiceNumber,
      supplierId: purchase.supplierId,
      status: mappedStatus,
      totalAmount: Number(purchase.totalAmount),
      paidAmount: Number(purchase.paidAmount || 0),
      paymentMethod: purchase.paymentMethod || 'Cash',
      paymentStatus: purchase.paymentStatus,
      notes: purchase.notes,
      expectedDate: expectedDate || null,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
      supplier: purchase.supplier ? {
        id: purchase.supplier.id,
        name: purchase.supplier.name,
        phone: purchase.supplier.phone,
      } : null,
      items: purchase.items.map((item: any) => ({
        id: item.id,
        purchaseOrderId: purchase.id,
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

    return NextResponse.json(
      { success: true, data: mappedOrder, message: isPaid ? 'ক্রয় সফল হয়েছে' : 'ক্রয় অর্ডার তৈরি হয়েছে' },
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
  const authError = await requirePermission(request, 'suppliers.edit');
  if (authError) return authError;

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

    let nextDeliveryStatus = 'Pending';
    if (status === 'অর্ডার করা' && order.deliveryStatus === 'Pending') {
      nextDeliveryStatus = 'Ordered';
    } else if (status === 'বাতিল' && (order.deliveryStatus === 'Pending' || order.deliveryStatus === 'Ordered')) {
      nextDeliveryStatus = 'Cancelled';
    } else {
      return NextResponse.json(
        { success: false, error: 'এই অবস্থা পরিবর্তন অনুমোদিত নয়' },
        { status: 400 }
      );
    }

    const updated = await db.purchase.update({
      where: { id },
      data: { deliveryStatus: nextDeliveryStatus },
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { id: true, name: true, nameBn: true, unit: true } },
          },
        },
      },
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: user?.id,
      action: 'UPDATE_PURCHASE_ORDER_STATUS',
      entityType: 'Purchase',
      entityId: updated.id,
      details: {
        orderNumber: updated.invoiceNumber,
        oldStatus: order.deliveryStatus,
        newStatus: updated.deliveryStatus,
      },
      ipAddress: getIp(request)
    });

    let mappedStatus = 'পেন্ডিং';
    if (updated.deliveryStatus === 'Ordered') mappedStatus = 'অর্ডার করা';
    else if (updated.deliveryStatus === 'Cancelled') mappedStatus = 'বাতিল';

    const mappedOrder = {
      id: updated.id,
      orderNumber: updated.invoiceNumber,
      supplierId: updated.supplierId,
      status: mappedStatus,
      totalAmount: Number(updated.totalAmount),
      paidAmount: Number(updated.paidAmount || 0),
      paymentMethod: updated.paymentMethod || 'Cash',
      paymentStatus: updated.paymentStatus,
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

    return NextResponse.json({ success: true, data: mappedOrder, message: 'অর্ডার অবস্থা আপডেট হয়েছে' });
  } catch (error) {
    console.error('ক্রয় অর্ডার আপডেট ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'ক্রয় অর্ডার আপডেট করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
