import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  
  // Update the two expenses for the supplier "প্রভুজি ভুজিয়াওয়ালা"
  const expense1 = await db.expense.update({
    where: { id: 'cmos893em000404l81e43dxy6' },
    data: { category: 'Supplies' }
  });
  
  const expense2 = await db.expense.update({
    where: { id: 'cmpawmkgf000004jxidfbwgmk' },
    data: { category: 'Supplies' }
  });
  
  console.log("Updated expense 1:", expense1);
  console.log("Updated expense 2:", expense2);
}

main().catch(console.error);
