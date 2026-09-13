export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission, BusinessRole } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

const VALID_ROLES: BusinessRole[] = ["ADMIN", "MANAGER", "CASHIER", "VIEWER"];

// GET /api/users - List all users in this business
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "users.view");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const memberships = await db.membership.findMany({
      where: { businessId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const users = memberships.map((m) => ({
      id: m.user.id,
      membershipId: m.id,
      username: m.user.username,
      email: m.user.email,
      name: m.user.name,
      phone: m.user.phone,
      role: m.role,
      isActive: m.isActive,
      createdAt: m.createdAt,
      updatedAt: m.user.updatedAt,
    }));

    return NextResponse.json({ success: true, data: users });
  } catch (error: unknown) {
    console.error("[USERS_GET]", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/users - Invite/create user for this business
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "users.invite");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const body = await request.json();
    const { username, email, name, phone, password, role } = body;

    // Validate required fields
    if (!username || !name) {
      return NextResponse.json(
        { success: false, error: "Username and name are required" },
        { status: 400 }
      );
    }

    const assignedRole: BusinessRole =
      role && VALID_ROLES.includes(role as BusinessRole)
        ? (role as BusinessRole)
        : "CASHIER";

    // Check if user already exists globally
    let user = await db.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: "insensitive" as const } },
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ],
      },
    });

    if (user) {
      // Check if user already belongs to this business
      const existingMembership = await db.membership.findUnique({
        where: {
          userId_businessId: {
            userId: user.id,
            businessId,
          },
        },
      });

      if (existingMembership) {
        return NextResponse.json(
          { success: false, error: "User is already a member of this business" },
          { status: 409 }
        );
      }

      // Add existing user to this business
      const membership = await db.membership.create({
        data: {
          userId: user.id,
          businessId,
          role: assignedRole,
          isActive: true,
        },
      });

      await logAudit({
        businessId,
        userId: ctx.user.id,
        action: "ADD_MEMBER",
        entityType: "Membership",
        entityId: membership.id,
        details: { targetUserId: user.id, username: user.username, role: assignedRole },
      });

      return NextResponse.json({
        success: true,
        data: {
          id: user.id,
          membershipId: membership.id,
          username: user.username,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: membership.role,
          isActive: membership.isActive,
        },
      });
    }

    // Creating a brand new user
    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password is required for new users" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          email: email || null,
          name,
          phone: phone || null,
          passwordHash,
          isActive: true,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: newUser.id,
          businessId,
          role: assignedRole,
          isActive: true,
        },
      });

      return { user: newUser, membership };
    });

    await logAudit({
      businessId,
      userId: ctx.user.id,
      action: "CREATE_USER_MEMBER",
      entityType: "Membership",
      entityId: result.membership.id,
      details: { username, role: assignedRole },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: result.user.id,
        membershipId: result.membership.id,
        username: result.user.username,
        email: result.user.email,
        name: result.user.name,
        phone: result.user.phone,
        role: result.membership.role,
        isActive: result.membership.isActive,
      },
    });
  } catch (error: unknown) {
    console.error("[USERS_POST]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
