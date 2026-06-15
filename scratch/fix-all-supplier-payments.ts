import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');

  // Find all Supplier Payment expenses associated with a supplier
  const expenses = await db.expense.findMany({
    where: {
      category: 'Supplier Payment',
      supplierId: { not: null },
    },
  });

  console.log(`Analyzing ${expenses.length} Supplier Payment expenses...`);

  let updateCount = 0;
  for (const exp of expenses) {
    const notes = exp.notes || '';
    
    // If the expense is NOT automatically created by a purchase order
    if (
      !notes.startsWith('Paid for purchase order:') &&
      !notes.startsWith('Paid for direct purchase:')
    ) {
      await db.expense.update({
        where: { id: exp.id },
        data: { category: 'Supplies' },
      });
      updateCount++;
    }
  }

  console.log(`Successfully updated ${updateCount} expenses to 'Supplies' category.`);
}

main().catch(console.error);
