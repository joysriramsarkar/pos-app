export const dynamic = "force-dynamic";

/**
 * @deprecated Prefer POST /api/sales/returns
 * Thin compatibility wrapper used by older clients.
 * All refunds write SaleReturn records via processSaleReturn (shared).
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import {
  mapRefundMethod,
  processSaleReturn,
  resolveReturnItems,
} from "@/lib/sale-returns";

const getIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "sales.edit");
  if (authError) return authError;

  try {
    const body = await request.json();
    const { saleId, items, refundMethod } = body as {
      saleId: string;
      items: Array<{ productId?: string; saleItemId?: string; quantity: number }>;
      refundMethod: string;
    };

    if (!saleId) {
      return NextResponse.json(
        { success: false, error: "বিক্রয় আইডি আবশ্যক" },
        { status: 400 },
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "কমপক্ষে একটি পণ্য রিফান্ড করতে হবে" },
        { status: 400 },
      );
    }

    const mappedMethod = mapRefundMethod(refundMethod);
    if (!mappedMethod) {
      return NextResponse.json(
        { success: false, error: "রিফান্ড পদ্ধতি সঠিক নয়" },
        { status: 400 },
      );
    }

    const user = await getAuthenticatedUser(request);
    const userId = (user as { id?: string } | null)?.id || null;

    const result = await db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: { id: true, items: { select: { id: true, productId: true, quantity: true } } },
      });
      if (!sale) {
        throw Object.assign(new Error("মূল বিক্রয় খুঁজে পাওয়া যায়নি"), { status: 404 });
      }

      const existingReturns = await tx.saleReturnItem.findMany({
        where: { saleItem: { saleId } },
        select: { saleItemId: true, quantity: true },
      });
      const alreadyReturnedMap = existingReturns.reduce<Record<string, number>>((acc, r) => {
        acc[r.saleItemId] = (acc[r.saleItemId] || 0) + Number(r.quantity);
        return acc;
      }, {});

      const resolved = resolveReturnItems(sale.items, alreadyReturnedMap, items);

      return processSaleReturn(tx, {
        saleId,
        items: resolved,
        refundMethod: mappedMethod,
        reason: `Refund via /api/refunds (compat)`,
        userId,
      });
    });

    await logAudit({
      userId: userId ?? undefined,
      action: "CREATE_SALE_RETURN",
      entityType: "SaleReturn",
      entityId: result.saleReturn.id,
      details: {
        saleId,
        refundAmount: result.refundAmount,
        refundMethod: mappedMethod,
        via: "api/refunds-compat",
      },
      ipAddress: getIp(request),
    });

    // Shape kept compatible with RefundDialog expectations
    return NextResponse.json(
      {
        success: true,
        data: {
          refund: result.saleReturn,
          isFullRefund: result.isFullRefund,
          refundAmount: result.refundAmount,
          originalSaleId: result.originalSaleId,
          originalInvoice: result.originalInvoice,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("রিফান্ড প্রক্রিয়ায় ত্রুটি:", error);
    const message = error instanceof Error ? error.message : "রিফান্ড প্রক্রিয়ায় ত্রুটি হয়েছে";
    const status = (error as { status?: number })?.status || 400;
    return NextResponse.json(
      { success: false, error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
