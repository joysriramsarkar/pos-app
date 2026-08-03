import { db } from "./db";
import { Session } from "next-auth";
import { getUserRole, rolePermissions, roleHasPermission } from "./permissions-helpers";

export type UserRole = "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";

export { getUserRole, rolePermissions, roleHasPermission };

/**
 * Check if a user has a specific permission
 * @param userId - User ID
 * @param permissionCode - Permission code (e.g., "sales.create")
 * @returns true if user has permission, false otherwise
 */
export async function hasPermission(
  userId: string,
  permissionCode: string
): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      return false;
    }

    // Check if permission exists for this role
    const permission = await db.rolePermission.findFirst({
      where: {
        role: user.role,
        permission: {
          code: permissionCode,
        },
      },
      select: { id: true },
    });

    return !!permission;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Check if a user has multiple permissions (all must be true)
 * @param userId - User ID
 * @param permissionCodes - Array of permission codes
 * @returns true if user has all permissions, false otherwise
 */
export async function hasAllPermissions(
  userId: string,
  permissionCodes: string[]
): Promise<boolean> {
  const results = await Promise.all(
    permissionCodes.map((code) => hasPermission(userId, code))
  );
  return results.every((result) => result);
}

/**
 * Check if a user has any of the given permissions
 * @param userId - User ID
 * @param permissionCodes - Array of permission codes
 * @returns true if user has any of the permissions, false otherwise
 */
export async function hasAnyPermission(
  userId: string,
  permissionCodes: string[]
): Promise<boolean> {
  const results = await Promise.all(
    permissionCodes.map((code) => hasPermission(userId, code))
  );
  return results.some((result) => result);
}

/**
 * Get all permissions for a user based on role
 * @param userId - User ID
 * @returns Array of permission codes
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      return [];
    }

    const permissions = await db.rolePermission.findMany({
      where: {
        role: user.role,
      },
      select: {
        permission: {
          select: {
            code: true,
          },
        },
      },
    });

    return permissions.map((rp) => rp.permission.code);
  } catch (error) {
    console.error("Error getting user permissions:", error);
    return [];
  }
}

/**
 * Check if session user has permission
 * @param session - NextAuth session
 * @param permissionCode - Permission code
 * @returns true if user has permission, false otherwise
 */
export async function sessionHasPermission(
  session: Session | null,
  permissionCode: string
): Promise<boolean> {
  if (!session?.user?.id) {
    return false;
  }
  return hasPermission(session.user.id, permissionCode);
}
