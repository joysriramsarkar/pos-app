/**
 * Permission System Definitions & Client-Safe Helpers
 *
 * This module is PURE and has NO dependencies on database or server modules.
 * It is safe to import in both Client Components and Server Components/APIs.
 */
import type { Session } from "next-auth";

export type BusinessRole = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";
export type UserRole = BusinessRole;

// Canonical permission map: which roles can perform which actions
export const ROLE_PERMISSIONS: Record<BusinessRole, string[]> = {
  OWNER: [
    // Full access
    "products.view", "products.create", "products.update", "products.delete",
    "categories.view", "categories.create", "categories.update", "categories.delete",
    "inventory.view", "inventory.create", "inventory.update",
    "sales.view", "sales.create", "sales.edit", "sales.cancel", "sales.refund",
    "customers.view", "customers.create", "customers.update", "customers.delete",
    "suppliers.view", "suppliers.create", "suppliers.update", "suppliers.delete",
    "purchases.view", "purchases.create", "purchases.update",
    "expenses.view", "expenses.create", "expenses.update", "expenses.delete",
    "reports.view", "reports.export",
    "settings.view", "settings.update",
    "users.view", "users.invite", "users.remove", "users.change_role",
    "audit.view",
    "business.update", "business.delete",
    "stock.create", "stock.edit",
    "due.view", "due.create", "due.collect",
  ],
  ADMIN: [
    "products.view", "products.create", "products.update", "products.delete",
    "categories.view", "categories.create", "categories.update", "categories.delete",
    "inventory.view", "inventory.create", "inventory.update",
    "sales.view", "sales.create", "sales.edit", "sales.cancel", "sales.refund",
    "customers.view", "customers.create", "customers.update", "customers.delete",
    "suppliers.view", "suppliers.create", "suppliers.update", "suppliers.delete",
    "purchases.view", "purchases.create", "purchases.update",
    "expenses.view", "expenses.create", "expenses.update", "expenses.delete",
    "reports.view", "reports.export",
    "settings.view", "settings.update",
    "users.view", "users.invite", "users.remove", "users.change_role",
    "audit.view",
    "business.update",
    "stock.create", "stock.edit",
    "due.view", "due.create", "due.collect",
  ],
  MANAGER: [
    "products.view", "products.create", "products.update",
    "categories.view", "categories.create", "categories.update",
    "inventory.view", "inventory.create", "inventory.update",
    "sales.view", "sales.create", "sales.edit", "sales.cancel", "sales.refund",
    "customers.view", "customers.create", "customers.update",
    "suppliers.view", "suppliers.create", "suppliers.update",
    "purchases.view", "purchases.create", "purchases.update",
    "expenses.view", "expenses.create", "expenses.update",
    "reports.view", "reports.export",
    "settings.view",
    "users.view",
    "stock.create", "stock.edit",
    "due.view", "due.create", "due.collect",
  ],
  CASHIER: [
    "products.view",
    "categories.view",
    "inventory.view",
    "sales.view", "sales.create",
    "customers.view", "customers.create", "customers.update",
    "purchases.view",
    "expenses.view",
    "due.view", "due.collect",
    "stock.create",
  ],
  VIEWER: [
    "products.view",
    "categories.view",
    "inventory.view",
    "sales.view",
    "customers.view",
    "suppliers.view",
    "purchases.view",
    "expenses.view",
    "reports.view",
    "due.view",
  ],
};

// Canonical alias map for backward compatibility
export const PERMISSION_ALIASES: Record<string, string> = {
  "users.create": "users.invite",
  "products.edit": "products.update",
  "settings.edit": "settings.update",
  "categories.edit": "categories.update",
  "customers.edit": "customers.update",
  "suppliers.edit": "suppliers.update",
  "expenses.edit": "expenses.update",
};

export function normalizePermission(permissionCode: string): string {
  return PERMISSION_ALIASES[permissionCode] || permissionCode;
}

/**
 * Check if a role has a specific permission (static lookup, no DB).
 */
export function roleHasPermission(role: BusinessRole, permissionCode: string): boolean {
  if (!role || !permissionCode) return false;
  const canonical = normalizePermission(permissionCode);
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(canonical) || permissions.includes(permissionCode);
}

/**
 * Get all permissions for a given role (static lookup).
 */
export function getPermissionsForRole(role: BusinessRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function getUserRole(session: Session | null): UserRole | null {
  return (session?.user as { id?: string; role?: UserRole; username?: string })?.role || null;
}

export const rolePermissions: Record<UserRole, string[]> = {
  OWNER: getPermissionsForRole("OWNER"),
  ADMIN: getPermissionsForRole("ADMIN"),
  MANAGER: getPermissionsForRole("MANAGER"),
  CASHIER: getPermissionsForRole("CASHIER"),
  VIEWER: getPermissionsForRole("VIEWER"),
};
