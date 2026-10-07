export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { logAudit } from "@/lib/audit";

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

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
    const { amountPaid, paymentMethod, cashAmount, upiAmount } = body as {
      amountPaid: number;
      paymentMethod: string;
      cashAmount?: number;
      upiAmount?: number;
    };

    const roundedAmountPaid = Math.round(Number(amountPaid));

    if (!Number.isFinite(roundedAmountPaid) || roundedAmountPaid <= 0) {
      return NextResponse.json(
        { success: false, error: 'পরিশোধিত পরিমাণ সঠিক নয়' },
        { status: 400 }
      );
    }

    // Mixed-payment consistency: cash + upi must equal the declared amount.
    const normalizedMethod = paymentMethod ? String(paymentMethod).toUpperCase() : undefined;
    if (normalizedMethod === 'MIXED') {
      const cash = Number(cashAmount || 0);
      const upi = Number(upiAmount || 0);
      if (cash < 0 || upi < 0) {
        return NextResponse.json({ success: false, error: 'নগদ/ইউপিআই পরিমাণ ঋণাত্মক হতে পারে না' }, { status: 400 });
      }
      if (Math.round(cash + upi) !== roundedAmountPaid) {
        return NextResponse.json(
          { success: false, error: 'Mixed পেমেন্টে নগদ + ইউপিআই = মোট পরিশোধিত হতে হবে' },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // Lock the purchase row to make read-modify-write atomic under concurrency.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM purchases WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE
      `;
      if (!locked[0]) {
        throw new PaymentError('ক্রয় অর্ডার খুঁজে পাওয়া যায়নি', 404);
      }

      const order = await tx.purchase.findFirst({
        where: { id, businessId },
        include: { supplier: true },
      });

      if (!order) {
        throw new PaymentError('ক্রয় অর্ডার খুঁজে পাওয়া যায়নি', 404);
      }

      const totalAmount = Number(order.totalAmount) || 0;
      const currentPaid = Number(order.paidAmount) || 0;
      const outstanding = Math.max(0, totalAmount - currentPaid);

      // Never allow overpayment beyond the order total.
      if (roundedAmountPaid > outstanding) {
        throw new PaymentError(
          `পরিশোধ বাকি পরিমাণের (${outstanding}) চেয়ে বেশি হতে পারে না`,
          400,
        );
      }

      const newPaid = Math.min(currentPaid + roundedAmountPaid, totalAmount);

      let paymentStatus: any = 'PAID';
      if (newPaid === 0) {
        paymentStatus = 'PENDING';
      } else if (newPaid < totalAmount) {
        paymentStatus = 'PARTIAL';
      }

      const updatedOrder = await tx.purchase.update({
        where: { id: order.id },
        data: {
          paidAmount: newPaid,
          paymentStatus,
          paymentMethod: (paymentMethod ? paymentMethod.toUpperCase() : order.paymentMethod) as any,
        },
      });

      let expenseNotes = `Paid for purchase order: ${order.invoiceNumber}${paymentMethod ? ` (Method: ${paymentMethod})` : ''}`;
      if (normalizedMethod === 'MIXED' && (cashAmount !== undefined || upiAmount !== undefined)) {
        expenseNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
      }

      await tx.expense.create({
        data: {
          businessId,
          amount: roundedAmountPaid,
          category: 'Supplier Payment',
          notes: expenseNotes,
          date: new Date(),
          supplierId: order.supplierId,
          supplierName: order.supplier?.name || null,
        },
      });

      return updatedOrder;
    });

    await logAudit({
      userId: ctx.user.id,
      businessId,
      action: 'RECORD_PURCHASE_ORDER_PAYMENT',
      entityType: 'Purchase',
      entityId: result.id,
      details: {
        orderNumber: result.invoiceNumber,
        amountPaid: roundedAmountPaid,
        paymentMethod,
      },
      ipAddress: getIp(request)
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'পেমেন্ট সফলভাবে সংরক্ষিত হয়েছে',
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error recording payment for purchase order:', error);
    return NextResponse.json(
      { success: false, error: 'পেমেন্ট সংরক্ষণ করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
