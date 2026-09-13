/**
 * Tenant Context Library
 *
 * Central module for resolving and enforcing multi-tenant business context.
 * ALL protected API routes must use requireBusinessContext() to get the
 * authenticated business — never trust client-supplied businessId.
 *
 * Architecture:
 *   JWT session (userId)
 *     → Membership lookup
 *     → businessId + role resolved server-side
 *     → All DB queries scoped to that businessId
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ROLE_PERMISSIONS,
  PERMISSION_ALIASES,
  normalizePermission,
  roleHasPermission,
  getPermissionsForRole,
  type BusinessRole,
} from "./permissions-helpers";

export type { BusinessRole };
export {
  ROLE_PERMISSIONS,
  PERMISSION_ALIASES,
  normalizePermission,
  roleHasPermission,
  getPermissionsForRole,
};


export type BusinessContext = {
  user: {
    id: string;
    username: string;
    name: string;
    isActive: boolean;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    timezone: string;
    isActive: boolean;
    phone: string | null;
    address: string | null;
  };
  membership: {
    id: string;
    role: BusinessRole;
    isActive: boolean;
  };
  role: BusinessRole;
  permissions: string[];
};

/**
 * Resolve the authenticated business context from the current session.
 *
 * This is the ONLY trusted way to get businessId on the server.
 * Never use client-supplied businessId for authorization.
 *
 * Multi-business support: if the session contains a `businessId` (set during
 * business-switch), we look up that specific membership first. If not found or
 * inactive, we fall back to the user's first active membership.
 *
 * Returns the context or throws a NextResponse error.
 */
export async function requireBusinessContext(): Promise<
  BusinessContext | NextResponse
> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  // Session may carry the active businessId when user has multiple memberships
  const sessionBusinessId = session.user.businessId ?? null;

  // Fetch user + ALL active memberships (we'll pick the right one below)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      isActive: true,
      memberships: {
        where: { isActive: true },
        select: {
          id: true,
          role: true,
          isActive: true,
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              currency: true,
              timezone: true,
              isActive: true,
              phone: true,
              address: true,
            },
          },
        },
        orderBy: { createdAt: "asc" }, // Consistent ordering for fallback
      },
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User not found or inactive" }, { status: 401 });
  }

  if (user.memberships.length === 0) {
    return NextResponse.json(
      { error: "No active business membership found" },
      { status: 403 }
    );
  }

  // Prefer the session-specified businessId, fallback to first membership
  let membership = sessionBusinessId
    ? user.memberships.find((m) => m.business.id === sessionBusinessId) ?? user.memberships[0]
    : user.memberships[0];

  if (!membership || !membership.isActive) {
    return NextResponse.json(
      { error: "No active business membership found" },
      { status: 403 }
    );
  }

  if (!membership.business.isActive) {
    return NextResponse.json(
      { error: "Business account is inactive" },
      { status: 403 }
    );
  }

  const role = membership.role as BusinessRole;
  const permissions = ROLE_PERMISSIONS[role] ?? [];

  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      isActive: user.isActive,
    },
    business: membership.business,
    membership: {
      id: membership.id,
      role: membership.role as BusinessRole,
      isActive: membership.isActive,
    },
    role,
    permissions,
  };
}

/**
 * Check if a context has a specific permission.
 * Throws a 403 NextResponse if not.
 */
export function checkPermission(
  context: BusinessContext,
  permissionCode: string
): NextResponse | null {
  const canonical = normalizePermission(permissionCode);
  if (!context.permissions.includes(canonical) && !context.permissions.includes(permissionCode)) {
    return NextResponse.json(
      {
        error: `Permission denied: ${permissionCode}`,
        required: permissionCode,
        role: context.role,
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Check if a context has one of the given roles.
 */
export function checkRole(
  context: BusinessContext,
  roles: BusinessRole[]
): NextResponse | null {
  if (!roles.includes(context.role)) {
    return NextResponse.json(
      { error: "Insufficient role", required: roles, current: context.role },
      { status: 403 }
    );
  }
  return null;
}

