export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
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

      // Purchases from the Purchase model (received POs)
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
          referenceId: `EXP-${e.id.substring(0, 8)}`,
          description: notes || 'টাকা পরিশোধ (পেমেন্ট)',
          createdAt: e.date,
        });

        if (!notes.startsWith('Paid supplier:') && !notes.startsWith('Paid for purchase order:') && !notes.startsWith('Paid for direct purchase:')) {
          creditEntries.push({
            id: `${e.id}-credit`,
            entryType: 'credit' as const,
            amount,
            referenceId: `EXP-${e.id.substring(0, 8)}`,
            description: `খরচ ক্রয়: ${e.category} ${notes ? `(${notes})` : ''}`,
            createdAt: e.date,
          });
        }
      }

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

      const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(supplier);

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
