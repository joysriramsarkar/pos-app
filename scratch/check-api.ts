import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('Fetching /api/suppliers...');
  try {
    const res = await fetch('http://localhost:3000/api/suppliers');
    const data = await res.json();
    console.log(`Response success: ${data.success}`);
    console.log(`Total records: ${data.data?.length}`);
    if (data.data && data.data.length > 0) {
      console.log('First 5 records from API:');
      data.data.slice(0, 5).forEach((s: any) => {
        console.log(`Name: ${s.name}, totalPurchases: ${s.totalPurchases}, totalPaid: ${s.totalPaid}, totalDue: ${s.totalDue}`);
      });
    }
  } catch (error) {
    console.error('API fetch failed:', error);
  }
}

main();
