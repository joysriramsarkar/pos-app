export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { toMoneyNumber } from '@/lib/money';
import {
  reserveIdempotency,
  finalizeIdempotency,
  releaseIdempotency,
} from '@/lib/idempotency';

const withdrawSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((v) => toMoneyNumber(v)),
});

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (!authResult.authorized) return authResult.response;

    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    // Withdrawing advance cash uses a dedicated permission (not generic
    // customers.update) so it can be restricted separately from customer edits.
    const denied = checkPermission(ctx, 'customers.prepayment.withdraw');
    if (denied) return denied;

    const businessId = ctx.business.id;

    const body = await req.json();
    const validation = withdrawSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.format() }, { status: 400 });
    }

    const { customerId, amount } = validation.data;

    // DB-level idempotency: a retried HTTP request must not withdraw twice.
    const idempotencyKey = req.headers.get('X-Idempotency-Key');
    let claim: Awaited<ReturnType<typeof reserveIdempotency>> | null = null;

    if (idempotencyKey) {
      claim = await reserveIdempotency(businessId, 'prepayment:withdraw', idempotencyKey);
      if (claim.status === 'replay') {
        const customer = await db.customer.findFirst({ where: { id: customerId, businessId } });
        return NextResponse.json({ success: true, data: customer, idempotent: true });
      }
      if (claim.status === 'in_progress') {
        return NextResponse.json(
          { success: false, error: 'একই অনুরোধ প্রক্রিয়াধীন আছে (duplicate request in progress)' },
          { status: 409 },
        );
      }
    }

    const referenceId = idempotencyKey
      ? `WITHDRAW-${idempotencyKey}`
      : `WITHDRAW-${Date.now()}-${customerId.slice(-6)}`;

    let updated: Awaited<ReturnType<typeof db.customer.update>>;
    try {
      updated = await db.$transaction(async (tx) => {
        const customerRaw = await tx.$queryRaw<
          Array<{ id: string; totalDue: unknown; prepaidBalance: unknown }>
        >`
          SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
          FROM customers
          WHERE id = ${customerId} AND business_id = ${businessId}
          FOR UPDATE
        `;
        const customer = customerRaw[0];
        if (!customer) throw new Error('Customer not found');
        if (toMoneyNumber(Number(customer.prepaidBalance)) < amount) {
          throw new Error('Insufficient prepaid balance');
        }

        const newBalance = toMoneyNumber(
          new Decimal(Number(customer.prepaidBalance)).minus(amount),
        );

        const result = await tx.customer.update({
          where: { id: customerId, businessId },
          data: { prepaidBalance: newBalance },
        });

        await tx.ledgerEntry.create({
          data: {
            businessId,
            customerId,
            entryType: 'PREPAYMENT_WITHDRAW',
            amount,
            balanceAfter: toMoneyNumber(Number(customer.totalDue)),
            description: 'অ্যাডভান্স ব্যালেন্স থেকে নগদ উত্তোলন',
            referenceId,
          },
        });

        return result;
      });
    } catch (txError) {
      if (claim && claim.status === 'claimed') {
        await releaseIdempotency(claim.idempotencyKey).catch(() => {});
      }
      throw txError;
    }

    if (claim && claim.status === 'claimed') {
      await finalizeIdempotency(claim.idempotencyKey, { customerId }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg === 'Customer not found' ? 404 : msg === 'Insufficient prepaid balance' ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
