import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  console.log('Connecting to DB...');
  
  // Find suppliers that have purchases or expenses
  const suppliers = await db.supplier.findMany({
    include: {
      purchases: {
        where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } },
      },
      expenses: {
        where: {
          isActive: true,
          category: { in: ['Supplier Payment', 'Supplies'] }
        }
      }
    }
  });

  console.log('Suppliers with activity:');
  let count = 0;
  for (const s of suppliers) {
    const totalPurchases = s.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0) + 
                          s.expenses.filter(e => e.category === 'Supplies').reduce((sum, e) => sum + Number(e.amount), 0);
    const totalPaid = s.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    
    if (totalPurchases > 0 || totalPaid > 0) {
      count++;
      console.log(`Supplier: ${s.name} (ID: ${s.id})`);
      console.log(`  - Purchases Count: ${s.purchases.length}`);
      console.log(`  - Expenses Count: ${s.expenses.length}`);
      console.log(`  - Total Purchases: ${totalPurchases}`);
      console.log(`  - Total Paid: ${totalPaid}`);
      console.log(`  - Calculated Due: ${Math.max(0, totalPurchases - totalPaid)}`);
    }
  }
  console.log(`Total active suppliers: ${count} / ${suppliers.length}`);
}

main().catch(console.error);
