export const dynamic = "force-dynamic";

/**
 * GET  /api/business/memberships  — All user's businesses (for switcher dropdown)
 * POST /api/business/memberships  — Create an additional business for the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CreateBusinessSchema = z.object({
  name: z.string().min(2).max(200),
  businessType: z.string().default("general"),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  currency: z.enum(["INR", "BDT", "USD", "EUR", "GBP"]).default("INR"),
  timezone: z.string().default("Asia/Kolkata"),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 60);
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 0;
  while (true) {
    const existing = await db.business.findUnique({ where: { slug } });
    if (!existing) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * GET — Returns all businesses the current user is a member of.
 * Used by the Business Switcher dropdown.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const memberships = await db.membership.findMany({
      where: { userId: session.user.id, isActive: true },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            timezone: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const businesses = memberships.map((m) => ({
      membershipId: m.id,
      businessId: m.business.id,
      businessName: m.business.name,
      businessSlug: m.business.slug,
      currency: m.business.currency,
      timezone: m.business.timezone,
      role: m.role,
      isActive: m.business.isActive,
      isCurrent: m.business.id === session.user.businessId,
    }));

    return NextResponse.json({ success: true, data: businesses });
  } catch (error) {
    console.error("[BUSINESS_MEMBERSHIPS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch businesses" }, { status: 500 });
  }
}

/**
 * POST — Create an additional business for the current user.
 * The user becomes OWNER of the new business.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = CreateBusinessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, businessType, phone, address, currency, timezone } = parsed.data;

    const baseSlug = generateSlug(name);
    const slug = await ensureUniqueSlug(baseSlug);

    const result = await db.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: name.trim(),
          slug,
          phone: phone || null,
          address: address || null,
          currency,
          timezone,
          isActive: true,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: session.user.id,
          businessId: business.id,
          role: "OWNER",
          isActive: true,
        },
      });

      // Seed default settings
      await tx.businessSetting.createMany({
        data: [
          { businessId: business.id, key: "store_name", value: name.trim() },
          { businessId: business.id, key: "business_type", value: businessType },
          { businessId: business.id, key: "store_phone", value: phone || "" },
          { businessId: business.id, key: "store_address", value: address || "" },
          { businessId: business.id, key: "currency_symbol", value: currency === "BDT" ? "৳" : "₹" },
        ],
      });

      return { business, membership };
    });

    return NextResponse.json(
      {
        success: true,
        message: "Business created successfully",
        data: {
          businessId: result.business.id,
          businessName: result.business.name,
          businessSlug: result.business.slug,
          role: result.membership.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[BUSINESS_MEMBERSHIPS_POST]", error);
    return NextResponse.json({ error: "Failed to create business" }, { status: 500 });
  }
}
