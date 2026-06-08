import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  { name: 'Groceries', nameBn: 'মুদি ও চাল-ডাল' },
  { name: 'Packaged Snacks', nameBn: 'প্যাকেটজাত খাবার' },
  { name: 'Beverages', nameBn: 'পানীয়' },
  { name: 'Dairy & Frozen', nameBn: 'দুগ্ধজাত ও হিমায়িত' },
  { name: 'Personal Care', nameBn: 'ব্যক্তিগত যত্ন' },
  { name: 'Household & Cleaning', nameBn: 'গৃহস্থালি' },
  { name: 'Confectionery', nameBn: 'মিষ্টান্ন ও চকোলেট' },
];

async function main() {
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { nameBn: cat.nameBn },
      create: { name: cat.name, nameBn: cat.nameBn },
    });
  }
  
  const mappings = [
    { contains: 'দুধ', category: 'Dairy & Frozen' },
    { contains: 'চা পাতা', category: 'Beverages' },
    { contains: 'বিস্কুট', category: 'Packaged Snacks' },
    { contains: 'চানাচুর', category: 'Packaged Snacks' },
    { contains: 'চিপস', category: 'Packaged Snacks' },
    { contains: 'কেক', category: 'Packaged Snacks' },
    { contains: 'নুডলস', category: 'Packaged Snacks' },
    { contains: 'কোল্ড ড্রিংকস', category: 'Beverages' },
    { contains: 'জুস', category: 'Beverages' },
    { contains: 'জল', category: 'Beverages' },
    { contains: 'চা', category: 'Beverages' },
    { contains: 'কফি', category: 'Beverages' },
    { contains: 'পনির', category: 'Dairy & Frozen' },
    { contains: 'মাখন', category: 'Dairy & Frozen' },
    { contains: 'ঘি', category: 'Dairy & Frozen' },
    { contains: 'আইসক্রিম', category: 'Dairy & Frozen' },
    { contains: 'সাবান', category: 'Personal Care' },
    { contains: 'শ্যাম্পু', category: 'Personal Care' },
    { contains: 'টুথপেস্ট', category: 'Personal Care' },
    { contains: 'ডিটারজেন্ট', category: 'Household & Cleaning' },
    { contains: 'ফিনাইল', category: 'Household & Cleaning' },
    { contains: 'ডিশওয়াশ', category: 'Household & Cleaning' },
    { contains: 'টিস্যু', category: 'Household & Cleaning' },
    { contains: 'দেশলাই', category: 'Household & Cleaning' },
    { contains: 'ক্যাডবেরি', category: 'Confectionery' },
    { contains: 'লজেন্স', category: 'Confectionery' },
    { contains: 'চুইংগাম', category: 'Confectionery' },
    { contains: 'চাল', category: 'Groceries' },
    { contains: 'ডাল', category: 'Groceries' },
    { contains: 'তেল', category: 'Groceries' },
    { contains: 'আটা', category: 'Groceries' },
    { contains: 'ময়দা', category: 'Groceries' },
    { contains: 'মসলা', category: 'Groceries' },
  ];

  const products = await prisma.product.findMany();
  for (const product of products) {
    let newCategory = product.category;
    let foundMatch = false;
    for (const mapping of mappings) {
      if (product.name.toLowerCase().includes(mapping.contains.toLowerCase()) || 
          (product.nameBn && product.nameBn.includes(mapping.contains))) {
        newCategory = mapping.category;
        foundMatch = true;
        break;
      }
    }
    
    if (!foundMatch && !categories.some(c => c.name === product.category)) {
        newCategory = 'Groceries'; // Default fallback
    }

    if (newCategory !== product.category) {
      await prisma.product.update({
        where: { id: product.id },
        data: { category: newCategory }
      });
      console.log(`Updated ${product.name} to category ${newCategory}`);
    }
  }
  
  console.log('Categories updated successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());