import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');

  // Find all purchase orders
  const purchases = await db.purchase.findMany();

  console.log(`Checking ${purchases.length} purchase orders...`);

  let updateCount = 0;
  for (const p of purchases) {
    if (!p.invoiceNumber) continue;

    // Search for a matching payment expense
    const matchingExpense = await db.expense.findFirst({
      where: {
        notes: {
          contains: p.invoiceNumber
        },
        category: 'Supplier Payment'
      }
    });

    if (matchingExpense) {
      if (p.deliveryStatus !== 'Received' && p.deliveryStatus !== 'PartiallyReceived') {
        console.log(`Updating PO ${p.invoiceNumber} (current delivery status: ${p.deliveryStatus}) to 'Received' because of matching payment expense of ${matchingExpense.amount} on ${matchingExpense.date.toISOString().split('T')[0]}`);
        
        await db.purchase.update({
          where: { id: p.id },
          data: { deliveryStatus: 'Received' }
        });
        
        updateCount++;
      }
    }
  }

  console.log(`Successfully marked ${updateCount} purchase orders as 'Received'.`);
}

main().catch(console.error);
