export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';

const supplierPaymentSchema = z.object({
  supplierId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((value) => toMoneyNumber(value)),
  paymentMethod: z.string().default('Cash'),
  cashAmount: z.coerce.number().optional().default(0),
  upiAmount: z.coerce.number().optional().default(0),
  notes: z.string().optional(),
});

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

function calculateSupplierBalances(supplier: {
  purchases: { totalAmount: any }[];
  expenses: { amount: any; notes?: string | null }[];
}) {
  let basePurchases = 0;
  for (const p of supplier.purchases) {
    basePurchases += Number(p.totalAmount);
  }

  let extraPurchases = 0;
  let totalPaid = 0;

  for (const e of supplier.expenses) {
    const amount = Number(e.amount);
    totalPaid += amount;

    const notes = e.notes || '';
    if (notes.startsWith('Paid supplier:')) {
      // manual payment
    } else if (notes.startsWith('Paid for purchase order:') || notes.startsWith('Paid for direct purchase:')) {
      // PO payment
    } else {
      extraPurchases += amount;
    }
  }

  const totalPurchases = Math.round(basePurchases + extraPurchases);
  const totalPaidRounded = Math.round(totalPaid);
  const totalDue = totalPurchases - totalPaidRounded;

  return { totalPurchases, totalPaid: totalPaidRounded, totalDue };
}

/**
 * POST /api/supplier-payment
 *
 * Records a payment TO a supplier (reducing their outstanding due).
 * Strategy:
 *   1. Create an Expense record (category='Supplier Payment') so it appears in the ledger.
 *   2. Apply the payment against oldest unpaid Purchases (FIFO), updating paidAmount.
 *   3. Return updated supplier balances.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await requirePermission(request, 'suppliers.edit');
    if (authError) return authError;

    const body = await request.json();
    const validation = supplierPaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'সঠিক তথ্য প্রদান করুন' }, { status: 400 });
    }

    const { supplierId, amount, paymentMethod, cashAmount, upiAmount, notes } = validation.data;
    const roundedAmount = Math.round(amount);

    const result = await db.$transaction(async (tx) => {
      // Load supplier with all unpaid/partial POs
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        include: {
          purchases: {
            where: {
              deliveryStatus: { in: ['Received', 'PartiallyReceived'] },
              paymentStatus: { in: ['Pending', 'Partial'] },
            },
            orderBy: { createdAt: 'asc' }, // FIFO - oldest first
          },
        },
      });

      if (!supplier) throw new Error('Supplier not found');

      // Validate that due exists
      const totalPoDue = supplier.purchases.reduce((sum, p) => {
        return sum + (Number(p.totalAmount) - Number(p.paidAmount || 0));
      }, 0);

      if (totalPoDue <= 0 && roundedAmount > 0) {
        // No POs to apply against, but still record the payment as expense
        // (manual payment against non-PO debt)
      }

      // Build notes string
      let paymentNotes = notes || `Paid supplier: ${supplier.name}`;
      if (!paymentNotes.startsWith('Paid supplier:')) {
        paymentNotes = `Paid supplier: ${supplier.name}` + (notes ? ` - ${notes}` : '');
      }
      if (paymentMethod === 'Mixed') {
        paymentNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
      }

      // 1. Create Expense record (for ledger visibility)
      await tx.expense.create({
        data: {
          amount: roundedAmount,
          category: 'Supplier Payment',
          notes: paymentNotes,
          paymentMethod,
          date: new Date(),
          supplierId,
          supplierName: supplier.name,
        },
      });

      // 2. Apply payment against oldest POs (FIFO)
      let remaining = roundedAmount;
      for (const po of supplier.purchases) {
        if (remaining <= 0) break;

        const poDue = Number(po.totalAmount) - Number(po.paidAmount || 0);
        if (poDue <= 0) continue;

        const toApply = Math.min(remaining, poDue);
        const newPaidAmount = Number(po.paidAmount || 0) + toApply;
        const newPaymentStatus =
          Math.abs(newPaidAmount - Number(po.totalAmount)) < 0.01 ? 'Paid' : 'Partial';

        await tx.purchase.update({
          where: { id: po.id },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus: newPaymentStatus,
          },
        });

        remaining -= toApply;
      }

      // 3. Re-fetch to compute fresh balances
      const updatedSupplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        include: {
          purchases: {
            where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } },
          },
          expenses: {
            where: { isActive: true, category: 'Supplier Payment' },
          },
        },
      });

      if (!updatedSupplier) throw new Error('Supplier not found after update');

      const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(updatedSupplier);

      const authUser = await getAuthenticatedUser(request);
      await logAudit({
        userId: authUser?.id,
        action: 'SUPPLIER_PAYMENT',
        entityType: 'Supplier',
        entityId: supplierId,
        details: {
          supplierName: updatedSupplier.name,
          amountPaid: amount,
          paymentMethod,
          remainingDue: totalDue,
        },
        ipAddress: getIp(request),
      });

      return {
        ...updatedSupplier,
        purchases: undefined,
        expenses: undefined,
        totalPurchases,
        totalPaid,
        totalDue,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Error recording supplier payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const statusCode = errorMessage === 'Supplier not found' ? 404 : 500;
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}
