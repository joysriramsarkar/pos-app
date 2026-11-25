export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { mapRefundMethod, processSaleReturn } from "@/lib/sale-returns";
import { toClientError } from '@/lib/api-errors';
import { z } from "zod";
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  fingerprintFor,
  IdempotencyConflict,
  IdempotencyInProgress,
} from "@/lib/idempotency";

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

    const returnItems = items.map((i: { saleItemId: string; quantity: number }) => ({
      saleItemId: i.saleItemId,
      quantity: Number(i.quantity),
    }));
    const returnReason = typeof reason === "string" ? reason : null;

    // P0-B/P1-C: idempotency and audit live INSIDE the same transaction as the
    // refund, so a retried return can never refund/restock twice and a return
    // can never commit without its audit row.
    const rawKey = request.headers.get("X-Idempotency-Key");
    let idempotencyKey: string | null = null;
    if (rawKey !== null) {
      const parsedKey = z.string().min(8).max(128).safeParse(rawKey);
      if (!parsedKey.success) {
        return NextResponse.json(
          { success: false, error: "Invalid X-Idempotency-Key header" },
          { status: 400 },
        );
      }
      idempotencyKey = parsedKey.data;
    }

    const fingerprint = fingerprintFor("sale:return", {
      saleId,
      items: returnItems,
      refundMethod: mappedMethod,
      reason: returnReason,
    });

    type CachedReturn = {
      saleReturnId?: string;
      refundAmount?: number;
      isFullRefund?: boolean;
    };

    try {
      const outcome = await db.$transaction(async (tx) => {
        const claim = await claimIdempotencyTx<CachedReturn>(
          tx,
          businessId,
          "sale:return",
          idempotencyKey,
          {
            fingerprint,
            requestPayload: { saleId, items: returnItems, refundMethod: mappedMethod, reason: returnReason },
            entityType: "SaleReturn",
            entityId: saleId,
          },
        );

        if (claim.replay) return { replay: true as const, cached: claim.result };

        const processed = await processSaleReturn(tx, {
          saleId,
          businessId,
          items: returnItems,
          refundMethod: mappedMethod,
          reason: returnReason,
          userId,
        });

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
            },
            ipAddress: getIp(request),
          },
          tx,
        );

        if (claim.claim) {
          await finalizeIdempotencyTx(
            tx,
            claim.claim,
            {
              saleReturnId: processed.saleReturn.id,
              refundAmount: processed.refundAmount,
              isFullRefund: processed.isFullRefund,
            },
            { entityId: processed.saleReturn.id },
          );
        }

        return { replay: false as const, saleReturn: processed.saleReturn };
      });

      if (outcome.replay) {
        const cached = (outcome.cached ?? {}) as CachedReturn;
        const saleReturn = cached.saleReturnId
          ? await db.saleReturn.findFirst({
              where: { id: cached.saleReturnId, businessId },
              include: { items: true },
            })
          : null;
        if (!saleReturn) {
          return NextResponse.json(
            { success: false, error: "Previous return result is no longer available" },
            { status: 409 },
          );
        }
        return NextResponse.json({ success: true, data: saleReturn, idempotent: true });
      }

      return NextResponse.json({ success: true, data: outcome.saleReturn });
    } catch (txError) {
      if (txError instanceof IdempotencyInProgress) {
        return NextResponse.json(
          { success: false, code: "INPROGRESS", error: "Same return is already being processed. Retry shortly." },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
      if (txError instanceof IdempotencyConflict) {
        return NextResponse.json(
          {
            success: false,
            code: "IDEMPOTENCY_KEY_REUSED",
            error: "This idempotency key was already used for a different return request.",
          },
          { status: 409 },
        );
      }
      throw txError;
    }
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Failed to process return";
    const coded = (error as { status?: number })?.status;
    if (coded === 404 || coded === 400) {
      return NextResponse.json({ success: false, error: raw }, { status: coded });
    }
    if (coded === 409) {
      return NextResponse.json({ success: false, error: raw }, { status: 409 });
    }
    const { message, status } = toClientError(error, "Failed to process return");
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
