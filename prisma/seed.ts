import { db as prisma } from '../src/lib/db';
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { PrismaClient, UserRole } from '@prisma/client';

const p = prisma as unknown as PrismaClient;

async function main() {
  try {
    console.log("🌱 Starting database seeding...");

    // C1: Use env var; generate random password if not set (never hardcode)
    const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(16).toString("hex");
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`⚠️  SEED_ADMIN_PASSWORD not set. Generated one-time password: ${seedPassword}`);
      console.log("   Set SEED_ADMIN_PASSWORD in .env to use a fixed password.");
    }
    const hashedPassword = await bcrypt.hash(seedPassword, 12);

    // Upsert the admin user (create if doesn't exist, update if it does)
    const adminUser = await p.user.upsert({
      where: { username: "admin" },
      update: {
        name: "Administrator",
        role: "ADMIN",
      },
      create: {
        username: "admin",
        password: hashedPassword,
        name: "Administrator",
        role: "ADMIN",
        requiresPasswordChange: true,
      },
    });

    console.log("✅ Admin user created/updated successfully:", {
      id: adminUser.id,
      username: adminUser.username,
      name: adminUser.name,
      role: adminUser.role,
    });

    // Define all permissions
    const permissions = [
      // Users Management
      { code: "users.view", description: "View users list", category: "users" },
      { code: "users.create", description: "Create new user", category: "users" },
      { code: "users.edit", description: "Edit user details", category: "users" },
      { code: "users.delete", description: "Delete/deactivate user", category: "users" },

      // Products Management
      { code: "products.view", description: "View products", category: "products" },
      { code: "products.create", description: "Create product", category: "products" },
      { code: "products.edit", description: "Edit product", category: "products" },
      { code: "products.delete", description: "Delete product", category: "products" },

      // Sales Management
      { code: "sales.view", description: "View sales", category: "sales" },
      { code: "sales.create", description: "Create sale/checkout", category: "sales" },
      { code: "sales.edit", description: "Edit sale", category: "sales" },
      { code: "sales.delete", description: "Delete/cancel sale", category: "sales" },

      // Stock Management
      { code: "stock.view", description: "View stock", category: "stock" },
      { code: "stock.edit", description: "Update stock", category: "stock" },
      { code: "stock.import", description: "Import stock (bulk)", category: "stock" },

      // Reports
      { code: "reports.view", description: "View reports", category: "reports" },
      { code: "reports.export", description: "Export reports", category: "reports" },

      // Settings
      { code: "settings.view", description: "View settings", category: "settings" },
      { code: "settings.edit", description: "Edit settings", category: "settings" },

      // Customers
      { code: "customers.view", description: "View customers", category: "customers" },
      { code: "customers.create", description: "Create customer", category: "customers" },
      { code: "customers.edit", description: "Edit customer", category: "customers" },
      { code: "customers.delete", description: "Delete/deactivate customer", category: "customers" },

      // Suppliers
      { code: "suppliers.view", description: "View suppliers", category: "suppliers" },
      { code: "suppliers.create", description: "Create supplier", category: "suppliers" },
      { code: "suppliers.edit", description: "Edit supplier", category: "suppliers" },
      { code: "suppliers.delete", description: "Delete/deactivate supplier", category: "suppliers" },

      // Expenses
      { code: "expenses.view", description: "View expenses", category: "expenses" },
      { code: "expenses.create", description: "Create expense", category: "expenses" },
      { code: "expenses.edit", description: "Edit expense", category: "expenses" },
      { code: "expenses.delete", description: "Delete expense", category: "expenses" },
    ];

    // Upsert permissions
    for (const permission of permissions) {
      await p.permission.upsert({
        where: { code: permission.code },
        update: { description: permission.description },
        create: permission,
      });
    }

    console.log("✅ Permissions seeded successfully");

    // Seed standard product categories
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
      await p.category.upsert({
        where: { name: category.name },
        update: {
          nameBn: category.nameBn,
          description: category.description,
        },
        create: {
          name: category.name,
          nameBn: category.nameBn,
          description: category.description,
        },
      });
    }

    console.log("✅ Standard product categories seeded successfully");

    // Define role permissions
    const rolePermissions = {
      ADMIN: [
        "users.view", "users.create", "users.edit", "users.delete",
        "products.view", "products.create", "products.edit", "products.delete",
        "sales.view", "sales.create", "sales.edit", "sales.delete",
        "stock.view", "stock.edit", "stock.import",
        "reports.view", "reports.export",
        "settings.view", "settings.edit",
        "customers.view", "customers.create", "customers.edit", "customers.delete",
        "suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete",
        "expenses.view", "expenses.create", "expenses.edit", "expenses.delete",
      ],
      MANAGER: [
        "products.view", "products.create", "products.edit",
        "sales.view", "sales.create", "sales.edit",
        "stock.view", "stock.edit", "stock.import",
        "reports.view", "reports.export",
        "customers.view", "customers.create", "customers.edit", "customers.delete",
        "suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete",
        "expenses.view", "expenses.create", "expenses.edit", "expenses.delete",
      ],
      CASHIER: [
        "products.view",
        "sales.view", "sales.create",
        "customers.view", "customers.create",
        "suppliers.view",
      ],
      VIEWER: [
        "reports.view",
        "products.view",
        "sales.view",
        "customers.view",
        "stock.view",
        "suppliers.view",
        "expenses.view",
      ],
    };

    // Clear existing role permissions
    await p.rolePermission.deleteMany({});

    // Seed role permissions
    for (const [role, codes] of Object.entries(rolePermissions) as [UserRole, string[]][]) {
      for (const code of codes) {
        const permission = await p.permission.findUnique({ where: { code } });
        if (permission) {
          await p.rolePermission.create({
            data: { role, permissionId: permission.id },
          });
        }
      }
    }

    console.log("✅ Role permissions seeded successfully");
    console.log("🎉 Database seeding completed!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
