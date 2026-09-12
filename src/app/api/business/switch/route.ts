export const dynamic = "force-dynamic";

/**
 * POST /api/business/switch
 *
 * Switch the active business for the current session.
 * Verifies the user is actually a member of the target business
 * before updating the session — never trusts client-supplied businessId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: { businessId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { businessId } = body;

    if (!businessId || typeof businessId !== "string") {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    // SECURITY: Verify the user is actually a member of this business
    // NEVER trust the client-supplied businessId without server-side verification
    const membership = await db.membership.findUnique({
      where: {
        userId_businessId: {
          userId: session.user.id,
          businessId,
        },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (!membership || !membership.isActive) {
      return NextResponse.json(
        { error: "You are not a member of this business" },
        { status: 403 }
      );
    }

    if (!membership.business.isActive) {
      return NextResponse.json(
        { error: "This business is inactive" },
        { status: 403 }
      );
    }

    // Return the new business info — client must trigger NextAuth session update
    // (useSession().update()) to refresh the session token with the new businessId
    return NextResponse.json({
      success: true,
      data: {
        businessId: membership.business.id,
        businessName: membership.business.name,
        role: membership.role,
      },
    });
  } catch (error) {
    console.error("[BUSINESS_SWITCH]", error);
    return NextResponse.json({ error: "Failed to switch business" }, { status: 500 });
  }
}
