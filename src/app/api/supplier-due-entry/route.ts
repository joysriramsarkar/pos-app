export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';

const supplierDueSchema = z.object({
  supplierId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((value) => toMoneyNumber(value)),
  description: z.string().optional().transform(v => v === '' ? undefined : v),
});

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// Helper to calculate supplier balances
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

// POST /api/supplier-due-entry - Manually record a due to a supplier (increase supplier outstanding due/total due)
export async function POST(request: NextRequest) {
  try {
    const authError = await requirePermission(request, 'suppliers.edit');
    if (authError) return authError;

    const body = await request.json();
    const validation = supplierDueSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'সঠিক তথ্য প্রদান করুন' }, { status: 400 });
    }

    const { supplierId, amount, description } = validation.data;

    const result = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId }
      });

      if (!supplier) {
        throw new Error('Supplier not found');
      }

      const entryDescription = description || 'Manual supplier due entry (ম্যানুয়াল সাপ্লায়ার বাকি এন্ট্রি)';

      // Create a manual purchase order that counts as a due/purchase
      await tx.purchase.create({
        data: {
          supplierId,
          totalAmount: Math.round(amount),
          paidAmount: 0,
          paymentStatus: 'Pending',
          deliveryStatus: 'Received',
          paymentMethod: 'Due',
          notes: entryDescription,
          invoiceNumber: `SUP-DUE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        }
      });

      const updatedSupplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        include: {
          purchases: {
            where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } },
          },
          expenses: {
            where: {
              isActive: true,
              category: 'Supplier Payment'
            },
          }
        }
      });

      if (!updatedSupplier) {
        throw new Error('Supplier not found after update');
      }

      const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(updatedSupplier);

      const authUser = await getAuthenticatedUser(request);
      await logAudit({
        userId: authUser?.id,
        action: 'MANUAL_SUPPLIER_DUE_ENTRY',
        entityType: 'Supplier',
        entityId: supplierId,
        details: {
          supplierName: updatedSupplier.name,
          addedDue: amount,
          totalDue,
          description: entryDescription,
        },
        ipAddress: getIp(request),
      });

      return {
        ...updatedSupplier,
        purchases: undefined,
        expenses: undefined,
        totalPurchases,
        totalPaid,
        totalDue,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error('Error adding manual supplier due:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const statusCode = errorMessage === 'Supplier not found' ? 404 : 500;
    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}
