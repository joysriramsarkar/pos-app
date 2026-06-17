import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  const purchases = await db.purchase.findMany({
    include: {
      supplier: true
    }
  });

  console.log('--- ALL PURCHASES ---');
  console.log('Total purchases in DB:', purchases.length);
  for (const p of purchases) {
    console.log(`PO: ${p.invoiceNumber}, Amount: ${p.totalAmount}, Supplier: ${p.supplier?.name || 'NULL'}, DeliveryStatus: ${p.deliveryStatus}, PaymentStatus: ${p.paymentStatus}`);
  }
}

main().catch(console.error);
