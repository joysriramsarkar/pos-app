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

/** Payload for POST /api/business — creates an extra store for the same user. */
const CreateBusinessSchema = z.object({
  name: z.string().min(2, "Business name must be at least 2 characters").max(200),
  type: z.string().max(50).optional(),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  currency: z.enum(["INR", "BDT", "USD", "EUR", "GBP"]).optional(),
  timezone: z.string().max(100).optional(),
});

function generateSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 60);
  // Bengali-only names ("লক্ষ্মী ভাণ্ডার") produce an empty slug.
  if (!ascii || ascii === "-") {
    return `shop-${Math.random().toString(36).slice(2, 8)}`;
  }
  return ascii;
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 0;
  while (counter < 50) {
    const existing = await db.business.findUnique({ where: { slug } });
    if (!existing) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}

/** Starter categories for a newly created store, by business type. */
const STORE_TYPE_CATEGORIES: Record<
  string,
  Array<{ name: string; nameBn: string; description: string }>
> = {
  grocery: [
    { name: "Groceries", nameBn: "মুদি ও চাল-ডাল", description: "Rice, lentils, oil, spices, and grains" },
    { name: "Packaged Snacks", nameBn: "প্যাকেটজাত খাবার", description: "Biscuits, chips, noodles" },
    { name: "Beverages", nameBn: "পানীয়", description: "Cold drinks, tea, coffee, juice" },
    { name: "Dairy & Frozen", nameBn: "দুগ্ধজাত ও ঘি", description: "Milk, butter, curd, ghee" },
    { name: "Personal Care", nameBn: "ব্যক্তিগত যত্ন", description: "Soap, shampoo, toothpaste" },
    { name: "Household", nameBn: "গৃহস্থালি ও পরিষ্কার", description: "Detergent, cleaning supplies" },
  ],
  pharmacy: [
    { name: "Tablets & Capsules", nameBn: "ট্যাবলেট ও ক্যাপসুল", description: "All oral solid medications" },
    { name: "Syrups & Liquids", nameBn: "সিরাপ ও ড্রপস", description: "Cough syrups, suspensions, drops" },
    { name: "First Aid & Surgical", nameBn: "ফার্স্ট এইড ও ব্যান্ডেজ", description: "Bandages, cotton, antiseptics" },
    { name: "Baby Care", nameBn: "শিশুখাদ্য ও যত্ন", description: "Baby formula, diapers, lotions" },
    { name: "Health Supplements", nameBn: "সাপ্লিমেন্ট ও ভিটামিন", description: "Vitamins, protein, minerals" },
    { name: "Personal Hygiene", nameBn: "ব্যক্তিগত স্বাস্থ্য", description: "Handwash, sanitizer, masks" },
  ],
  clothing: [
    { name: "Men's Wear", nameBn: "পুরুষদের পোশাক", description: "Shirts, t-shirts, trousers, jeans" },
    { name: "Women's Wear", nameBn: "মহিলাদের পোশাক", description: "Sarees, kurtis, salwar, tops" },
    { name: "Kids & Baby", nameBn: "ছোটদের পোশাক", description: "Kids clothing and baby wear" },
    { name: "Traditional & Festive", nameBn: "ঐতিহ্যবাহী পোশাক", description: "Panjabi, bridal, ethnic wear" },
    { name: "Undergarments", nameBn: "অন্তর্বাস", description: "Innerwear and hosiery" },
    { name: "Accessories", nameBn: "পোশাকের এক্সেসরিজ", description: "Belts, wallets, sunglasses" },
  ],
  electronics: [
    { name: "Mobile & Tablets", nameBn: "মোবাইল ও ট্যাবলেট", description: "Smartphones and tablets" },
    { name: "Mobile Accessories", nameBn: "মোবাইল এক্সেসরিজ", description: "Cases, screen guards, chargers" },
    { name: "Audio & Headphones", nameBn: "অডিও ও হেডফোন", description: "Earphones, speakers, TWS" },
    { name: "Cables & Adapters", nameBn: "কেবল ও চার্জার", description: "USB cables, adapters, power banks" },
    { name: "Computer Accessories", nameBn: "কম্পিউটার এক্সেসরিজ", description: "Mouse, keyboard, pendrive" },
    { name: "Home Appliances", nameBn: "গৃহস্থালি গ্যাজেট", description: "Small electric items and gadgets" },
  ],
  restaurant: [
    { name: "Fast Food & Snacks", nameBn: "ফাস্ট ফুড ও স্ন্যাক্স", description: "Burgers, rolls, patties, fries" },
    { name: "Main Course", nameBn: "প্রধান খাবার", description: "Rice, biryani, curry, roti" },
    { name: "Beverages & Drinks", nameBn: "পানীয় ও জুস", description: "Cold drinks, tea, lassi" },
    { name: "Sweets & Desserts", nameBn: "মিষ্টি ও ডেজার্ট", description: "Cakes, breads, sweets" },
    { name: "Bakery", nameBn: "বেকারি আইটেম", description: "Cakes, breads, biscuits" },
  ],
  general: [
    { name: "General Retail", nameBn: "দৈনন্দিন সাধারণ পণ্য", description: "Everyday retail products" },
    { name: "Stationery", nameBn: "খাতা-কলম ও স্টেশনারি", description: "Notebooks, pens, office items" },
    { name: "Cosmetics", nameBn: "প্রসাধন সামগ্রী", description: "Creams, lotions, makeup" },
    { name: "Gifts & Toys", nameBn: "উপহার ও খেলনা", description: "Gifts, toys, decorative items" },
    { name: "Others", nameBn: "অন্যান্য আইটেম", description: "Miscellaneous products" },
  ],
};

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

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  // Adding a store is an owner-level action, same as managing the business.
  const denied = checkPermission(ctx, "business.update");
  if (denied) return denied;

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

    const { name, type, phone, address, currency, timezone } = parsed.data;
    const cleanName = name.trim();
    const slug = await ensureUniqueSlug(generateSlug(cleanName));

    const result = await db.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: cleanName,
          slug,
          phone: phone?.trim() || ctx.business.phone || null,
          address: address?.trim() || null,
          currency: currency ?? ctx.business.currency ?? "INR",
          timezone: timezone ?? ctx.business.timezone ?? "Asia/Kolkata",
          isActive: true,
        },
      });

      // Re-use the CURRENT user. Do not create another account / another owner.
      await tx.membership.create({
        data: {
          userId: ctx.user.id,
          businessId: business.id,
          role: "OWNER",
          isActive: true,
        },
      });

      await tx.businessSetting.createMany({
        data: [
          { businessId: business.id, key: "store_name", value: cleanName },
          { businessId: business.id, key: "store_name_bn", value: cleanName },
          { businessId: business.id, key: "business_type", value: type ?? "general" },
          { businessId: business.id, key: "store_phone", value: phone?.trim() || "" },
          { businessId: business.id, key: "store_address", value: address?.trim() || "" },
          {
            businessId: business.id,
            key: "currency_symbol",
            value: currency === "BDT" ? "৳" : "₹",
          },
        ],
      });

      const categoryList = STORE_TYPE_CATEGORIES[type ?? "general"] ?? STORE_TYPE_CATEGORIES.general;
      await tx.category.createMany({
        data: categoryList.map((cat) => ({
          businessId: business.id,
          name: cat.name,
          nameBn: cat.nameBn,
          description: cat.description,
        })),
      });

      return business;
    });

    await logAudit({
      businessId: result.id,
      userId: ctx.user.id,
      action: "CREATE_BUSINESS",
      entityType: "Business",
      entityId: result.id,
      details: { name: cleanName, slug },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          businessId: result.id,
          businessName: result.name,
          slug: result.slug,
          role: "OWNER",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[BUSINESS_POST]", error);
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "A store with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create the store" }, { status: 500 });
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

/**
 * DELETE /api/business — Soft-delete the business (OWNER only).
 *
 * Sets isActive = false and deactivates all memberships.
 * Financial records (sales, purchases, ledger) are preserved for audit trail.
 * Hard-delete is intentionally NOT supported.
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  // Only OWNER can deactivate a business
  const denied = checkPermission(ctx, "business.delete");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    await db.$transaction(async (tx) => {
      // 1. Deactivate all memberships for this business
      await tx.membership.updateMany({
        where: { businessId },
        data: { isActive: false },
      });

      // 2. Soft-delete the business itself
      await tx.business.update({
        where: { id: businessId },
        data: { isActive: false, updatedAt: new Date() },
      });
    });

    await logAudit({
      businessId,
      userId: ctx.user.id,
      action: "DEACTIVATE_BUSINESS",
      entityType: "Business",
      entityId: businessId,
      details: { name: ctx.business.name },
    });

    return NextResponse.json({
      success: true,
      message: "Business deactivated. All data is preserved and can be restored by a platform admin.",
    });
  } catch (error) {
    console.error("[BUSINESS_DELETE]", error);
    return NextResponse.json({ error: "Failed to deactivate business" }, { status: 500 });
  }
}
