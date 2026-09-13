/**
 * Permissions module — Multi-tenant aware
 *
 * Permission checking is now based on BusinessRole from Membership,
 * not on the old global UserRole. Uses the ROLE_PERMISSIONS map in tenant.ts.
 */

import { db } from "./db";
import { Session } from "next-auth";
import { roleHasPermission, getPermissionsForRole } from "./tenant";
import type { BusinessRole } from "@prisma/client";

export type { BusinessRole };
export type UserRole = BusinessRole;
export { roleHasPermission, getPermissionsForRole };

/**
 * Check if a user has a specific permission based on their membership role.
 * Looks up the user's active membership to get their current role.
 *
 * @param userId - User ID
 * @param permissionCode - Permission code (e.g., "sales.create")
 * @param businessId - Optional: specific business to check (defaults to user's primary membership)
 */
export async function hasPermission(
  userId: string,
  permissionCode: string,
  businessId?: string
): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        memberships: {
          where: {
            isActive: true,
            ...(businessId ? { businessId } : {}),
          },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!user || !user.isActive) {
      return false;
    }

    const membership = user.memberships[0];
    if (!membership) {
      return false;
    }

    return roleHasPermission(membership.role as BusinessRole, permissionCode);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Check if a user has multiple permissions (all must be true).
 */
export async function hasAllPermissions(
  userId: string,
  permissionCodes: string[],
  businessId?: string
): Promise<boolean> {
  const results = await Promise.all(
    permissionCodes.map((code) => hasPermission(userId, code, businessId))
  );
  return results.every((result) => result);
}

/**
 * Check if a user has any of the given permissions.
 */
export async function hasAnyPermission(
  userId: string,
  permissionCodes: string[],
  businessId?: string
): Promise<boolean> {
  const results = await Promise.all(
    permissionCodes.map((code) => hasPermission(userId, code, businessId))
  );
  return results.some((result) => result);
}

/**
 * Get all permissions for a user based on their membership role.
 */
export async function getUserPermissions(
  userId: string,
  businessId?: string
): Promise<string[]> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        memberships: {
          where: {
            isActive: true,
            ...(businessId ? { businessId } : {}),
          },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!user || !user.isActive) {
      return [];
    }

    const membership = user.memberships[0];
    if (!membership) {
      return [];
    }

    return getPermissionsForRole(membership.role as BusinessRole);
  } catch (error) {
    console.error("Error getting user permissions:", error);
    return [];
  }
}

/**
 * Check if session user has permission.
 */
export async function sessionHasPermission(
  session: Session | null,
  permissionCode: string
): Promise<boolean> {
  if (!session?.user?.id) {
    return false;
  }
  return hasPermission(session.user.id, permissionCode, session.user.businessId);
}

// Legacy exports for backward compatibility
export function getUserRole(role: BusinessRole): BusinessRole {
  return role;
}

export const rolePermissions: Record<BusinessRole, string[]> = {
  OWNER: getPermissionsForRole("OWNER"),
  ADMIN: getPermissionsForRole("ADMIN"),
  MANAGER: getPermissionsForRole("MANAGER"),
  CASHIER: getPermissionsForRole("CASHIER"),
  VIEWER: getPermissionsForRole("VIEWER"),
};
