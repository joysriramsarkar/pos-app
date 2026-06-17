import dotenv from 'dotenv';
dotenv.config();

function calculateSupplierBalances(supplier: {
  purchases: { totalAmount: any; paidAmount?: any; paymentStatus?: string }[];
  expenses: { amount: any; notes?: string | null }[];
}) {
  let poDue = 0;
  let basePurchases = 0;

  for (const p of supplier.purchases) {
    const total = Number(p.totalAmount);
    const paid = Number(p.paidAmount || 0);
    basePurchases += total;

    if (!p.paymentStatus || p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial') {
      poDue += total - paid;
    }
  }

  let extraPurchases = 0;
  let totalPaid = 0;
  let manualPayments = 0;

  for (const e of supplier.expenses) {
    const amount = Number(e.amount);
    totalPaid += amount;

    const notes = e.notes || '';
    if (notes.startsWith('Paid supplier:')) {
      manualPayments += amount;
    } else if (notes.startsWith('Paid for purchase order:') || notes.startsWith('Paid for direct purchase:')) {
      // payment for a specific PO, already handled in poDue
    } else {
      extraPurchases += amount;
    }
  }

  const totalPurchases = basePurchases + extraPurchases;
  const totalDue = Math.max(0, poDue - manualPayments);

  return { totalPurchases, totalPaid, totalDue };
}

async function main() {
  const { db } = await import('../src/lib/db');
  
  const suppliers = await db.supplier.findMany({
    where: {
      OR: [
        { name: { contains: 'পেপার', mode: 'insensitive' } },
        { name: { contains: 'paper', mode: 'insensitive' } },
        { name: { contains: 'প্রভু', mode: 'insensitive' } },
        { name: { contains: 'prabhuji', mode: 'insensitive' } }
      ]
    },
    include: {
      purchases: {
        where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } }
      },
      expenses: {
        where: { isActive: true }
      }
    }
  });

  console.log('--- TEST ON PRODUCTION API DUES LOGIC ---');
  for (const s of suppliers) {
    const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(s);
    console.log(`Supplier: ${s.name}`);
    console.log(`  Total Purchases: ${totalPurchases}`);
    console.log(`  Total Paid: ${totalPaid}`);
    console.log(`  Calculated Due: ${totalDue}`);
    console.log('------------------------------------');
  }
}

main().catch(console.error);
