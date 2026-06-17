import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  console.log('Connecting to database...');

  // Count existing Supplies expenses
  const count = await db.expense.count({
    where: {
      category: 'Supplies',
    },
  });

  console.log(`Found ${count} expenses with category 'Supplies'.`);

  if (count > 0) {
    const result = await db.expense.updateMany({
      where: {
        category: 'Supplies',
      },
      data: {
        category: 'Supplier Payment',
      },
    });
    console.log(`Successfully migrated ${result.count} expenses to 'Supplier Payment' category.`);
  } else {
    console.log('No expenses to migrate.');
  }
}

main().catch(console.error);
