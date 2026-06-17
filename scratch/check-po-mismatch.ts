import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  
  const purchases = await db.purchase.findMany({
    where: {
      paymentStatus: 'Paid',
      paidAmount: 0
    },
    include: {
      supplier: true
    }
  });

  console.log('--- PURCHASES WITH PAID STATUS BUT 0 PAID AMOUNT ---');
  for (const p of purchases) {
    console.log(`PO: ${p.invoiceNumber}, Amount: ${p.totalAmount}, Supplier: ${p.supplier?.name || 'NULL'}, DeliveryStatus: ${p.deliveryStatus}`);
  }
}

main().catch(console.error);
