import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { db } = await import('../src/lib/db');
  
  const products = await db.product.findMany({
    where: {
      OR: [
        { name: { contains: 'লেইস', mode: 'insensitive' } },
        { name: { contains: 'lays', mode: 'insensitive' } }
      ]
    }
  });

  console.log('--- PRODUCTS CONTAINING LAYS/লেইস ---');
  for (const p of products) {
    console.log(`ID: ${p.id}, Name: ${p.name}`);
  }
}

main().catch(console.error);
