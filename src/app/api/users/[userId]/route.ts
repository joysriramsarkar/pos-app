export const dynamic = 'force-dynamic';
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

// Helper function to check admin access
async function requireAdmin(session: any) {
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return null;
  }
  return true;
}

// PATCH /api/users/[userId] - Update user (Admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireAdmin(session))) {
      return NextResponse.json(
        { success: false, error: "Only admins can update users" },
        { status: 403 }
      );
    }

    const { userId } = await params;
    const body = await request.json();
    const { username, email, name, phone, password, role, isActive } = body;

    // Check if user exists
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Prevent updating the last admin
    if (user.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await db.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (adminCount === 1) {
        return NextResponse.json(
          { success: false, error: "Cannot remove the last admin user" },
          { status: 400 }
        );
      }
    }

    // Check for duplicate username/email
    if (username && username !== user.username) {
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

    if (email && email !== user.email) {
      const existingEmail = await db.user.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          NOT: { id: userId },
        },
      });
      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: "Email already exists" },
          { status: 409 }
        );
      }
    }

    // Update user
    const updateData: any = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error: unknown) {
    console.error("[USERS_PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[userId] - Delete user (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireAdmin(session))) {
      return NextResponse.json(
        { success: false, error: "Only admins can delete users" },
        { status: 403 }
      );
    }

    const { userId } = await params;

    // Check if user exists
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting the last admin
    if (user.role === "ADMIN") {
      const adminCount = await db.user.count({
        where: { role: "ADMIN" },
      });
      if (adminCount === 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin user" },
          { status: 400 }
        );
      }
    }

    // Prevent deleting current user
    if (user.id === (session.user as { id?: string; role?: string; username?: string })?.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    // Delete user (soft delete - deactivate)
    await db.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[USERS_DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
