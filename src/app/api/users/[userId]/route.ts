export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission, BusinessRole } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

const VALID_ROLES: BusinessRole[] = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "VIEWER"];

// PATCH /api/users/[userId] - Update user/membership (Admin/Owner only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "users.change_role");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const { userId } = await params;
    const body = await request.json();
    const { username, email, name, phone, password, role, isActive } = body;

    // Check if membership exists for this user in this business
    const membership = await db.membership.findUnique({
      where: {
        userId_businessId: {
          userId,
          businessId,
        },
      },
      include: {
        user: true,
      },
    });

    if (!membership) {
      return NextResponse.json({ success: false, error: "User not found in this business" }, { status: 404 });
    }

    // Prevent demoting/disabling the last OWNER
    if (membership.role === "OWNER" && (role !== "OWNER" || isActive === false)) {
      const ownerCount = await db.membership.count({
        where: { businessId, role: "OWNER", isActive: true },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { success: false, error: "Cannot remove or demote the only business owner" },
          { status: 400 }
        );
      }
    }

    // Check for duplicate username/phone if changing
    if (username && username !== membership.user.username) {
      const existingUser = await db.user.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        return NextResponse.json(
          { success: false, error: "Username already exists" },
          { status: 409 }
        );
      }
    }

    if (phone && phone !== membership.user.phone) {
      const existingPhone = await db.user.findFirst({
        where: {
          phone,
          NOT: { id: userId },
        },
      });
      if (existingPhone) {
        return NextResponse.json(
          { success: false, error: "Phone number already in use" },
          { status: 409 }
        );
      }
    }

    // Perform updates in transaction
    const updated = await db.$transaction(async (tx) => {
      // 1. Update membership role / status
      const membershipUpdateData: { role?: BusinessRole; isActive?: boolean } = {};
      if (role && VALID_ROLES.includes(role as BusinessRole)) {
        membershipUpdateData.role = role as BusinessRole;
      }
      if (isActive !== undefined) {
        membershipUpdateData.isActive = Boolean(isActive);
      }

      const updatedMembership = Object.keys(membershipUpdateData).length > 0
        ? await tx.membership.update({
            where: { id: membership.id },
            data: membershipUpdateData,
          })
        : membership;

      // 2. Update user profile fields if provided
      const userUpdateData: Record<string, unknown> = {};
      if (username !== undefined) userUpdateData.username = username;
      if (email !== undefined) userUpdateData.email = email;
      if (name !== undefined) userUpdateData.name = name;
      if (phone !== undefined) userUpdateData.phone = phone;
      if (password) {
        userUpdateData.passwordHash = await bcrypt.hash(password, 10);
      }

      const updatedUser = Object.keys(userUpdateData).length > 0
        ? await tx.user.update({
            where: { id: userId },
            data: userUpdateData,
          })
        : membership.user;

      return { user: updatedUser, membership: updatedMembership };
    });

    await logAudit({
      businessId,
      userId: ctx.user.id,
      action: "UPDATE_MEMBER",
      entityType: "Membership",
      entityId: membership.id,
      details: { targetUserId: userId, role, isActive },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.user.id,
        membershipId: updated.membership.id,
        username: updated.user.username,
        email: updated.user.email,
        name: updated.user.name,
        phone: updated.user.phone,
        role: updated.membership.role,
        isActive: updated.membership.isActive,
        updatedAt: updated.user.updatedAt,
      },
    });
  } catch (error: unknown) {
    console.error("[USERS_PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[userId] - Remove member from business
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "users.remove");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const { userId } = await params;

    // Check if membership exists
    const membership = await db.membership.findUnique({
      where: {
        userId_businessId: {
          userId,
          businessId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "User not found in this business" }, { status: 404 });
    }

    // Prevent removing the only OWNER
    if (membership.role === "OWNER") {
      const ownerCount = await db.membership.count({
        where: { businessId, role: "OWNER", isActive: true },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the only business owner" },
          { status: 400 }
        );
      }
    }

    // Prevent removing oneself
    if (userId === ctx.user.id) {
      return NextResponse.json(
        { error: "Cannot remove your own account from the business" },
        { status: 400 }
      );
    }

    // Soft delete membership (deactivate)
    await db.membership.update({
      where: { id: membership.id },
      data: { isActive: false },
    });

    await logAudit({
      businessId,
      userId: ctx.user.id,
      action: "REMOVE_MEMBER",
      entityType: "Membership",
      entityId: membership.id,
      details: { targetUserId: userId },
    });

    return NextResponse.json({ success: true, message: "Member deactivated successfully" });
  } catch (error: unknown) {
    console.error("[USERS_DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
