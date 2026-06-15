import dotenv from 'dotenv';
dotenv.config();

console.log("process.env.DATABASE_URL:", process.env.DATABASE_URL);

async function main() {
  const { db } = await import('../src/lib/db');
  
  const suppliers = await db.supplier.findMany({
    where: {
      name: { in: ['আমূল দুধ', 'আইটিসি সিগারেট'] }
    },
    include: {
      purchases: true,
      expenses: {
        where: { isActive: true }
      }
    }
  });
  
  for (const s of suppliers) {
    console.log(`=========================================`);
    console.log(`SUPPLIER: ${s.name} (ID: ${s.id})`);
    console.log(`PURCHASES (${s.purchases.length}):`);
    for (const p of s.purchases) {
      console.log(`- PO: ${p.invoiceNumber}, Date: ${p.createdAt.toISOString().split('T')[0]}, Total: ${p.totalAmount}, Delivery: ${p.deliveryStatus}, Payment: ${p.paymentStatus}`);
    }
    console.log(`EXPENSES (${s.expenses.length}):`);
    for (const e of s.expenses) {
      console.log(`- Exp ID: ${e.id}, Amount: ${e.amount}, Date: ${e.date.toISOString().split('T')[0]}, Category: ${e.category}, Notes: "${e.notes}"`);
    }
  }
}

main().catch(console.error);
