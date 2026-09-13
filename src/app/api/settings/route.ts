export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// store_logo is audited as changed/cleared, not the full base64 value
const LOGO_KEY = 'store_logo';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "settings.view");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    // 1. Fetch system defaults
    const systemSettings = await db.setting.findMany();
    const settingsObject = systemSettings.reduce((acc: Record<string, string>, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    // 2. Override with tenant-specific business settings
    const businessSettings = await db.businessSetting.findMany({
      where: { businessId },
    });
    for (const bs of businessSettings) {
      settingsObject[bs.key] = bs.value;
    }

    // Default store_name, phone, address to tenant business profile if not specifically set
    if (!businessSettings.some((s) => s.key === 'store_name')) {
      settingsObject.store_name = ctx.business.name;
    }
    if (ctx.business.phone && !businessSettings.some((s) => s.key === 'store_phone')) {
      settingsObject.store_phone = ctx.business.phone;
    }
    if (ctx.business.address && !businessSettings.some((s) => s.key === 'store_address')) {
      settingsObject.store_address = ctx.business.address;
    }

    return NextResponse.json({ success: true, data: settingsObject });
  } catch (error: unknown) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "settings.update");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
    }

    const entries = Object.entries(body);
    if (entries.length === 0) {
      return NextResponse.json({ success: true, message: "No settings to update" });
    }

    const keys = entries.map(([key]) => key);

    // Fetch old values for audit diff
    const oldSettings = await db.businessSetting.findMany({
      where: { businessId, key: { in: keys } },
      select: { key: true, value: true },
    });
    const oldMap = new Map(oldSettings.map((s) => [s.key, s.value]));

    const changedDetails: Record<string, { from: string; to: string }> = {};

    for (const [key, rawValue] of entries) {
      const newVal = typeof rawValue === "string" ? rawValue : String(rawValue);
      const oldVal = oldMap.get(key);

      const prevValStr = oldVal ?? '';
      if (newVal !== prevValStr) {
        if (key === LOGO_KEY) {
          changedDetails[key] = {
            from: prevValStr ? '[logo set]' : '[none]',
            to: newVal ? '[logo set]' : '[removed]',
          };
        } else {
          changedDetails[key] = { from: prevValStr, to: newVal };
        }
      }
    }

    await db.$transaction(async (tx) => {
      for (const [key, rawValue] of entries) {
        const val = typeof rawValue === "string" ? rawValue : String(rawValue);
        await tx.businessSetting.upsert({
          where: {
            businessId_key: {
              businessId,
              key,
            },
          },
          create: {
            businessId,
            key,
            value: val,
          },
          update: {
            value: val,
          },
        });
      }
    });

    if (Object.keys(changedDetails).length > 0) {
      await logAudit({
        businessId,
        userId: ctx.user.id,
        action: 'UPDATE_SETTINGS',
        entityType: 'BusinessSetting',
        details: changedDetails,
        ipAddress: getIp(request),
      });
    }

    return NextResponse.json({ success: true, message: "Settings updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
