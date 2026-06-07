export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// Helper: Generate refund invoice number REF-YYYYMMDD-XXXX
async function generateRefundInvoiceNumber(): Promise<string> {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');

  const prefix = `REF-${dateStr}-`;
  const lastRefund = await db.sale.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let sequence = 1;
  if (lastRefund) {
    const lastSeq = parseInt(lastRefund.invoiceNumber.split('-').pop() || '0', 10);
    sequence = lastSeq + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

// POST /api/refunds - Process a sale refund
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { saleId, items, refundMethod } = body as {
      saleId: string;
      items: Array<{ productId: string; quantity: number }>;
      refundMethod: string;
    };

    // Validate required fields
    if (!saleId) {
      return NextResponse.json(
        { success: false, error: 'বিক্রয় আইডি আবশ্যক' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'কমপক্ষে একটি পণ্য রিফান্ড করতে হবে' },
        { status: 400 }
      );
    }

    // Map input refundMethod
    const methodMap: Record<string, string> = {
      'নগদ': 'Cash',
      'Cash': 'Cash',
      'বাকি': 'Due',
      'Due': 'Due'
    };
    const mappedMethod = methodMap[refundMethod] || refundMethod;

    if (!['Cash', 'Due'].includes(mappedMethod)) {
      return NextResponse.json(
        { success: false, error: 'রিফান্ড পদ্ধতি সঠিক নয়' },
        { status: 400 }
      );
    }

    // Find the original sale
    const originalSale = await db.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        customer: true,
      },
    });

    if (!originalSale) {
      return NextResponse.json(
        { success: false, error: 'মূল বিক্রয় খুঁজে পাওয়া যায়নি' },
        { status: 404 }
      );
    }

    // Check if sale is already refunded or cancelled
    if (originalSale.status === 'Refunded') {
      return NextResponse.json(
        { success: false, error: 'এই বিক্রয় ইতিমধ্যে রিফান্ড করা হয়েছে' },
        { status: 400 }
      );
    }

    if (originalSale.status === 'Cancelled') {
      return NextResponse.json(
        { success: false, error: 'বাতিল করা বিক্রয় রিফান্ড করা যাবে না' },
        { status: 400 }
      );
    }

    // Validate refund items belong to the original sale
    const saleItemMap = new Map(originalSale.items.map(item => [item.productId, item]));
    let totalRefundAmount = 0;
    const validatedItems: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const refundItem of items) {
      const saleItem = saleItemMap.get(refundItem.productId);
      if (!saleItem) {
        return NextResponse.json(
          { success: false, error: `পণ্য এই বিক্রয়ে পাওয়া যায়নি: ${refundItem.productId}` },
          { status: 400 }
        );
      }

      if (refundItem.quantity <= 0) {
        return NextResponse.json(
          { success: false, error: 'রিফান্ড পরিমাণ শূন্যের চেয়ে বেশি হতে হবে' },
          { status: 400 }
        );
      }

      if (Number(refundItem.quantity) > Number(saleItem.quantity)) {
        return NextResponse.json(
          { success: false, error: `রিফান্ড পরিমাণ মূল পরিমাণের বেশি: ${saleItem.productName} (সর্বোচ্চ: ${saleItem.quantity})` },
          { status: 400 }
        );
      }

      const itemTotalPrice = Number(saleItem.unitPrice) * refundItem.quantity;
      totalRefundAmount += itemTotalPrice;

      validatedItems.push({
        productId: refundItem.productId,
        productName: saleItem.productName,
        quantity: refundItem.quantity,
        unitPrice: Number(saleItem.unitPrice),
        totalPrice: itemTotalPrice,
      });
    }

    // Check if refund method is 'Due' but no customer or no due
    if (mappedMethod === 'Due') {
      if (!originalSale.customerId) {
        return NextResponse.json(
          { success: false, error: 'সাধারণ ক্রেতার বাকি কমানো সম্ভব নয়। নগদ রিফান্ড নির্বাচন করুন।' },
          { status: 400 }
        );
      }
      if (originalSale.customer && Number(Number(originalSale.customer.totalDue)) <= 0) {
        return NextResponse.json(
          { success: false, error: 'ক্রেতার কোনো বকেয়া নেই। নগদ রিফান্ড নির্বাচন করুন।' },
          { status: 400 }
        );
      }
    }

    // Check if this is a full refund (all items with max quantity)
    const isFullRefund = items.length === originalSale.items.length &&
      items.every(ri => {
        const si = saleItemMap.get(ri.productId);
        return si && Number(ri.quantity) === Number(si.quantity);
      });

    // Calculate refund proportion of discount and tax
    const originalSubtotal = Number(originalSale.subtotal) || 1; // Prevent division by zero
    const refundRatio = totalRefundAmount / originalSubtotal;
    const refundDiscount = (Number(originalSale.discount) || 0) * refundRatio;
    const refundTax = (Number(originalSale.tax) || 0) * refundRatio;
    const netRefundAmount = totalRefundAmount - refundDiscount + refundTax;

    // Process refund in a transaction
    const refund = await db.$transaction(async (tx) => {
      // Create refund sale record with negative amounts
      const refundInvoiceNumber = await generateRefundInvoiceNumber();
      const refundSale = await tx.sale.create({
        data: {
          invoiceNumber: refundInvoiceNumber,
          customerId: originalSale.customerId,
          userId: originalSale.userId,
          subtotal: -totalRefundAmount,
          discount: refundDiscount,
          tax: -refundTax,
          totalAmount: -netRefundAmount,
          amountPaid: mappedMethod === 'Cash' ? -netRefundAmount : 0,
          cashAmount: mappedMethod === 'Cash' ? -netRefundAmount : 0,
          upiAmount: 0,
          paymentMethod: mappedMethod,
          paymentStatus: mappedMethod === 'Cash' ? 'Paid' : 'Due',
          status: 'Refunded',
          notes: `মূল ইনভয়েস: ${originalSale.invoiceNumber} এর রিফান্ড`,
          items: {
            create: validatedItems.map(item => ({
              productId: item.productId,
              productName: item.productName,
              quantity: -Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              totalPrice: -item.totalPrice,
            })),
          },
        },
        include: {
          items: true,
          customer: true,
        },
      });

      // Restore stock for each refunded item
      for (const item of validatedItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              increment: Number(item.quantity),
            },
          },
        });
      }

      // Create StockHistory records
      await tx.stockHistory.createMany({
        data: validatedItems.map(item => ({
          productId: item.productId,
          changeType: 'return',
          quantity: Number(item.quantity),
          reason: `Refund: ${refundInvoiceNumber} for original ${originalSale.invoiceNumber}`,
          referenceId: refundSale.id,
        })),
      });

      // If refund method is 'Due', reduce customer due
      if (mappedMethod === 'Due' && originalSale.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: originalSale.customerId },
        });
        if (customer) {
          const currentDue = Number(Number(customer.totalDue));
          const dueReduction = Math.min(netRefundAmount, currentDue);
          const newDue = currentDue - dueReduction;
          
          await tx.customer.update({
            where: { id: originalSale.customerId },
            data: {
              totalDue: newDue,
              updatedAt: new Date(),
            },
          });

          await tx.ledgerEntry.create({
            data: {
              customerId: originalSale.customerId,
              entryType: 'debit',
              amount: dueReduction,
              balanceAfter: newDue,
              description: `Refund: reverse due for ${originalSale.invoiceNumber}`,
              referenceId: refundSale.id,
            },
          });
        }
      }

      // Update original sale status
      if (isFullRefund) {
        await tx.sale.update({
          where: { id: originalSale.id },
          data: { status: 'Refunded' },
        });
      } else {
        await tx.sale.update({
          where: { id: originalSale.id },
          data: { status: 'PartialReturn' },
        });
      }

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: 'REFUND',
          entityType: 'Sale',
          entityId: originalSale.id,
          details: JSON.stringify({
            originalInvoice: originalSale.invoiceNumber,
            refundInvoice: refundInvoiceNumber,
            refundAmount: netRefundAmount,
            refundMethod: mappedMethod,
            isFullRefund,
            items: validatedItems.map(i => ({
              product: i.productName,
              quantity: i.quantity,
              amount: i.totalPrice,
            })),
          }),
        },
      });

      return { refundSale, isFullRefund, netRefundAmount };
    });

    return NextResponse.json({
      success: true,
      data: {
        refund: refund.refundSale,
        isFullRefund: refund.isFullRefund,
        refundAmount: refund.netRefundAmount,
        originalSaleId: originalSale.id,
        originalInvoice: originalSale.invoiceNumber,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('রিফান্ড প্রক্রিয়ায় ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'রিফান্ড প্রক্রিয়ায় ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
