export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { addMoney, toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';
import {
  reserveIdempotency,
  finalizeIdempotency,
  releaseIdempotency,
} from '@/lib/idempotency';

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

    // DB-level idempotency: reserve the key up front. Concurrent retries of the
    // same HTTP request cannot both credit the customer.
    const idempotencyKey = req.headers.get('X-Idempotency-Key');
    let claim: Awaited<ReturnType<typeof reserveIdempotency>> | null = null;

    if (idempotencyKey) {
      claim = await reserveIdempotency(businessId, 'prepayment:add', idempotencyKey);
      if (claim.status === 'replay') {
        const cached = (claim.result ?? {}) as { customerId?: string };
        const customer = cached.customerId
          ? await db.customer.findFirst({ where: { id: cached.customerId, businessId } })
          : await db.customer.findFirst({ where: { id: customerId, businessId } });
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
      ? `PREPAY-${idempotencyKey}`
      : `PREPAY-${Date.now()}-${customerId.slice(-6)}`;

    let updatedCustomer: Awaited<ReturnType<typeof db.customer.update>>;
    try {
      updatedCustomer = await db.$transaction(async (tx) => {
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
          where: { id: customerId },
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

        return updated;
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
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const statusCode = errorMessage === 'Customer not found' ? 404 : 500;
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}

