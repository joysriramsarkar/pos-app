export const dynamic = "force-dynamic";

/**
 * @deprecated Prefer POST /api/sales/returns
 * Thin compatibility wrapper used by older clients.
 * All refunds write SaleReturn records via processSaleReturn (shared).
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { toClientError } from "@/lib/api-errors";
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  fingerprintFor,
  IdempotencyConflict,
  IdempotencyInProgress,
} from "@/lib/idempotency";
import {
  mapRefundMethod,
  processSaleReturn,
  resolveReturnItems,
} from "@/lib/sale-returns";

const getIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;

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

    const idempotencyKey = request.headers.get("X-Idempotency-Key");
    const fingerprint = fingerprintFor("sale:return", {
      saleId,
      items,
      refundMethod: mappedMethod,
      via: "api/refunds-compat",
    });

    const result = await db.$transaction(async (tx) => {
      const claim = await claimIdempotencyTx<{ saleReturnId?: string }>(
        tx,
        businessId,
        "sale:return",
        idempotencyKey,
        {
          fingerprint,
          requestPayload: { saleId, items, refundMethod: mappedMethod },
          entityType: "SaleReturn",
          entityId: saleId,
        },
      );

      if (claim.replay) {
        const cached = (claim.result ?? {}) as { saleReturnId?: string };
        const existing = cached.saleReturnId
          ? await tx.saleReturn.findFirst({
              where: { id: cached.saleReturnId, businessId },
              include: { items: true },
            })
          : null;
        if (!existing) {
          throw Object.assign(
            new Error("Previous refund result is no longer available"),
            { status: 409 },
          );
        }
        return { saleReturn: existing, refundAmount: 0, isFullRefund: false, replay: true as const };
      }

      const sale = await tx.sale.findFirst({
        where: { id: saleId, businessId },
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

      const processed = await processSaleReturn(tx, {
        saleId,
        businessId,
        items: resolved,
        refundMethod: mappedMethod,
        reason: `Refund via /api/refunds (compat)`,
        userId,
      });

      // P1-C: audit commits with the refund.
      await logAudit(
        {
          userId,
          businessId,
          action: "CREATE_SALE_RETURN",
          entityType: "SaleReturn",
          entityId: processed.saleReturn.id,
          details: {
            saleId,
            refundAmount: processed.refundAmount,
            refundMethod: mappedMethod,
            via: "api/refunds-compat",
          },
          ipAddress: getIp(request),
        },
        tx,
      );

      if (claim.claim) {
        await finalizeIdempotencyTx(
          tx,
          claim.claim,
          { saleReturnId: processed.saleReturn.id, refundAmount: processed.refundAmount },
          { entityId: processed.saleReturn.id },
        );
      }

      return { ...processed, replay: false as const };
    });

    return NextResponse.json({
      success: true,
      data: result.saleReturn,
      isFullRefund: result.isFullRefund,
      refundAmount: result.refundAmount,
      message: "রিফান্ড সফল হয়েছে",
    });
  } catch (error: unknown) {
    console.error("Refund error:", error);
    if (error instanceof IdempotencyInProgress) {
      return NextResponse.json(
        { success: false, code: "INPROGRESS", error: "Same refund is already being processed. Retry shortly." },
        { status: 409, headers: { "Retry-After": "5" } },
      );
    }
    if (error instanceof IdempotencyConflict) {
      return NextResponse.json(
        { success: false, code: "IDEMPOTENCY_KEY_REUSED", error: "This idempotency key was already used for a different refund." },
        { status: 409 },
      );
    }
    const status = (error as { status?: number })?.status;
    if (status && status !== 500) {
      const message = error instanceof Error ? error.message : "রিফান্ড প্রক্রিয়া করতে ত্রুটি হয়েছে";
      return NextResponse.json({ success: false, error: message }, { status });
    }
    const { message, status: safe } = toClientError(error, "রিফান্ড প্রক্রিয়া করতে ত্রুটি হয়েছে");
    return NextResponse.json({ success: false, error: message }, { status: safe });
  }
}
