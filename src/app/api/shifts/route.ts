/**
 * POST /api/shifts — Open a new cash register shift
 */
import { NextResponse } from 'next/server';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { openShift, getCurrentShift } from '@/server/services/shift.service';
import { z } from 'zod';
import { domainError, ERROR_CODES } from '@/lib/domain-errors';

const OpenShiftSchema = z.object({
  openingCash: z.number().min(0, 'Opening cash cannot be negative'),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const permError = checkPermission(ctx, 'sales.create');
  if (permError) return permError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      domainError(ERROR_CODES.INVALID_INPUT, 'Invalid JSON'),
      { status: 400 }
    );
  }

  const parsed = OpenShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      domainError(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', {
        issues: parsed.error.issues,
      }),
      { status: 400 }
    );
  }

  try {
    const shift = await openShift({
      businessId: ctx.business.id,
      userId: ctx.user.id,
      openingCash: parsed.data.openingCash,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ success: true, data: shift }, { status: 201 });
  } catch (err: any) {
    if (err.code === 'SHIFT_ALREADY_OPEN') {
      return NextResponse.json(
        domainError(err.code, err.message, err.details),
        { status: 400 }
      );
    }
    console.error('[shifts] POST error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to open shift'),
      { status: 500 }
    );
  }
}

export async function GET() {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const shift = await getCurrentShift(ctx.business.id);
    return NextResponse.json({ success: true, data: shift });
  } catch (err: any) {
    if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      return NextResponse.json({ success: true, data: null });
    }
    console.error('[shifts] GET error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to get shift'),
      { status: 500 }
    );
  }
}
