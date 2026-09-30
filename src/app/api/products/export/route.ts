/**
 * GET /api/products/export — Export products as CSV
 */
import { NextResponse } from 'next/server';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { exportProductsCSV } from '@/server/services/product-import.service';
import { domainError, ERROR_CODES } from '@/lib/domain-errors';

export async function GET() {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const permError = checkPermission(ctx, 'products.view');
  if (permError) return permError;

  try {
    const csv = await exportProductsCSV(ctx.business.id);
    const filename = `products-${ctx.business.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[products/export] GET error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Export failed'),
      { status: 500 }
    );
  }
}
