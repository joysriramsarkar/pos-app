export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';
import { SupplierInputSchema } from '@/schemas';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'suppliers.view');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(10000, Math.max(1, parseInt(searchParams.get('pageSize') ?? '10000', 10)));

    if (id) {
      const supplier = await db.supplier.findUnique({
        where: { id },
        include: { purchases: { take: 10, orderBy: { createdAt: 'desc' } } },
      });
      if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
      return NextResponse.json({ success: true, data: supplier });
    }

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, suppliers] = await Promise.all([
      db.supplier.count({ where }),
      db.supplier.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ success: true, data: suppliers, total, page, pageSize });
  } catch (error: unknown) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'suppliers.create');
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = SupplierInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supplier = await db.supplier.create({
      data: { ...parsed.data, isActive: true },
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: user?.id, action: 'CREATE_SUPPLIER', entityType: 'Supplier', entityId: supplier.id, details: { name: supplier.name }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, data: supplier, message: 'Supplier created successfully' });
  } catch (error: unknown) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ success: false, error: 'Failed to create supplier' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = await requirePermission(request, 'suppliers.edit');
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) return NextResponse.json({ success: false, error: 'Supplier ID is required' }, { status: 400 });

    const parsed = SupplierInputSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supplier = await db.supplier.update({ where: { id }, data: { ...parsed.data, updatedAt: new Date() } });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: user?.id, action: 'UPDATE_SUPPLIER', entityType: 'Supplier', entityId: supplier.id, details: { name: supplier.name }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, data: supplier, message: 'Supplier updated successfully' });
  } catch (error: unknown) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({ success: false, error: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requirePermission(request, 'suppliers.delete');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ success: false, error: 'Supplier ID is required' }, { status: 400 });

    await db.supplier.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: user?.id, action: 'DELETE_SUPPLIER', entityType: 'Supplier', entityId: id, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete supplier' }, { status: 500 });
  }
}
