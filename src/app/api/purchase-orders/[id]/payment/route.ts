export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requirePermission } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { toMoneyNumber } from '@/lib/money';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await requirePermission(request, 'suppliers.edit');
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { amountPaid, paymentMethod, cashAmount, upiAmount } = body as {
      amountPaid: number;
      paymentMethod: string;
      cashAmount?: number;
      upiAmount?: number;
    };

    const roundedAmountPaid = Math.round(amountPaid);

    if (roundedAmountPaid <= 0) {
      return NextResponse.json(
        { success: false, error: 'পরিশোধিত পরিমাণ সঠিক নয়' },
        { status: 400 }
      );
    }

    const order = await db.purchase.findUnique({
      where: { id },
      include: { supplier: true },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'ক্রয় অর্ডার খুঁজে পাওয়া যায়নি' },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const currentPaid = Number(order.paidAmount || 0);
      const newPaid = toMoneyNumber(currentPaid + roundedAmountPaid);
      const totalAmount = Number(order.totalAmount);

      let paymentStatus = 'Paid';
      if (newPaid === 0) {
        paymentStatus = 'Pending';
      } else if (newPaid < totalAmount) {
        paymentStatus = 'Partial';
      }

      const updatedOrder = await tx.purchase.update({
        where: { id: order.id },
        data: {
          paidAmount: newPaid,
          paymentStatus,
          paymentMethod: paymentMethod || order.paymentMethod || 'Cash',
        },
      });

      let expenseNotes = `Paid for purchase order: ${order.invoiceNumber}${paymentMethod ? ` (Method: ${paymentMethod})` : ''}`;
      if (paymentMethod === 'Mixed' && (cashAmount !== undefined || upiAmount !== undefined)) {
        expenseNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
      }

      await tx.expense.create({
        data: {
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

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: user?.id,
      action: 'RECORD_PURCHASE_ORDER_PAYMENT',
      entityType: 'Purchase',
      entityId: result.id,
      details: {
        orderNumber: result.invoiceNumber,
        amountPaid,
        paymentMethod,
      },
      ipAddress: getIp(request)
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('ক্রয় অর্ডার পেমেন্ট ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'পেমেন্ট রেকর্ড করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
