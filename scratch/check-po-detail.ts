import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  
  const purchase = await db.purchase.findUnique({
    where: { invoiceNumber: 'PO-20260608-0005' }
  });

  console.log('--- PURCHASE PO-20260608-0005 ---');
  console.log(JSON.stringify(purchase, null, 2));
}

main().catch(console.error);
