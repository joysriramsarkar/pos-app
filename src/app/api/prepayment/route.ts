export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { addMoney, toMoneyNumber } from '@/lib/money';

const prepaymentSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((value) => toMoneyNumber(value)),
});

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (!authResult.authorized) return authResult.response;

    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    const denied = checkPermission(ctx, 'due.collect');
    if (denied) return denied;

    const businessId = ctx.business.id;

    const body = await req.json();
    const validation = prepaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.format() }, { status: 400 });
    }

    const { customerId, amount } = validation.data;

    const updatedCustomer = await db.$transaction(async (tx) => {
      const customerRaw = await tx.$queryRaw<any[]>`
        SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
        FROM customers
        WHERE id = ${customerId} AND business_id = ${businessId}
        FOR UPDATE
      `;
      const customer = customerRaw[0];

      if (!customer) {
        throw new Error('Customer not found');
      }

      const newPrepaidBalance = addMoney(customer.prepaidBalance, amount);

      const updated = await tx.customer.update({
        where: { id: customerId },
        data: {
          prepaidBalance: newPrepaidBalance,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          businessId,
          customerId: customerId,
          entryType: 'prepayment-added',
          amount: amount,
          balanceAfter: customer.totalDue,
          description: 'Prepayment added',
          referenceId: `PREPAY-${Date.now()}`,
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: updatedCustomer });
  } catch (error: unknown) {
    console.error('Error adding prepayment:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const statusCode = errorMessage === 'Customer not found' ? 404 : 500;
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}
