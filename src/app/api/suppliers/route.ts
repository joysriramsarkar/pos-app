export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { SupplierInputSchema } from '@/schemas';

function calculateSupplierBalances(supplier: {
  purchases: { totalAmount: any }[];
  expenses: { amount: any; notes?: string | null }[];
}) {
  let basePurchases = 0;
  for (const p of supplier.purchases) {
    basePurchases += Number(p.totalAmount);
  }

  let extraPurchases = 0;
  let totalPaid = 0;

  for (const e of supplier.expenses) {
    const amount = Number(e.amount);
    totalPaid += amount;

    const notes = e.notes || '';
    if (notes.startsWith('Paid supplier:')) {
      // manual payment
    } else if (notes.startsWith('Paid for purchase order:') || notes.startsWith('Paid for direct purchase:')) {
      // PO payment
    } else {
      extraPurchases += amount;
    }
  }

  const totalPurchases = Math.round(basePurchases + extraPurchases);
  const totalPaidRounded = Math.round(totalPaid);
  const totalDue = totalPurchases - totalPaidRounded;

  return { totalPurchases, totalPaid: totalPaidRounded, totalDue };
}

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'suppliers.view');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(10000, Math.max(1, parseInt(searchParams.get('pageSize') ?? '10000', 10)));

    if (id) {
      const supplier = await db.supplier.findFirst({
        where: { id, businessId },
        include: {
          purchases: {
            where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } },
            orderBy: { createdAt: 'desc' }
          },
          expenses: {
            where: {
              isActive: true,
              category: 'Supplier Payment'
            },
            orderBy: { date: 'desc' }
          }
        },
      });

      if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });

      // Compile ledger
      const creditEntries = [];

      for (const p of supplier.purchases) {
        creditEntries.push({
          id: p.id,
          entryType: 'credit' as const,
          amount: Number(p.totalAmount),
          referenceId: p.invoiceNumber || `PUR-${p.id.substring(0, 8)}`,
          description: p.notes || `Purchase: ${p.invoiceNumber || 'Direct'}`,
          createdAt: p.createdAt,
        });
      }

      const debitEntries = [];

      for (const e of supplier.expenses) {
        const amount = Number(e.amount);
        const notes = e.notes || '';
        
        debitEntries.push({
          id: e.id,
          entryType: 'debit' as const,
          amount,
          referenceId: notes.replace('Paid supplier: ', '').replace('Paid for purchase order: ', '').replace('Paid for direct purchase: ', '') || `EXP-${e.id.substring(0, 8)}`,
          description: notes || 'Payment made',
          createdAt: e.createdAt,
        });
      }

      const ledger = [...creditEntries, ...debitEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const balances = calculateSupplierBalances(supplier);

      return NextResponse.json({
        success: true,
        data: {
          ...supplier,
          ...balances,
          ledger,
          ledgerEntries: ledger,
        }
      });
    }

    const where: Record<string, unknown> = { businessId };
    if (!includeInactive) where.isActive = true;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, suppliers] = await Promise.all([
      db.supplier.count({ where }),
      db.supplier.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        include: {
          purchases: {
            where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } },
            select: { totalAmount: true, paidAmount: true, paymentStatus: true }
          },
          expenses: {
            where: {
              isActive: true,
              category: 'Supplier Payment'
            },
            select: { amount: true, category: true, notes: true }
          }
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const mappedSuppliers = suppliers.map((supplier) => {
      const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(supplier);

      return {
        ...supplier,
        purchases: undefined,
        expenses: undefined,
        totalPurchases,
        totalPaid,
        totalDue,
      };
    });

    return NextResponse.json({ success: true, data: mappedSuppliers, total, page, pageSize });
  } catch (error: unknown) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'suppliers.create');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const body = await request.json();
    const parsed = SupplierInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supplier = await db.supplier.create({
      data: {
        ...parsed.data,
        businessId,
        isActive: true,
      },
    });

    await logAudit({
      userId: ctx.user.id,
      businessId,
      action: 'CREATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: supplier.id,
      details: { name: supplier.name },
      ipAddress: getIp(request),
    });

    return NextResponse.json({ success: true, data: supplier, message: 'Supplier created successfully' });
  } catch (error: unknown) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ success: false, error: 'Failed to create supplier' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'suppliers.update');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) return NextResponse.json({ success: false, error: 'Supplier ID is required' }, { status: 400 });

    const existing = await db.supplier.findFirst({ where: { id, businessId } });
    if (!existing) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });

    const parsed = SupplierInputSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supplier = await db.supplier.update({
      where: { id },
      data: { ...parsed.data, updatedAt: new Date() },
    });

    await logAudit({
      userId: ctx.user.id,
      businessId,
      action: 'UPDATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: supplier.id,
      details: { name: supplier.name },
      ipAddress: getIp(request),
    });

    return NextResponse.json({ success: true, data: supplier, message: 'Supplier updated successfully' });
  } catch (error: unknown) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({ success: false, error: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'suppliers.delete');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ success: false, error: 'Supplier ID is required' }, { status: 400 });

    const existing = await db.supplier.findFirst({ where: { id, businessId } });
    if (!existing) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });

    await db.supplier.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });

    await logAudit({
      userId: ctx.user.id,
      businessId,
      action: 'DELETE_SUPPLIER',
      entityType: 'Supplier',
      entityId: id,
      ipAddress: getIp(request),
    });

    return NextResponse.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete supplier' }, { status: 500 });
  }
}
