export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CustomerInputSchema } from '@/schemas';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'customers.view');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const phone = searchParams.get('phone');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    if (id) {
      const customer = await db.customer.findUnique({
        where: { id },
        include: {
          sales: { take: 10, orderBy: { createdAt: 'desc' } },
          ledgerEntries: { take: 20, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!customer) return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
      return NextResponse.json({ success: true, data: customer });
    }

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (phone) where.phone = phone;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const customers = await db.customer.findMany({
      where,
      orderBy: [{ totalDue: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ success: true, data: customers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'customers.create');
  if (authError) return authError;

  try {
    const body = await request.json();
    const result = CustomerInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json({ success: false, error: errors || 'Validation failed' }, { status: 400 });
    }

    const validatedData = result.data;
    if (validatedData.phone) {
      const existing = await db.customer.findUnique({ where: { phone: validatedData.phone } });
      if (existing) return NextResponse.json({ success: false, error: 'Customer with this phone already exists' }, { status: 400 });
    }

    const customer = await db.customer.create({
      data: {
        name: validatedData.name,
        nameEn: validatedData.nameEn || null,
        phone: validatedData.phone || null,
        address: validatedData.address || null,
        notes: validatedData.notes || null,
        totalDue: validatedData.totalDue || 0,
        totalPaid: validatedData.totalPaid || 0,
        isActive: true,
      },
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: (user as any)?.id, action: 'CREATE_CUSTOMER', entityType: 'Customer', entityId: customer.id, details: { name: customer.name, phone: customer.phone }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, data: customer, message: 'Customer created successfully' });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ success: false, error: 'Failed to create customer' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = await requirePermission(request, 'customers.edit');
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, error: 'Customer ID is required' }, { status: 400 });

    const result = CustomerInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json({ success: false, error: errors || 'Validation failed' }, { status: 400 });
    }

    const { id, ...validatedData } = result.data;
    if (validatedData.phone) {
      const existing = await db.customer.findFirst({ where: { phone: validatedData.phone, id: { not: body.id } } });
      if (existing) return NextResponse.json({ success: false, error: 'Another customer with this phone already exists' }, { status: 400 });
    }

    const customer = await db.customer.update({ where: { id: body.id }, data: { ...validatedData, updatedAt: new Date() } });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: (user as any)?.id, action: 'UPDATE_CUSTOMER', entityType: 'Customer', entityId: customer.id, details: { name: customer.name }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, data: customer, message: 'Customer updated successfully' });
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ success: false, error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requirePermission(request, 'customers.delete');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Customer ID is required' }, { status: 400 });

    const customer = await db.customer.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: (user as any)?.id, action: 'DELETE_CUSTOMER', entityType: 'Customer', entityId: id, details: { name: customer.name }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete customer' }, { status: 500 });
  }
}
