import { Session } from "next-auth";
import { UserRole } from "./permissions";

export function getUserRole(session: Session | null): UserRole | null {
  return (session?.user as { id?: string; role?: UserRole; username?: string })?.role || null;
}

export const rolePermissions: Record<UserRole, string[]> = {
  ADMIN: [
    "users.view", "users.create", "users.edit", "users.delete",
    "products.view", "products.create", "products.edit", "products.delete",
    "sales.view", "sales.create", "sales.edit", "sales.delete",
    "stock.view", "stock.edit", "stock.import",
    "reports.view", "reports.export",
    "settings.view", "settings.edit",
    "customers.view", "customers.create", "customers.edit", "customers.delete",
    "suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete",
    "expenses.view", "expenses.create", "expenses.edit", "expenses.delete",
  ],
  MANAGER: [
    "products.view", "products.create", "products.edit",
    "sales.view", "sales.create", "sales.edit",
    "stock.view", "stock.edit", "stock.import",
    "reports.view", "reports.export",
    "customers.view", "customers.create", "customers.edit", "customers.delete",
    "suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete",
    "expenses.view", "expenses.create", "expenses.edit", "expenses.delete",
  ],
  CASHIER: [
    "products.view",
    "sales.view", "sales.create",
    "customers.view", "customers.create",
    "suppliers.view",
  ],
  VIEWER: [
    "reports.view",
    "products.view",
    "sales.view",
    "customers.view",
    "stock.view",
    "suppliers.view",
    "expenses.view",
  ],
};

export function roleHasPermission(role: UserRole, permissionCode: string): boolean {
  return rolePermissions[role]?.includes(permissionCode) ?? false;
}
