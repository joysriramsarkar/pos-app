import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// GET /api/daily-manual-records - Fetch all manual daily profit records
export async function GET(request: NextRequest) {
  // Use a generic view permission or check sessions
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
  } catch (error: any) {
    console.error('Failed to fetch daily manual records:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch records' },
      { status: 500 }
    );
  }
}

// POST /api/daily-manual-records - Save/upsert a record
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'reports.view'); // or general write permission
  if (authError) return authError;

  try {
    const body = await request.json();
    const { date, sales, expenses, notes } = body;

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }

    const salesNum = parseFloat(sales) || 0;
    const expensesNum = parseFloat(expenses) || 0;
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

    const session = await getServerSession(authOptions);
    await logAudit({
      userId: session?.user?.id,
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
  } catch (error: any) {
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

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Record ID is required' },
        { status: 400 }
      );
    }

    const record = await db.dailyManualRecord.delete({
      where: { id },
    });

    const session = await getServerSession(authOptions);
    await logAudit({
      userId: session?.user?.id,
      action: 'DELETE_DAILY_MANUAL_RECORD',
      entityType: 'DailyManualRecord',
      entityId: id,
      details: { date: record.date },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Record deleted successfully',
    });
  } catch (error: any) {
    console.error('Failed to delete daily manual record:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete record' },
      { status: 500 }
    );
  }
}
