import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/api-middleware";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";

type UserRestoreInput = Prisma.UserCreateManyInput;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const roleCheck = await requireRole(request, ['ADMIN']);
    if (roleCheck) return roleCheck;

    // Fetch all table data
    const [
      products,
      categories,
      stockHistory,
      customers,
      ledgerEntries,
      sales,
      saleItems,
      suppliers,
      purchases,
      purchaseItems,
      settings,
      users,
    ] = await Promise.all([
      db.product.findMany(),
      db.category.findMany(),
      db.stockHistory.findMany(),
      db.customer.findMany(),
      db.ledgerEntry.findMany(),
      db.sale.findMany(),
      db.saleItem.findMany(),
      db.supplier.findMany(),
      db.purchase.findMany(),
      db.purchaseItem.findMany(),
      db.setting.findMany(),
      db.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        products,
        categories,
        stockHistory,
        customers,
        ledgerEntries,
        sales,
        saleItems,
        suppliers,
        purchases,
        purchaseItems,
        settings,
        users,
      },
    };

    return NextResponse.json(backupData);
  } catch (error: unknown) {
    console.error("Error creating backup:", error);
    return NextResponse.json(
      {
        error: "Failed to create backup",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const roleCheck = await requireRole(request, ['ADMIN']);
    if (roleCheck) return roleCheck;

    let backupData;
    try {
      backupData = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid JSON backup file" },
        { status: 400 },
      );
    }

    if (!backupData || !backupData.data) {
      return NextResponse.json(
        { error: "Invalid backup format" },
        { status: 400 },
      );
    }

    // CRITICAL: Require confirmation token to prevent accidental data loss
    const confirmationToken = request.headers.get('x-restore-confirmation');
    const expectedToken = process.env.RESTORE_CONFIRMATION_TOKEN;
    if (!expectedToken || confirmationToken !== expectedToken) {
      return NextResponse.json(
        { error: "Restore confirmation required. This operation will DELETE ALL existing data." },
        { status: 400 },
      );
    }

    const {
      products = [],
      categories = [],
      stockHistory = [],
      customers = [],
      ledgerEntries = [],
      sales = [],
      saleItems = [],
      suppliers = [],
      purchases = [],
      purchaseItems = [],
      settings = [],
      users = [],
    } = backupData.data;

    // Ensure all restored users have a secure password hash.
    // Since passwords are not exported in the backup, users will be assigned
    // cryptographically strong random passwords upon restore and will require a password reset
    // by an administrator (or through an email reset flow if implemented).
    // Use chunking to avoid blocking the event loop with too many concurrent bcrypt operations.
    const usersWithPassword: UserRestoreInput[] = [];
    const CHUNK_SIZE = 5;
    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);
      const processedChunk = await Promise.all(
        chunk.map(async (user: UserRestoreInput) => {
          if (!user.password) {
            // Generate a strong 32-character random hex string as the new temporary password
            const randomPassword = crypto.randomBytes(16).toString("hex");
            const secureRandomHash = await bcrypt.hash(randomPassword, 10);
            return {
              ...user,
              password: secureRandomHash,
            };
          }
          return user;
        }),
      );
      usersWithPassword.push(...processedChunk);
      // Yield to the event loop to ensure the server remains responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Use interactive transaction to sequentially clear and restore data to avoid foreign key issues
    await db.$transaction(async (tx) => {
      // CLEAR EVERYTHING first (order matters for foreign keys)
      await tx.saleItem.deleteMany();
      await tx.purchaseItem.deleteMany();
      await tx.stockHistory.deleteMany();
      await tx.ledgerEntry.deleteMany();
      await tx.sale.deleteMany();
      await tx.purchase.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();
      await tx.setting.deleteMany();
      await tx.user.deleteMany();

      // RESTORE EVERYTHING (order matters for foreign keys)
      if (usersWithPassword.length > 0)
        await tx.user.createMany({ data: usersWithPassword });
      if (settings.length > 0) await tx.setting.createMany({ data: settings });
      if (categories.length > 0)
        await tx.category.createMany({ data: categories });
      if (products.length > 0) await tx.product.createMany({ data: products });
      if (customers.length > 0)
        await tx.customer.createMany({ data: customers });
      if (suppliers.length > 0)
        await tx.supplier.createMany({ data: suppliers });
      if (sales.length > 0) await tx.sale.createMany({ data: sales });
      if (saleItems.length > 0)
        await tx.saleItem.createMany({ data: saleItems });
      if (purchases.length > 0)
        await tx.purchase.createMany({ data: purchases });
      if (purchaseItems.length > 0)
        await tx.purchaseItem.createMany({ data: purchaseItems });
      if (ledgerEntries.length > 0)
        await tx.ledgerEntry.createMany({ data: ledgerEntries });
      if (stockHistory.length > 0)
        await tx.stockHistory.createMany({ data: stockHistory });
    });

    return NextResponse.json({
      success: true,
      message: "Database restored successfully",
    });
  } catch (error: unknown) {
    console.error("Error restoring backup:", error);
    return NextResponse.json(
      {
        error: "Failed to restore database",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
