export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Only business owners or admins can export backup" },
      { status: 403 }
    );
  }

  const businessId = ctx.business.id;

  try {
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
      businessSettings,
      memberships,
    ] = await Promise.all([
      db.product.findMany({ where: { businessId } }),
      db.category.findMany({ where: { businessId } }),
      db.stockHistory.findMany({ where: { businessId } }),
      db.customer.findMany({ where: { businessId } }),
      db.ledgerEntry.findMany({ where: { businessId } }),
      db.sale.findMany({ where: { businessId } }),
      db.saleItem.findMany({ where: { sale: { businessId } } }),
      db.supplier.findMany({ where: { businessId } }),
      db.purchase.findMany({ where: { businessId } }),
      db.purchaseItem.findMany({ where: { purchase: { businessId } } }),
      db.businessSetting.findMany({ where: { businessId } }),
      db.membership.findMany({
        where: { businessId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              name: true,
              phone: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "2.0-multi-tenant",
      business: {
        id: ctx.business.id,
        name: ctx.business.name,
        slug: ctx.business.slug,
      },
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
        businessSettings,
        memberships,
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
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  if (ctx.role !== "OWNER") {
    return NextResponse.json(
      { success: false, error: "Only business owners can restore backup" },
      { status: 403 }
    );
  }

  const businessId = ctx.business.id;

  try {
    let backupData;
    try {
      backupData = await request.json();
    } catch {
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

    const confirmationToken = request.headers.get("x-restore-confirmation");
    const expectedToken = process.env.RESTORE_CONFIRMATION_TOKEN;
    if (!expectedToken || confirmationToken !== expectedToken) {
      return NextResponse.json(
        { error: "Restore confirmation required. This operation will replace business data." },
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
      businessSettings = [],
    } = backupData.data;

    // Transactionally clear this business's data and restore
    await db.$transaction(async (tx) => {
      // Clear tenant records in dependency order
      await tx.saleItem.deleteMany({ where: { sale: { businessId } } });
      await tx.purchaseItem.deleteMany({ where: { purchase: { businessId } } });
      await tx.stockHistory.deleteMany({ where: { businessId } });
      await tx.ledgerEntry.deleteMany({ where: { businessId } });
      await tx.sale.deleteMany({ where: { businessId } });
      await tx.purchase.deleteMany({ where: { businessId } });
      await tx.product.deleteMany({ where: { businessId } });
      await tx.category.deleteMany({ where: { businessId } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.supplier.deleteMany({ where: { businessId } });
      await tx.businessSetting.deleteMany({ where: { businessId } });

      // Restore data with businessId enforcement
      if (businessSettings.length > 0) {
        await tx.businessSetting.createMany({
          data: businessSettings.map((s: Record<string, unknown>) => ({ ...s, businessId })),
        });
      }
      if (categories.length > 0) {
        await tx.category.createMany({
          data: categories.map((c: Record<string, unknown>) => ({ ...c, businessId })),
        });
      }
      if (suppliers.length > 0) {
        await tx.supplier.createMany({
          data: suppliers.map((s: Record<string, unknown>) => ({ ...s, businessId })),
        });
      }
      if (products.length > 0) {
        await tx.product.createMany({
          data: products.map((p: Record<string, unknown>) => ({ ...p, businessId })),
        });
      }
      if (customers.length > 0) {
        await tx.customer.createMany({
          data: customers.map((c: Record<string, unknown>) => ({ ...c, businessId })),
        });
      }
      if (purchases.length > 0) {
        await tx.purchase.createMany({
          data: purchases.map((p: Record<string, unknown>) => ({ ...p, businessId })),
        });
      }
      if (purchaseItems.length > 0) {
        await tx.purchaseItem.createMany({ data: purchaseItems });
      }
      if (sales.length > 0) {
        await tx.sale.createMany({
          data: sales.map((s: Record<string, unknown>) => ({ ...s, businessId })),
        });
      }
      if (saleItems.length > 0) {
        await tx.saleItem.createMany({ data: saleItems });
      }
      if (ledgerEntries.length > 0) {
        await tx.ledgerEntry.createMany({
          data: ledgerEntries.map((l: Record<string, unknown>) => ({ ...l, businessId })),
        });
      }
      if (stockHistory.length > 0) {
        await tx.stockHistory.createMany({
          data: stockHistory.map((sh: Record<string, unknown>) => ({ ...sh, businessId })),
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "Business data restored successfully",
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
