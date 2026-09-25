import { db as prisma } from '../src/lib/db';
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

async function main() {
  try {
    console.log("🌱 Starting multi-tenant database seeding...");

    // 1. Ensure default business exists
    const defaultBusiness = await prisma.business.upsert({
      where: { slug: "lakhan-bhandar" },
      update: {},
      create: {
        name: "Lakhan Bhandar",
        slug: "lakhan-bhandar",
        currency: "INR",
        timezone: "Asia/Kolkata",
        isActive: true,
      },
    });

    console.log("✅ Default business seeded:", defaultBusiness.name, `(${defaultBusiness.id})`);

    // 2. Seed Admin user
    const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(16).toString("hex");
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`⚠️  SEED_ADMIN_PASSWORD not set. Generated one-time password: ${seedPassword}`);
      console.log("   Set SEED_ADMIN_PASSWORD in .env to use a fixed password.");
    }
    const hashedPassword = await bcrypt.hash(seedPassword, 12);

    const adminUser = await prisma.user.upsert({
      where: { username: "admin" },
      update: {
        name: "Administrator",
      },
      create: {
        username: "admin",
        passwordHash: hashedPassword,
        name: "Administrator",
        requiresPasswordChange: false,
      },
    });

    // 3. Ensure admin has OWNER membership in default business
    await prisma.membership.upsert({
      where: {
        userId_businessId: {
          userId: adminUser.id,
          businessId: defaultBusiness.id,
        },
      },
      update: {
        role: "OWNER",
        isActive: true,
      },
      create: {
        userId: adminUser.id,
        businessId: defaultBusiness.id,
        role: "OWNER",
        isActive: true,
      },
    });

    console.log("✅ Admin user and OWNER membership created/updated successfully");

    // 4. Seed standard product categories for default business
    const standardCategories = [
      {
        name: "Groceries",
        nameBn: "মুদি ও চাল-ডাল",
        description: "Rice, lentils, oil, flour, spices, and other basic grocery items",
      },
      {
        name: "Packaged Snacks",
        nameBn: "প্যাকেটজাত খাবার",
        description: "Biscuits, chips, cookies, noodles, and packaged snack foods",
      },
      {
        name: "Beverages",
        nameBn: "পানীয়",
        description: "Cold drinks, juices, water, tea leaves, coffee, and other beverages",
      },
      {
        name: "Dairy & Frozen",
        nameBn: "দুগ্ধজাত ও হিমায়িত",
        description: "Milk, cheese, butter, ghee, ice cream, and frozen products",
      },
      {
        name: "Personal Care",
        nameBn: "ব্যক্তিগত যত্ন",
        description: "Soap, shampoo, toothpaste, oil, and personal hygiene products",
      },
      {
        name: "Household & Cleaning",
        nameBn: "গৃহস্থালি ও পরিষ্কার",
        description: "Detergent, disinfectant, dishwash, tissues, and cleaning supplies",
      },
      {
        name: "Confectionery",
        nameBn: "মিষ্টান্ন ও চকোলেট",
        description: "Chocolate, candies, lozenges, chewing gum, and confectionery items",
      },
      {
        name: "General",
        nameBn: "সাধারণ",
        description: "Miscellaneous items that do not fit into other categories",
      },
    ];

    for (const category of standardCategories) {
      await prisma.category.upsert({
        where: {
          businessId_name: {
            businessId: defaultBusiness.id,
            name: category.name,
          },
        },
        update: {
          nameBn: category.nameBn,
          description: category.description,
        },
        create: {
          businessId: defaultBusiness.id,
          name: category.name,
          nameBn: category.nameBn,
          description: category.description,
        },
      });
    }

    console.log("✅ Standard product categories seeded successfully");
    console.log("🎉 Database seeding completed!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
