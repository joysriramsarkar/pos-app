/**
 * GET /api/dashboard/alerts — Get actionable dashboard alerts
 */
import { NextResponse } from 'next/server';
import { requireBusinessContext } from '@/lib/tenant';
import { getDashboardAlerts, getTodaySummary } from '@/server/services/dashboard-alerts.service';
import { domainError, ERROR_CODES } from '@/lib/domain-errors';

export async function GET(request: Request) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(request.url);
  const include = url.searchParams.get('include')?.split(',') ?? [];

  try {
    const [alerts, todaySummary] = await Promise.all([
      getDashboardAlerts(ctx.business.id),
      include.includes('summary') ? getTodaySummary(ctx.business.id) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        alerts,
        ...(todaySummary ? { today: todaySummary } : {}),
      },
    });
  } catch (err) {
    console.error('[dashboard/alerts] GET error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to get dashboard alerts'),
      { status: 500 }
    );
  }
}
