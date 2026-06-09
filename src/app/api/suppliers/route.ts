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
        include: {
          purchases: {
            where: { paymentStatus: 'Paid' },
            orderBy: { createdAt: 'desc' }
          },
          expenses: {
            where: {
              isActive: true,
              category: { in: ['Supplier Payment', 'Supplies'] }
            },
            orderBy: { date: 'desc' }
          }
        },
      });

      if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });

      // Compile ledger
      const creditEntries = [];

      // Purchases from the Purchase model (received POs)
      for (const p of supplier.purchases) {
        creditEntries.push({
          id: p.id,
          entryType: 'credit' as const,
          amount: Number(p.totalAmount),
          referenceId: p.invoiceNumber || `PUR-${p.id.substring(0, 8)}`,
          description: p.notes || `স্টক ক্রয়: ${p.invoiceNumber || 'রসিদ ছাড়া'}`,
          createdAt: p.createdAt,
        });
      }

      // Supplies expenses also count as credit (purchase of goods)
      for (const e of supplier.expenses) {
        if (e.category === 'Supplies') {
          creditEntries.push({
            id: `purchase-${e.id}`,
            entryType: 'credit' as const,
            amount: Number(e.amount),
            referenceId: `EXP-${e.id.substring(0, 8)}`,
            description: e.notes || 'মালামাল ক্রয়',
            createdAt: e.date,
          });
        }
      }

      const debitEntries = supplier.expenses.map(e => ({
        id: e.id,
        entryType: 'debit' as const,
        amount: Number(e.amount),
        referenceId: `EXP-${e.id.substring(0, 8)}`,
        description: e.notes || `টাকা পরিশোধ (${e.category === 'Supplies' ? 'মালামাল ক্রয়' : 'পেমেন্ট'})`,
        createdAt: e.date,
      }));

      const combined = [...creditEntries, ...debitEntries]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let balance = 0;
      const ledgerEntries = combined.map(entry => {
        if (entry.entryType === 'credit') {
          balance += entry.amount;
        } else {
          balance -= entry.amount;
        }
        return {
          ...entry,
          balanceAfter: balance,
        };
      }).reverse();

      const totalPurchases = supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0) + 
                            supplier.expenses.filter(e => e.category === 'Supplies').reduce((sum, e) => sum + Number(e.amount), 0);
      const totalPaid = supplier.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalDue = Math.max(0, totalPurchases - totalPaid);

      return NextResponse.json({
        success: true,
        data: {
          ...supplier,
          purchases: undefined,
          expenses: undefined,
          totalPurchases,
          totalPaid,
          totalDue,
          ledgerEntries,
        }
      });
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
        include: {
          purchases: {
            where: { paymentStatus: 'Paid' },
            select: { totalAmount: true }
          },
          expenses: {
            where: {
              isActive: true,
              category: { in: ['Supplier Payment', 'Supplies'] }
            },
            select: { amount: true, category: true }
          }
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const mappedSuppliers = suppliers.map((supplier) => {
      const totalPurchases = supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0) + 
                            supplier.expenses.filter(e => e.category === 'Supplies').reduce((sum, e) => sum + Number(e.amount), 0);
      const totalPaid = supplier.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalDue = Math.max(0, totalPurchases - totalPaid);

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
