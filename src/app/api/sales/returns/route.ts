export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { mapRefundMethod, processSaleReturn } from "@/lib/sale-returns";

const getIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;

// GET /api/sales/returns?saleId=xxx
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "sales.view");
  if (denied) return denied;

  const businessId = ctx.business.id;
  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("saleId");

  try {
    const returns = await db.saleReturn.findMany({
      where: {
        businessId,
        ...(saleId ? { saleId } : {}),
      },
      include: { items: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: returns });
  } catch (error) {
    console.error("Error fetching returns:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch returns" }, { status: 500 });
  }
}

// POST /api/sales/returns — canonical refund/return endpoint
// Body: { saleId, items: [{ saleItemId, quantity }], refundMethod: Cash|Due|Prepaid, reason }
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "sales.refund");
  if (denied) return denied;

  const businessId = ctx.business.id;
  const userId = ctx.user.id;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { saleId, items, refundMethod = "Cash", reason } = body as {
      saleId?: unknown;
      items?: unknown;
      refundMethod?: unknown;
      reason?: unknown;
    };

    if (typeof saleId !== "string" || !saleId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "saleId and items are required" },
        { status: 400 },
      );
    }

    const refundMethodValue = typeof refundMethod === "string" ? refundMethod : undefined;
    const mappedMethod = mapRefundMethod(refundMethodValue);
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
        businessId,
        items: items.map((i: { saleItemId: string; quantity: number }) => ({
          saleItemId: i.saleItemId,
          quantity: Number(i.quantity),
        })),
        refundMethod: mappedMethod,
        reason: typeof reason === "string" ? reason : null,
        userId,
      }),
    );

    await logAudit({
      userId,
      businessId,
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
