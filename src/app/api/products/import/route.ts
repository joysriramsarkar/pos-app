/**
 * POST /api/products/import — Import products from CSV
 * Body: { csv: string, mode: 'preview' | 'commit' }
 *
 * Preview mode: validates and returns preview without saving
 * Commit mode: saves valid rows to database
 */
import { NextResponse } from 'next/server';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import {
  parseProductCSV,
  previewImport,
  commitImport,
  getImportTemplate,
} from '@/server/services/product-import.service';
import { domainError, ERROR_CODES } from '@/lib/domain-errors';
import { z } from 'zod';

const ImportSchema = z.object({
  csv: z.string().min(1),
  mode: z.enum(['preview', 'commit']),
});

export async function POST(request: Request) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const permError = checkPermission(ctx, 'products.create');
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

  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      domainError(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', {
        issues: parsed.error.issues,
      }),
      { status: 400 }
    );
  }

  const { csv, mode } = parsed.data;

  try {
    const rows = parseProductCSV(csv);

    if (rows.length === 0) {
      return NextResponse.json(
        domainError(ERROR_CODES.INVALID_INPUT, 'No rows found in CSV'),
        { status: 400 }
      );
    }

    if (rows.length > 5000) {
      return NextResponse.json(
        domainError(ERROR_CODES.INVALID_INPUT, 'Maximum 5000 rows per import'),
        { status: 400 }
      );
    }

    if (mode === 'preview') {
      const preview = await previewImport(rows, ctx.business.id);
      return NextResponse.json({ success: true, data: preview });
    }

    // Commit mode
    const previewResult = await previewImport(rows, ctx.business.id);
    // Tag rows with their status before committing
    const taggedRows = rows.map((row, i) => ({
      ...row,
      ...previewResult.rows[i],
    }));

    const result = await commitImport(taggedRows, ctx.business.id, ctx.user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[products/import] POST error:', err);
    return NextResponse.json(
      domainError(ERROR_CODES.INTERNAL_ERROR, 'Import failed'),
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  if (type === 'template') {
    const csv = getImportTemplate();
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="product-import-template.csv"',
      },
    });
  }

  return NextResponse.json(
    domainError(ERROR_CODES.INVALID_INPUT, 'Use ?type=template to get import template'),
    { status: 400 }
  );
}
