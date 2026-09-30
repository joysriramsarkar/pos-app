/**
 * GET /api/shifts/[id] — Get shift summary
 * PATCH /api/shifts/[id] — Close a shift
 */
import { NextResponse } from 'next/server';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { getShiftSummary, closeShift } from '@/server/services/shift.service';
import { z } from 'zod';
import { domainError, ERROR_CODES } from '@/lib/domain-errors';

const CloseShiftSchema = z.object({
  action: z.literal('close'),
  actualCash: z.number().min(0),
  notes: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  try {
    const summary = await getShiftSummary(id, ctx.business.id);
    return NextResponse.json({ success: true, data: summary });
  } catch (err: any) {
    if (err.code) {
      return NextResponse.json(domainError(err.code, err.message), { status: err.httpStatus ?? 400 });
    }
    console.error('[shifts/id] GET error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to get shift summary'),
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

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

  const parsed = CloseShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      domainError(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', {
        issues: parsed.error.issues,
      }),
      { status: 400 }
    );
  }

  try {
    const summary = await closeShift({
      shiftId: id,
      businessId: ctx.business.id,
      userId: ctx.user.id,
      actualCash: parsed.data.actualCash,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (err: any) {
    if (err.code) {
      return NextResponse.json(
        domainError(err.code, err.message, err.details),
        { status: err.httpStatus ?? 400 }
      );
    }
    console.error('[shifts/id] PATCH error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to close shift'),
      { status: 500 }
    );
  }
}
