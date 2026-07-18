import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';
import { DailyManualRecordInputSchema } from '@/schemas';

// GET /api/daily-manual-records - Fetch all manual daily profit records
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'reports.view');
  if (authError) return authError;

  try {
    const records = await db.dailyManualRecord.findMany({
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: records.map(r => ({
        ...r,
        sales: Number(r.sales),
        expenses: Number(r.expenses),
        profit: Number(r.profit),
      })),
    });
  } catch (error: unknown) {
    console.error('Failed to fetch daily manual records:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch records' },
      { status: 500 }
    );
  }
}

// POST /api/daily-manual-records - Save/upsert a record
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'reports.view');
  if (authError) return authError;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = DailyManualRecordInputSchema.safeParse(body);
    if (!parsed.success) {
      const errors = Object.values(parsed.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 }
      );
    }

    const { date, sales: salesNum, expenses: expensesNum, notes } = parsed.data;
    const profitNum = salesNum - expensesNum;

    const record = await db.dailyManualRecord.upsert({
      where: { date },
      update: {
        sales: salesNum,
        expenses: expensesNum,
        profit: profitNum,
        notes: notes || null,
      },
      create: {
        date,
        sales: salesNum,
        expenses: expensesNum,
        profit: profitNum,
        notes: notes || null,
      },
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: user?.id,
      action: 'SAVE_DAILY_MANUAL_RECORD',
      entityType: 'DailyManualRecord',
      entityId: record.id,
      details: { date, sales: salesNum, expenses: expensesNum, profit: profitNum },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...record,
        sales: Number(record.sales),
        expenses: Number(record.expenses),
        profit: Number(record.profit),
      },
    });
  } catch (error: unknown) {
    console.error('Failed to save daily manual record:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save record' },
      { status: 500 }
    );
  }
}

// DELETE /api/daily-manual-records - Delete a manual record
export async function DELETE(request: NextRequest) {
  const authError = await requirePermission(request, 'reports.view');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || id.length > 64) {
      return NextResponse.json(
        { success: false, error: 'Record id is required' },
        { status: 400 }
      );
    }

    await db.dailyManualRecord.delete({ where: { id } });

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: user?.id,
      action: 'DELETE_DAILY_MANUAL_RECORD',
      entityType: 'DailyManualRecord',
      entityId: id,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete daily manual record:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete record' },
      { status: 500 }
    );
  }
}
