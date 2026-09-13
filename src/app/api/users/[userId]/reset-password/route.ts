export const dynamic = 'force-dynamic';

/**
 * POST /api/users/[userId]/reset-password
 *
 * Admin-initiated password reset (no SMS required).
 * Owner or Admin can reset any member's password within their business.
 * A random temporary password is generated, set on the user, and
 * requiresPasswordChange is flagged so the employee must change it on next login.
 *
 * The temporary password is returned in the response (shown once — store safely).
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";

/** Generate a human-readable 10-character temporary password */
function generateTemporaryPassword(): string {
  // Use only unambiguous chars (no 0/O, no l/1/I)
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join("");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  // Only users with users.invite permission can reset passwords
  const denied = checkPermission(ctx, "users.invite");
  if (denied) return denied;

  const businessId = ctx.business.id;
  const { userId } = await params;

  // Prevent resetting your own password via this endpoint
  if (userId === ctx.user.id) {
    return NextResponse.json(
      { success: false, error: "Use the change-password endpoint for your own password" },
      { status: 400 }
    );
  }

  try {
    // Verify the target user is a member of this business
    const membership = await db.membership.findUnique({
      where: {
        userId_businessId: {
          userId,
          businessId,
        },
      },
      include: {
        user: { select: { id: true, username: true, name: true } },
      },
    });

    if (!membership || !membership.isActive) {
      return NextResponse.json(
        { success: false, error: "User not found in this business" },
        { status: 404 }
      );
    }

    // Owners cannot have their passwords reset by non-owners (privilege escalation protection)
    if (membership.role === "OWNER" && ctx.role !== "OWNER") {
      return NextResponse.json(
        { success: false, error: "Only another Owner can reset an Owner's password" },
        { status: 403 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        requiresPasswordChange: true,
        // Reset any lockout so employee can log in
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await logAudit({
      businessId,
      userId: ctx.user.id,
      action: "RESET_MEMBER_PASSWORD",
      entityType: "User",
      entityId: userId,
      details: {
        targetUsername: membership.user.username,
        resetBy: ctx.user.username,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successful. Employee must change password on next login.",
      data: {
        userId: membership.user.id,
        username: membership.user.username,
        name: membership.user.name,
        temporaryPassword, // Shown only once — admin must securely share this
        requiresPasswordChange: true,
      },
    });
  } catch (error: unknown) {
    console.error("[RESET_PASSWORD]", error);
    return NextResponse.json(
      { success: false, error: "Password reset failed" },
      { status: 500 }
    );
  }
}
