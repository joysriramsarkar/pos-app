export const dynamic = "force-dynamic";

/**
 * GET  /api/business — Get current business profile
 * PUT  /api/business — Update business profile (OWNER/ADMIN only)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

const BusinessUpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  currency: z.enum(["INR", "BDT", "USD", "EUR", "GBP"]).optional(),
  timezone: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const business = await db.business.findUnique({
      where: { id: ctx.business.id },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        email: true,
        address: true,
        currency: true,
        timezone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            memberships: { where: { isActive: true } },
            products: { where: { isActive: true } },
            customers: { where: { isActive: true } },
          },
        },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...business,
        memberCount: business._count.memberships,
        productCount: business._count.products,
        customerCount: business._count.customers,
      },
    });
  } catch (error) {
    console.error("[BUSINESS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch business" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "business.update");
  if (denied) return denied;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = BusinessUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // If name changed, regenerate slug (ensure uniqueness)
    let slugUpdate: { slug?: string } = {};
    if (data.name) {
      const baseSlug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim()
        .substring(0, 60);

      // Ensure unique slug (not taken by another business)
      let slug = baseSlug;
      let counter = 0;
      while (true) {
        const existing = await db.business.findUnique({ where: { slug } });
        if (!existing || existing.id === ctx.business.id) break;
        counter++;
        slug = `${baseSlug}-${counter}`;
      }
      slugUpdate = { slug };
    }

    const updated = await db.business.update({
      where: { id: ctx.business.id },
      data: {
        ...data,
        ...slugUpdate,
        updatedAt: new Date(),
      },
    });

    // Also update the BusinessSetting store_name if name changed
    if (data.name) {
      await db.businessSetting.upsert({
        where: { businessId_key: { businessId: ctx.business.id, key: "store_name" } },
        create: { businessId: ctx.business.id, key: "store_name", value: data.name },
        update: { value: data.name },
      });
    }

    await logAudit({
      businessId: ctx.business.id,
      userId: ctx.user.id,
      action: "UPDATE_BUSINESS",
      entityType: "Business",
      entityId: ctx.business.id,
      details: data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[BUSINESS_PUT]", error);
    return NextResponse.json({ error: "Failed to update business" }, { status: 500 });
  }
}
