import dotenv from 'dotenv';
dotenv.config();

import { db } from '../src/lib/db';

async function main() {
  const supplier = await db.supplier.findUnique({
    where: { id: 'cmmxh6i9m0011ro3kdc3a0c88' },
    include: {
      purchases: {
        orderBy: { createdAt: 'desc' }
      },
      expenses: {
        where: {
          isActive: true,
          category: { in: ['Supplier Payment', 'Supplies'] }
        },
        orderBy: { date: 'desc' }
      }
    }
  });

  if (!supplier) {
    console.log('Supplier not found');
    return;
  }

  console.log('=== PURCHASES ===');
  console.log(JSON.stringify(supplier.purchases.map(p => ({ invoiceNumber: p.invoiceNumber, totalAmount: p.totalAmount, deliveryStatus: p.deliveryStatus, paymentStatus: p.paymentStatus, createdAt: p.createdAt })), null, 2));
  
  console.log('=== EXPENSES ===');
  console.log(JSON.stringify(supplier.expenses.map(e => ({ amount: e.amount, category: e.category, notes: e.notes, date: e.date })), null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
