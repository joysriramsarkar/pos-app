export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api-middleware";

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const [lowStockItems, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          AND: [{ currentStock: { lte: prisma.product.fields.minStockLevel } }],
        },
        select: {
          id: true,
          name: true,
          nameBn: true,
          category: true,
          currentStock: true,
          minStockLevel: true,
          unit: true,
          barcode: true,
        },
        orderBy: { currentStock: "asc" },
        skip,
        take: limit,
      }),
      prisma.product.count({
        where: {
          isActive: true,
          AND: [{ currentStock: { lte: prisma.product.fields.minStockLevel } }],
        },
      }),
    ]);

    const parsedItems = lowStockItems.map((item) => ({
      ...item,
      currentStock: Number(item.currentStock),
      minStockLevel: Number(item.minStockLevel),
    }));

    return NextResponse.json({
      lowStockItems: parsedItems,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch {
    // prisma.product.fields column comparison not supported in all DBs — fallback to raw
    try {
      const sp = request.nextUrl.searchParams;
      const page = Math.max(1, parseInt(sp.get("page") || "1"));
      const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "50")));
      const skip = (page - 1) * limit;

      type RawStockItem = { id: string; name: string; nameBn: string | null; category: string | null; currentStock: number; minStockLevel: number; unit: string; barcode: string | null; };

      const [lowStockItems, countResult] = await Promise.all([
        prisma.$queryRaw<RawStockItem[]>`
          SELECT id, name, nameBn, category, currentStock, minStockLevel, unit, barcode
          FROM Product
          WHERE isActive = 1 AND currentStock <= minStockLevel
          ORDER BY currentStock ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
        prisma.$queryRaw<[{ count: number }]>`
          SELECT COUNT(*) as count FROM Product
          WHERE isActive = 1 AND currentStock <= minStockLevel
        `,
      ]);

      const totalCount = Number(countResult[0]?.count ?? 0);
      const parsedItems = lowStockItems.map((item) => ({
        ...item,
        currentStock: Number(item.currentStock),
        minStockLevel: Number(item.minStockLevel),
      }));

      return NextResponse.json({
        lowStockItems: parsedItems,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      });
    } catch (error: unknown) {
      console.error("Failed to fetch stock report:", error);
      return NextResponse.json(
        { error: "Failed to fetch stock report", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }
}
