export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';
import { toMoneyNumber } from '@/lib/money';

const withdrawSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((v) => toMoneyNumber(v)),
});

export async function POST(req: NextRequest) {
  try {
    const authError = await requirePermission(req, 'customers.edit');
    if (authError) return authError;

    const body = await req.json();
    const validation = withdrawSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.format() }, { status: 400 });
    }

    const { customerId, amount } = validation.data;

    const updated = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new Error('Customer not found');
      if (toMoneyNumber(customer.prepaidBalance) < amount) throw new Error('Insufficient prepaid balance');

      const newBalance = toMoneyNumber(new Decimal(customer.prepaidBalance).minus(amount));

      const result = await tx.customer.update({
        where: { id: customerId },
        data: { prepaidBalance: newBalance },
      });

      await tx.ledgerEntry.create({
        data: {
          customerId,
          entryType: 'withdraw',
          amount,
          balanceAfter: newBalance,
          description: 'অ্যাডভান্স ব্যালেন্স থেকে নগদ উত্তোলন',
          referenceId: `WITHDRAW-${Date.now()}`,
        },
      });

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg === 'Customer not found' ? 404 : msg === 'Insufficient prepaid balance' ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
