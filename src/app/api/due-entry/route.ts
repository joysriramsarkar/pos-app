export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { addMoney, toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';

const dueEntrySchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((value) => toMoneyNumber(value)),
  description: z.string().optional().transform(v => v === '' ? undefined : v),
});

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// POST /api/due-entry - Manually record a due (increase customer outstanding due)
export async function POST(request: NextRequest) {
  try {
    const authError = await requirePermission(request, 'customers.edit');
    if (authError) return authError;

    const body = await request.json();
    const validation = dueEntrySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'সঠিক তথ্য প্রদান করুন' }, { status: 400 });
    }

    const { customerId, amount, description } = validation.data;

    const updatedCustomer = await db.$transaction(async (tx) => {
      const customerRaw = await tx.$queryRaw<any[]>`
        SELECT id, "total_due" as "totalDue", "total_paid" as "totalPaid"
        FROM customers
        WHERE id = ${customerId}
        FOR UPDATE
      `;
      const customer = customerRaw[0];

      if (!customer) {
        throw new Error('Customer not found');
      }

      const currentDue = Number(customer.totalDue);
      const newDueAmount = toMoneyNumber(addMoney(currentDue, amount));

      const updated = await tx.customer.update({
        where: { id: customerId },
        data: {
          totalDue: newDueAmount,
          updatedAt: new Date(),
        },
      });

      const entryDescription = description || 'Manual due entry (ম্যানুয়াল বাকি এন্ট্রি)';

      await tx.ledgerEntry.create({
        data: {
          customerId,
          entryType: 'credit', // Credit increases due balance
          amount: amount,
          balanceAfter: newDueAmount,
          description: entryDescription,
          referenceId: `MANUAL-${Date.now()}`,
        },
      });

      const authUser = await getAuthenticatedUser(request);
      await logAudit({
        userId: authUser?.id,
        action: 'MANUAL_DUE_ENTRY',
        entityType: 'Customer',
        entityId: customerId,
        details: {
          customerName: updated.name,
          addedDue: amount,
          previousDue: currentDue,
          newDue: newDueAmount,
          description: entryDescription,
        },
        ipAddress: getIp(request),
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: updatedCustomer,
    });
  } catch (error: unknown) {
    console.error('Error adding manual due:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const statusCode = errorMessage === 'Customer not found' ? 404 : 500;
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}
