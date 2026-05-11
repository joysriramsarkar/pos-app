export const dynamic = 'force-dynamic';
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Helper function to check admin access
async function requireAdmin(session: any) {
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return null;
  }
  return true;
}

// GET /api/users - List all users (Admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireAdmin(session))) {
      return NextResponse.json(
        { success: false, error: "Only admins can manage users" },
        { status: 403 }
      );
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error: unknown) {
    console.error("[USERS_GET]", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/users - Create new user (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireAdmin(session))) {
      return NextResponse.json(
        { success: false, error: "Only admins can create users" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, email, name, phone, password, role } = body;

    // Validate required fields
    if (!username || !name || !password) {
      return NextResponse.json(
        { success: false, error: "Username, name, and password are required" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await db.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: "insensitive" as const } },
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "Username or email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await db.user.create({
      data: {
        username,
        email: email || null,
        name,
        phone: phone || null,
        password: hashedPassword,
        role: role || "CASHIER",
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error: unknown) {
    console.error("[USERS_POST]", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
