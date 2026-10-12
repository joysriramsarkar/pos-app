export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  IdempotencyInProgress,
} from '@/lib/idempotency';
import { toClientError } from '@/lib/api-errors';

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
 *   1. Create an Expense record (category='Supplier Payment') with businessId.
 *   2. Apply the payment against oldest unpaid Purchases (FIFO), updating paidAmount.
 *   3. Return updated supplier balances.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    const denied = checkPermission(ctx, 'suppliers.edit');
    if (denied) return denied;

    const businessId = ctx.business.id;

    const body = await request.json();
    const validation = supplierPaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'সঠিক তথ্য প্রদান করুন' }, { status: 400 });
    }

    const { supplierId, amount, paymentMethod, cashAmount, upiAmount, notes } = validation.data;
    const roundedAmount = Math.round(amount);

    // Mixed-payment consistency: the breakdown must sum to the total paid.
    const normalizedMethod = (paymentMethod || 'CASH').toUpperCase();
    if (normalizedMethod === 'MIXED') {
      const cash = Number(cashAmount || 0);
      const upi = Number(upiAmount || 0);
      if (cash < 0 || upi < 0) {
        return NextResponse.json({ success: false, error: 'নগদ/ইউপিআই পরিমাণ ঋণাত্মক হতে পারে না' }, { status: 400 });
      }
      if (Math.round(cash + upi) !== roundedAmount) {
        return NextResponse.json(
          { success: false, error: 'Mixed পেমেন্টে নগদ + ইউপিআই = মোট পরিশোধিত হতে হবে' },
          { status: 400 },
        );
      }
    }

    // MP-32: idempotency INSIDE the business transaction (claim + finalize
    // commit atomically — no stuck claims, no swallowed finalizes).
    const idempotencyKey = request.headers.get('X-Idempotency-Key');

    let result: Record<string, unknown>;
    try {
      const outcome = await db.$transaction(async (tx) => {
        const claim = await claimIdempotencyTx<Record<string, unknown>>(
          tx, businessId, 'supplier:payment', idempotencyKey,
        );
        if (claim.replay) return { replay: claim.result } as const;
      // Lock the supplier row to serialise concurrent payments for this supplier.
      const lockRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM suppliers WHERE id = ${supplierId} AND business_id = ${businessId} FOR UPDATE
      `;
      if (!lockRows[0]) throw new Error('Supplier not found');

      // Load supplier with all unpaid/partial POs for this business
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, businessId },
        include: {
          purchases: {
            where: {
              deliveryStatus: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] },
              paymentStatus: { in: ['PENDING', 'PARTIAL'] },
            },
            orderBy: { createdAt: 'asc' }, // FIFO - oldest first
          },
        },
      });

      if (!supplier) throw new Error('Supplier not found');

      // Build notes string
      let paymentNotes = notes || `Paid supplier: ${supplier.name}`;
      if (!paymentNotes.startsWith('Paid supplier:')) {
        paymentNotes = `Paid supplier: ${supplier.name}` + (notes ? ` - ${notes}` : '');
      }
      if (paymentMethod === 'Mixed') {
        paymentNotes += ` [নগদ: ${cashAmount || 0}, ইউপিআই: ${upiAmount || 0}]`;
      }

      // 1. Create Expense record (for ledger visibility) with businessId
      await tx.expense.create({
        data: {
          businessId,
          amount: roundedAmount,
          category: 'Supplier Payment',
          notes: paymentNotes,
          paymentMethod: (paymentMethod ? paymentMethod.toUpperCase() : 'CASH') as any,
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
        const newPaymentStatus: any =
          Math.abs(newPaidAmount - Number(po.totalAmount)) < 0.01 ? 'PAID' : 'PARTIAL';

        await tx.purchase.updateMany({
          where: { id: po.id, businessId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus: newPaymentStatus,
          },
        });

        remaining -= toApply;
      }

      // 3. Re-fetch to compute fresh balances
      const updatedSupplier = await tx.supplier.findFirst({
        where: { id: supplierId, businessId },
        include: {
          purchases: {
            where: { deliveryStatus: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } },
          },
          expenses: {
            where: { isActive: true, category: 'Supplier Payment' },
          },
        },
      });

      if (!updatedSupplier) throw new Error('Supplier not found after update');

      const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(updatedSupplier);

      await logAudit({
        userId: ctx.user.id,
        businessId,
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

      const payload = {
        ...updatedSupplier,
        purchases: undefined,
        expenses: undefined,
        totalPurchases,
        totalPaid,
        totalDue,
      };
        if (claim.claim) {
          await finalizeIdempotencyTx(tx, claim.claim, payload);
        }
        return { data: payload } as const;
      });

      if ("replay" in outcome) {
        return NextResponse.json({ success: true, data: outcome.replay, idempotent: true });
      }
      result = outcome.data;
    } catch (txError) {
      if (txError instanceof IdempotencyInProgress) {
        return NextResponse.json(
          { success: false, code: "INPROGRESS", error: 'একই অনুরোধ প্রক্রিয়াধীন আছে (duplicate request in progress)' },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
      throw txError;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Error recording supplier payment:', error);
    if (error instanceof Error && error.message === 'Supplier not found') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    const { message, status } = toClientError(error, 'Failed to record supplier payment');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
