/**
 * @deprecated This file re-exports from tenant.ts for backward compatibility.
 * Use `roleHasPermission` and `getPermissionsForRole` from `@/lib/tenant` directly.
 *
 * The authoritative permission map is `ROLE_PERMISSIONS` in `@/lib/tenant.ts`.
 * Do NOT maintain a separate map here — it leads to drift and security bugs.
 */
import { Session } from "next-auth";
import { roleHasPermission, getPermissionsForRole } from "./tenant";
import type { BusinessRole } from "@prisma/client";

export type UserRole = BusinessRole;

export function getUserRole(session: Session | null): UserRole | null {
  return (session?.user as { id?: string; role?: UserRole; username?: string })?.role || null;
}

/**
 * @deprecated Use `getPermissionsForRole(role)` from `@/lib/tenant` instead.
 * Kept as re-export for backward compatibility with existing callers.
 */
export const rolePermissions: Record<UserRole, string[]> = {
  OWNER: getPermissionsForRole("OWNER"),
  ADMIN: getPermissionsForRole("ADMIN"),
  MANAGER: getPermissionsForRole("MANAGER"),
  CASHIER: getPermissionsForRole("CASHIER"),
  VIEWER: getPermissionsForRole("VIEWER"),
};

export { roleHasPermission };
