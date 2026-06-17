import dotenv from 'dotenv';
dotenv.config();

function calculateSupplierBalances(supplier: {
  purchases: { totalAmount: any }[];
  expenses: { amount: any; notes?: string | null }[];
}) {
  let extraPurchases = 0;
  let totalPaid = 0;

  for (const e of supplier.expenses) {
    const amount = Number(e.amount);
    totalPaid += amount;

    const notes = e.notes || '';
    const isPaymentOfDebt = 
      notes.startsWith('Paid supplier:') ||
      notes.startsWith('Paid for purchase order:') ||
      notes.startsWith('Paid for direct purchase:');
    
    if (!isPaymentOfDebt) {
      extraPurchases += amount;
    }
  }

  const basePurchases = supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
  const totalPurchases = basePurchases + extraPurchases;
  const totalDue = Math.max(0, totalPurchases - totalPaid);

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

  console.log('--- TARGET SUPPLIERS IN DB ---');
  for (const s of suppliers) {
    const { totalPurchases, totalPaid, totalDue } = calculateSupplierBalances(s);
    console.log(`Supplier ID: ${s.id}`);
    console.log(`Name: ${s.name} | Phone: ${s.phone}`);
    console.log(`  Calculated Purchases: ${totalPurchases}`);
    console.log(`  Calculated Paid: ${totalPaid}`);
    console.log(`  Calculated Due: ${totalDue}`);
    console.log(`  All Purchases detail:`);
    for (const p of s.purchases) {
      console.log(`    PO: ${p.invoiceNumber}, Amount: ${p.totalAmount}, DeliveryStatus: ${p.deliveryStatus}, PaymentStatus: ${p.paymentStatus}`);
    }
    console.log(`  All Payments detail:`);
    for (const e of s.expenses) {
      console.log(`    Exp: ${e.id}, Amount: ${e.amount}, Category: ${e.category}, Notes: ${e.notes}, Date: ${e.date}`);
    }
    console.log('------------------------------------');
  }
}

main().catch(console.error);
