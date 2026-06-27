import * as dotenv from 'dotenv';
dotenv.config();
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}


const categories = [
  { name: 'Groceries', nameBn: 'মুদি ও চাল-ডাল' },
  { name: 'Packaged Snacks', nameBn: 'প্যাকেটজাত খাবার' },
  { name: 'Beverages', nameBn: 'পানীয়' },
  { name: 'Dairy & Frozen', nameBn: 'দুগ্ধজাত ও হিমায়িত' },
  { name: 'Personal Care', nameBn: 'ব্যক্তিগত যত্ন' },
  { name: 'Household & Cleaning', nameBn: 'গৃহস্থালি ও পরিষ্কার' },
  { name: 'Confectionery', nameBn: 'মিষ্টান্ন ও চকোলেট' },
  { name: 'General', nameBn: 'সাধারণ' },
];

const categoryNameMappings: Record<string, string> = {
  // Confectionery
  'চকোস': 'Confectionery',
  'চকোলেট': 'Confectionery',
  'Confectionery': 'Confectionery',
  // Groceries
  'ছাতু': 'Groceries',
  'মসলা': 'Groceries',
  'ডাল': 'Groceries',
  'ময়দা': 'Groceries',
  'Pulses': 'Groceries',
  'আটা': 'Groceries',
  'Oils': 'Groceries',
  'Groceries': 'Groceries',
  'চাল': 'Groceries',
  'লবণ': 'Groceries',
  'আচার': 'Groceries',
  'সোয়াবিন': 'Groceries',
  // Household & Cleaning
  'ব্রাশ': 'Household & Cleaning',
  'ধূপকাঠি': 'Household & Cleaning',
  'Household': 'Household & Cleaning',
  'Household & Cleaning': 'Household & Cleaning',
  'সার্ফ': 'Household & Cleaning',
  // Dairy & Frozen
  'পনির': 'Dairy & Frozen',
  'Dairy': 'Dairy & Frozen',
  'দুধ': 'Dairy & Frozen',
  'Dairy & Frozen': 'Dairy & Frozen',
  // Packaged Snacks
  'বিস্কুট': 'Packaged Snacks',
  'কেক': 'Packaged Snacks',
  'পাউরুটি': 'Packaged Snacks',
  'নুডলস': 'Packaged Snacks',
  'চিপস': 'Packaged Snacks',
  'বাউলি': 'Packaged Snacks',
  'চানাচুর': 'Packaged Snacks',
  'ক্রিমরোল': 'Packaged Snacks',
  'Snacks': 'Packaged Snacks',
  'Packaged Snacks': 'Packaged Snacks',
  'বেকারি কেক': 'Packaged Snacks',
  'বেকারি অন্যান্য': 'Packaged Snacks',
  'বেকারি বিস্কুট': 'Packaged Snacks',
  'পাপড়': 'Packaged Snacks',
  // Personal Care
  'নারী স্বাস্থ্য': 'Personal Care',
  'Personal Care': 'Personal Care',
  'সাবান': 'Personal Care',
  'মাথার তেল': 'Personal Care',
  'শ্যাম্পু': 'Personal Care',
  'টুথপেস্ট': 'Personal Care',
  // Beverages
  'Beverages': 'Beverages',
  'জল': 'Beverages',
  'কফি': 'Beverages',
  'চা পাতা': 'Beverages',
  'জলের বোতল': 'Beverages',
  // General / Other
  'General': 'General',
  'Other': 'General',
  'সিগারেট': 'General',
  'বিড়ি': 'General',
  'গুটকা': 'General',
  'লাইটার': 'General',
  'প্রিন্ট ও সম্পাদনা': 'General',
};

async function main() {
  const { db: prisma } = await import('../src/lib/db');
  try {
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
  let updatedCount = 0;
  
  for (const product of products) {
    let newCategory = product.category;
    let foundMatch = false;

    // 1. Try to map using the current category string
    const currentCat = product.category ? product.category.trim() : '';
    if (categoryNameMappings[currentCat]) {
      newCategory = categoryNameMappings[currentCat];
      foundMatch = true;
    }

    // 2. Keyword fallback on product names if no direct category mapping matched
    if (!foundMatch) {
      for (const mapping of mappings) {
        if (product.name.toLowerCase().includes(mapping.contains.toLowerCase()) || 
            (product.nameBn && product.nameBn.includes(mapping.contains))) {
          newCategory = mapping.category;
          foundMatch = true;
          break;
        }
      }
    }
    
    // 3. Fallback to General if still not matching a standard category
    if (!foundMatch && !categories.some(c => c.name === product.category)) {
      newCategory = 'General';
    }

    if (newCategory !== product.category) {
      await prisma.product.update({
        where: { id: product.id },
        data: { category: newCategory }
      });
      console.log(`Updated "${product.name}" (${product.category}) -> "${newCategory}"`);
      updatedCount++;
    }
  }
  
  console.log(`Successfully updated ${updatedCount} products to standard categories.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);