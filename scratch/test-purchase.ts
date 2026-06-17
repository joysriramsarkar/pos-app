import dotenv from 'dotenv';
dotenv.config();

import { db } from '../src/lib/db';

async function main() {
  const supplierId = 'cmmxh6i9m0011ro3kdc3a0c88'; // আর আর এজেন্সি (সার্ফ)
  const invoiceNumber = `PO-TEST-${Date.now()}`;
  
  // Find any active product
  const product = await db.product.findFirst({ where: { isActive: true } });
  if (!product) {
    console.error('No products found in DB');
    return;
  }
  
  console.log('Using product:', product.name);
  console.log('--- CREATING TEST PURCHASE ---');
  
  // Create a purchase order
  const p: any = await db.purchase.create({
    data: {
      invoiceNumber,
      supplierId,
      totalAmount: 1500,
      paidAmount: 1000, // Partial payment
      paymentStatus: 'Partial',
      paymentMethod: 'Mixed',
      deliveryStatus: 'Received',
      notes: 'Test purchase from scratch script',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            quantity: 10,
            receivedQty: 10,
            buyingPrice: 150,
            totalPrice: 1500,
          }
        ]
      }
    },
    include: {
      supplier: true,
      items: true,
    }
  });

  console.log('Purchase created:', {
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    supplier: p.supplier?.name,
    totalAmount: Number(p.totalAmount),
    paidAmount: Number(p.paidAmount),
    paymentStatus: p.paymentStatus,
    paymentMethod: p.paymentMethod,
  });

  // Create an expense
  const expense = await db.expense.create({
    data: {
      amount: 1000,
      category: 'Supplier Payment',
      notes: `Paid for purchase order: ${invoiceNumber} (Method: Mixed)`,
      date: new Date(),
      supplierId,
      supplierName: p.supplier?.name || null,
    }
  });

  console.log('Expense created:', {
    id: expense.id,
    amount: Number(expense.amount),
    category: expense.category,
    supplierName: expense.supplierName,
  });

  // Verify supplier totals
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    include: {
      purchases: {
        where: { deliveryStatus: { in: ['Received', 'PartiallyReceived'] } },
      },
      expenses: {
        where: {
          isActive: true,
          category: { in: ['Supplier Payment', 'Supplies'] }
        },
      }
    },
  });

  if (supplier) {
    const totalPurchases = supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0) + 
                          supplier.expenses.filter(e => e.category === 'Supplies').reduce((sum, e) => sum + Number(e.amount), 0);
    const totalPaid = supplier.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalDue = Math.max(0, totalPurchases - totalPaid);

    console.log('\n--- SUPPLIER UPDATED LEDGER ---');
    console.log('Total Purchases:', totalPurchases);
    console.log('Total Paid:', totalPaid);
    console.log('Calculated Due:', totalDue);
  }

  // Cleanup
  console.log('\n--- CLEANING UP ---');
  await db.expense.delete({ where: { id: expense.id } });
  await db.purchase.delete({ where: { id: p.id } });
  console.log('Cleanup completed successfully.');
}

main().catch(console.error).finally(() => db.$disconnect());
