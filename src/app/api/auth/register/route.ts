/**
 * POST /api/auth/register
 *
 * Multi-tenant registration flow:
 * 1. Validate inputs
 * 2. Create User (with bcrypt passwordHash)
 * 3. Create Business
 * 4. Create Membership (role: OWNER)
 * — all in a single DB transaction —
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { z } from "zod";

const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  phone: z.string().optional().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  businessName: z.string().min(2, "Business name must be at least 2 characters").max(200),
  businessType: z.string().default("grocery"),
  businessPhone: z.string().optional().nullable(),
  businessAddress: z.string().optional().nullable(),
  currency: z.string().default("INR"),
  timezone: z.string().default("Asia/Kolkata"),
});

const STORE_TYPE_CATEGORIES: Record<string, Array<{ name: string; nameBn: string; description: string }>> = {
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
    { name: "Kids & Baby", nameBn: "বাচ্চাদের পোশাক", description: "Kids clothing and baby wear" },
    { name: "Traditional & Festive", nameBn: "ঐতিহ্যবাহী পোশাক", description: "Panjabi, bridal, ethnic wear" },
    { name: "Undergarments", nameBn: "অন্তর্বাস", description: "Innerwear and hosiery" },
    { name: "Accessories", nameBn: "পোশাকের এক্সেসরিজ", description: "Belts, wallets, socks" },
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
    { name: "Beverages & Drinks", nameBn: "পানীয় ও জুস", description: "Cold drinks, tea, coffee, lassi" },
    { name: "Sweets & Desserts", nameBn: "মিষ্টি ও ডেজার্ট", description: "Sweets, ice cream, pastries" },
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      name,
      username,
      phone,
      password,
      businessName,
      businessType,
      businessPhone,
      businessAddress,
      currency,
      timezone,
    } = parsed.data;

    const cleanUsername = username.trim().toLowerCase();
    const cleanPhone = phone?.trim() || null;

    // Check for existing username
    const existingUsername = await db.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          { username: username.trim() },
        ],
      },
    });
    if (existingUsername) {
      return NextResponse.json(
        { error: "Username already taken", field: "username" },
        { status: 409 }
      );
    }

    // Check for existing phone (if provided)
    if (cleanPhone) {
      const existingPhone = await db.user.findUnique({ where: { phone: cleanPhone } });
      if (existingPhone) {
        return NextResponse.json(
          { error: "Phone number already registered", field: "phone" },
          { status: 409 }
        );
      }
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate unique business slug
    const baseSlug = generateSlug(businessName);
    const slug = await ensureUniqueSlug(baseSlug);

    // Create User + Business + Membership + Settings + Categories in a single transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Create user
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          username: cleanUsername,
          phone: cleanPhone,
          passwordHash,
          isActive: true,
          requiresPasswordChange: false,
        },
      });

      // 2. Create business
      const business = await tx.business.create({
        data: {
          name: businessName.trim(),
          slug,
          phone: businessPhone || null,
          address: businessAddress || null,
          currency,
          timezone,
          isActive: true,
        },
      });

      // 3. Create membership (OWNER)
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: "OWNER",
          isActive: true,
        },
      });

      // 4. Create business settings
      await tx.businessSetting.createMany({
        data: [
          { businessId: business.id, key: "store_name", value: businessName.trim() },
          { businessId: business.id, key: "store_name_bn", value: businessName.trim() },
          { businessId: business.id, key: "business_type", value: businessType },
          { businessId: business.id, key: "store_phone", value: businessPhone || cleanPhone || "" },
          { businessId: business.id, key: "store_address", value: businessAddress || "" },
          { businessId: business.id, key: "currency_symbol", value: currency === "BDT" ? "৳" : "₹" },
        ],
      });

      // 5. Seed tailored standard categories for this new business
      const categoryList = STORE_TYPE_CATEGORIES[businessType] || STORE_TYPE_CATEGORIES.general;
      await tx.category.createMany({
        data: categoryList.map((cat) => ({
          businessId: business.id,
          name: cat.name,
          nameBn: cat.nameBn,
          description: cat.description,
        })),
      });

      return { user, business, membership };
    }, { maxWait: 15000, timeout: 30000 });

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully",
        user: {
          id: result.user.id,
          username: result.user.username,
          name: result.user.name,
        },
        business: {
          id: result.business.id,
          name: result.business.name,
          slug: result.business.slug,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[register] Error:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: details || "Registration failed. Please try again.", details },
      { status: 500 }
    );
  }
}
