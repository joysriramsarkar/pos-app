export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { requirePermission, getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { mapRefundMethod, processSaleReturn } from "@/lib/sale-returns";

const getIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;

// GET /api/sales/returns?saleId=xxx
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "sales.view");
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("saleId");

  try {
    const returns = await db.saleReturn.findMany({
      where: saleId ? { saleId } : undefined,
      include: { items: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: returns });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to fetch returns" }, { status: 500 });
  }
}

// POST /api/sales/returns — canonical refund/return endpoint
// Body: { saleId, items: [{ saleItemId, quantity }], refundMethod: Cash|Due|Prepaid, reason }
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "sales.edit");
  if (authError) return authError;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id || null;

  try {
    const body = await request.json();
    const { saleId, items, refundMethod = "Cash", reason } = body;

    if (!saleId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "saleId and items are required" },
        { status: 400 },
      );
    }

    const mappedMethod = mapRefundMethod(refundMethod);
    if (!mappedMethod) {
      return NextResponse.json(
        { success: false, error: "Invalid refund method. Use Cash, Due, or Prepaid." },
        { status: 400 },
      );
    }

    for (const item of items) {
      if (!item.saleItemId) {
        return NextResponse.json(
          { success: false, error: "Each item must include saleItemId" },
          { status: 400 },
        );
      }
    }

    const result = await db.$transaction((tx) =>
      processSaleReturn(tx, {
        saleId,
        items: items.map((i: { saleItemId: string; quantity: number }) => ({
          saleItemId: i.saleItemId,
          quantity: Number(i.quantity),
        })),
        refundMethod: mappedMethod,
        reason,
        userId,
      }),
    );

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: (user as { id?: string } | null)?.id,
      action: "CREATE_SALE_RETURN",
      entityType: "SaleReturn",
      entityId: result.saleReturn.id,
      details: {
        saleId,
        refundAmount: result.refundAmount,
        refundMethod: mappedMethod,
      },
      ipAddress: getIp(request),
    });

    return NextResponse.json({ success: true, data: result.saleReturn });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process return";
    const status = (error as { status?: number })?.status
      ?? (message.includes("not found") ? 404 : message.includes("Failed") ? 500 : 400);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
