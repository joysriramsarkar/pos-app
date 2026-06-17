import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  
  const expenses = await db.expense.findMany({
    where: {
      amount: {
        gte: 955,
        lte: 956
      }
    }
  });

  console.log('--- EXPENSES NEAR 955.15 ---');
  for (const e of expenses) {
    console.log(JSON.stringify(e, null, 2));
  }
}

main().catch(console.error);
