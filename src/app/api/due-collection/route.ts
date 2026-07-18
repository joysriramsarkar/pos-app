export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { toMoneyDecimal, toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';

// GET /api/due-collection - List customers with totalDue > 0
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'customers.view');
  if (authError) return authError;

  try {
    const customers = await db.customer.findMany({
      where: {
        isActive: true,
        totalDue: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        phone: true,
        totalDue: true,
        updatedAt: true,
      },
      orderBy: { totalDue: 'desc' },
    });

    const customersWithLastPayment = await Promise.all(
      customers.map(async (customer) => {
        const lastSale = await db.sale.findFirst({
          where: {
            customerId: customer.id,
            status: 'Completed',
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        return {
          id: customer.id,
          name: customer.name,
          nameEn: customer.nameEn,
          phone: customer.phone,
          dueAmount: toMoneyNumber(customer.totalDue),
          updatedAt: customer.updatedAt,
          lastPaymentDate: lastSale?.createdAt || null,
        };
      }),
    );

    return NextResponse.json({ success: true, data: customersWithLastPayment });
  } catch (error) {
    console.error('বকেয়া তালিকা লোড করতে ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'বকেয়া তালিকা লোড করতে ত্রুটি হয়েছে' },
      { status: 500 },
    );
  }
}

// POST /api/due-collection - Collect due payment from a customer
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'customers.edit');
  if (authError) return authError;

  try {
    const body = await request.json();
    const { customerId, amount, paymentMethod, notes } = body;

    if (!customerId || amount == null || Number(amount) <= 0) {
      return NextResponse.json(
        { success: false, error: 'সঠিক তথ্য প্রদান করুন' },
        { status: 400 },
      );
    }

    const collectAmount = toMoneyDecimal(amount);

    const updated = await db.$transaction(async (tx) => {
      const customerRaw = await tx.$queryRaw<
        Array<{ id: string; name: string; totalDue: unknown; totalPaid: unknown }>
      >`
        SELECT id, name, "total_due" as "totalDue", "total_paid" as "totalPaid"
        FROM customers
        WHERE id = ${customerId}
        FOR UPDATE
      `;
      const customer = customerRaw[0];

      if (!customer) {
        throw Object.assign(new Error('ক্রেতা খুঁজে পাওয়া যায়নি'), { status: 404 });
      }

      const currentDue = toMoneyDecimal(Number(customer.totalDue));
      if (currentDue.lt(collectAmount)) {
        throw Object.assign(
          new Error('আদায়ের পরিমাণ বকেয়া থেকে বেশি হতে পারে না'),
          { status: 400 },
        );
      }

      const newDueAmount = toMoneyDecimal(currentDue.minus(collectAmount));
      const newTotalPaid = toMoneyDecimal(
        toMoneyDecimal(Number(customer.totalPaid)).plus(collectAmount),
      );

      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: {
          totalDue: newDueAmount,
          totalPaid: newTotalPaid,
          updatedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          customerId,
          entryType: 'debit',
          amount: collectAmount,
          balanceAfter: newDueAmount,
          description: notes || `Manual due collection (${paymentMethod || 'Cash'})`,
        },
      });

      return {
        updatedCustomer,
        collectedAmount: collectAmount.toNumber(),
        remainingDue: newDueAmount.toNumber(),
        previousDue: currentDue.toNumber(),
        customerName: customer.name,
      };
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: (user as { id?: string } | null)?.id,
      action: 'DUE_COLLECTION',
      entityType: 'Customer',
      entityId: customerId,
      details: {
        customerName: updated.customerName,
        collectedAmount: updated.collectedAmount,
        previousDue: updated.previousDue,
        remainingDue: updated.remainingDue,
        paymentMethod: paymentMethod || 'Cash',
        notes: notes || null,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          ...updated.updatedCustomer,
          dueAmount: toMoneyNumber(updated.updatedCustomer.totalDue),
        },
        collectedAmount: updated.collectedAmount,
        remainingDue: updated.remainingDue,
      },
    });
  } catch (error: unknown) {
    console.error('বকেয়া আদায় করতে ত্রুটি:', error);
    const message = error instanceof Error ? error.message : 'বকেয়া আদায় করতে ত্রুটি হয়েছে';
    const status = (error as { status?: number })?.status;
    if (status === 404 || status === 400) {
      return NextResponse.json({ success: false, error: message }, { status });
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
