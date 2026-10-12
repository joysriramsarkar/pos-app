export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { addMoney, toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  IdempotencyInProgress,
} from '@/lib/idempotency';
import { toClientError } from '@/lib/api-errors';

const prepaymentSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((value) => toMoneyNumber(value)),
});

const getIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

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

    // MP-32: idempotency INSIDE the business transaction (claim + finalize
    // commit atomically — no stuck claims, no swallowed finalizes).
    const idempotencyKey = req.headers.get('X-Idempotency-Key');

    const referenceId = idempotencyKey
      ? `PREPAY-${idempotencyKey}`
      : `PREPAY-${Date.now()}-${customerId.slice(-6)}`;

    let updatedCustomer: Awaited<ReturnType<typeof db.customer.update>>;
    try {
      const outcome = await db.$transaction(async (tx) => {
        const claim = await claimIdempotencyTx<{ customerId: string }>(
          tx, businessId, 'prepayment:add', idempotencyKey,
        );
        if (claim.replay) return { replay: claim.result } as const;

        const customerRaw = await tx.$queryRaw<any[]>`
          SELECT id, name, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
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
          where: { id: customerId, businessId },
          data: { prepaidBalance: newPrepaidBalance },
        });

        await tx.ledgerEntry.create({
          data: {
            businessId,
            customerId,
            entryType: 'PREPAYMENT_ADDED',
            amount,
            balanceAfter: customer.totalDue,
            // stable referenceId for idempotency dedup
            referenceId,
            description: 'Prepayment added',
          },
        });

        if (claim.claim) {
          await finalizeIdempotencyTx(tx, claim.claim, { customerId });
        }
        return { data: updated } as const;
      });

      if ("replay" in outcome) {
        const cached = (outcome.replay ?? {}) as { customerId?: string };
        const customer = cached.customerId
          ? await db.customer.findFirst({ where: { id: cached.customerId, businessId } })
          : await db.customer.findFirst({ where: { id: customerId, businessId } });
        return NextResponse.json({ success: true, data: customer, idempotent: true });
      }
      updatedCustomer = outcome.data;
    } catch (txError) {
      if (txError instanceof IdempotencyInProgress) {
        return NextResponse.json(
          { success: false, code: "INPROGRESS", error: 'একই অনুরোধ প্রক্রিয়াধীন আছে (duplicate request in progress)' },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
      throw txError;
    }

    // Bug 13 fix: audit log was missing for prepayment additions
    await logAudit({
      userId: ctx.user.id,
      businessId,
      action: 'PREPAYMENT_ADDED',
      entityType: 'Customer',
      entityId: customerId,
      details: { amount, referenceId },
      ipAddress: getIp(req),
    });

    return NextResponse.json({ success: true, data: updatedCustomer });
  } catch (error: unknown) {
    console.error('Error adding prepayment:', error);
    if (error instanceof Error && error.message === 'Customer not found') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    const { message, status } = toClientError(error, 'Failed to add prepayment');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

