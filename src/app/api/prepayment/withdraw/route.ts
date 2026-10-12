export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { toMoneyNumber } from '@/lib/money';
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  IdempotencyInProgress,
} from '@/lib/idempotency';
import { toClientError } from '@/lib/api-errors';

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

    // MP-32: idempotency INSIDE the business transaction — claim, mutate and
    // finalize commit atomically. A crash/rollback can never strand an
    // "in_progress" claim, and finalize is never swallowed.
    const idempotencyKey = req.headers.get('X-Idempotency-Key');

    const referenceId = idempotencyKey
      ? `WITHDRAW-${idempotencyKey}`
      : `WITHDRAW-${Date.now()}-${customerId.slice(-6)}`;

    let updated: Awaited<ReturnType<typeof db.customer.update>>;
    try {
      const outcome = await db.$transaction(async (tx) => {
        const claim = await claimIdempotencyTx<{ customerId: string }>(
          tx, businessId, 'prepayment:withdraw', idempotencyKey,
        );
        if (claim.replay) return { replay: claim.result } as const;

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

        if (claim.claim) {
          await finalizeIdempotencyTx(tx, claim.claim, { customerId });
        }
        return { data: result } as const;
      });

      if ("replay" in outcome) {
        const customer = await db.customer.findFirst({ where: { id: customerId, businessId } });
        return NextResponse.json({ success: true, data: customer, idempotent: true });
      }
      updated = outcome.data;
    } catch (txError) {
      if (txError instanceof IdempotencyInProgress) {
        return NextResponse.json(
          { success: false, code: "INPROGRESS", error: 'একই অনুরোধ প্রক্রিয়াধীন আছে (duplicate request in progress)' },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
      throw txError;
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    // MP-35: known business errors keep their message+status; everything else
    // becomes a generic 500 (never Prisma internals).
    if (error instanceof Error && error.message === 'Customer not found') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'Insufficient prepaid balance') {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const { message, status } = toClientError(error, 'Failed to process withdrawal');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
