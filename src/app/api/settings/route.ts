export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// store_logo is audited as changed/cleared, not the full base64 value
const LOGO_KEY = 'store_logo';

export async function GET(request: NextRequest) {
  try {
    const authError = await requirePermission(request, "settings.view");
    if (authError) return authError;

    const settings = await db.setting.findMany();

    const settingsObject = settings.reduce((acc: Record<string, string>, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

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
  try {
    const authError = await requirePermission(request, "settings.edit");
    if (authError) return authError;

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
    const oldSettings = await db.setting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const oldMap = new Map(oldSettings.map((s) => [s.key, s.value]));

    const toCreate: { key: string; value: string }[] = [];
    const toUpdate: { key: string; value: string }[] = [];
    const changedDetails: Record<string, { from: string; to: string }> = {};

    for (const [key, rawValue] of entries) {
      const newVal = typeof rawValue === "string" ? rawValue : String(rawValue);
      const oldVal = oldMap.get(key);

      if (oldVal !== undefined) {
        toUpdate.push({ key, value: newVal });
      } else {
        toCreate.push({ key, value: newVal });
      }

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
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map(({ key, value }) =>
            tx.setting.update({ where: { key }, data: { value } })
          )
        );
      }
      if (toCreate.length > 0) {
        await tx.setting.createMany({ data: toCreate });
      }
    });

    if (Object.keys(changedDetails).length > 0) {
      const user = await getAuthenticatedUser(request);
      await logAudit({
        userId: user?.id,
        action: 'UPDATE_SETTINGS',
        entityType: 'Setting',
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
