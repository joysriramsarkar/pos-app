export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/due-collection - List customers with totalDue > 0
export async function GET() {
  try {
    const customers = await db.customer.findMany({
      where: {
        isActive: true,
        totalDue: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        totalDue: true,
        updatedAt: true,
      },
      orderBy: { totalDue: 'desc' },
    });

    // Get last payment date for each customer (most recent sale)
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
          phone: customer.phone,
          dueAmount: Number(customer.totalDue),
          updatedAt: customer.updatedAt,
          lastPaymentDate: lastSale?.createdAt || null,
        };
      })
    );

    return NextResponse.json({ success: true, data: customersWithLastPayment });
  } catch (error) {
    console.error('বকেয়া তালিকা লোড করতে ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'বকেয়া তালিকা লোড করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}

// POST /api/due-collection - Collect due payment from a customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, amount, paymentMethod, notes } = body;

    if (!customerId || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'সঠিক তথ্য প্রদান করুন' },
        { status: 400 }
      );
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'ক্রেতা খুঁজে পাওয়া যায়নি' },
        { status: 404 }
      );
    }

    const currentDue = Number(customer.totalDue);
    if (currentDue < amount) {
      return NextResponse.json(
        { success: false, error: 'আদায়ের পরিমাণ বকেয়া থেকে বেশি হতে পারে না' },
        { status: 400 }
      );
    }

    const newDueAmount = currentDue - amount;
    const newTotalPaid = Number(customer.totalPaid) + amount;

    const [updatedCustomer] = await db.$transaction([
      db.customer.update({
        where: { id: customerId },
        data: {
          totalDue: newDueAmount,
          totalPaid: newTotalPaid,
          updatedAt: new Date(),
        },
      }),
      db.ledgerEntry.create({
        data: {
          customerId,
          entryType: 'debit',
          amount: amount,
          balanceAfter: newDueAmount,
          description: notes || `Manual due collection (${paymentMethod || 'Cash'})`,
        },
      }),
      db.auditLog.create({
        data: {
          action: 'DUE_COLLECTION',
          entityType: 'Customer',
          entityId: customerId,
          details: JSON.stringify({
            customerName: customer.name,
            collectedAmount: amount,
            previousDue: currentDue,
            remainingDue: newDueAmount,
            paymentMethod: paymentMethod || 'Cash',
            notes: notes || null,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          ...updatedCustomer,
          dueAmount: Number(updatedCustomer.totalDue),
        },
        collectedAmount: amount,
        remainingDue: newDueAmount,
      },
    });
  } catch (error) {
    console.error('বকেয়া আদায় করতে ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'বকেয়া আদায় করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
