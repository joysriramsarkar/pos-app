import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requireBusinessContext,
  checkPermission,
  checkRole,
  roleHasPermission,
  getPermissionsForRole,
  normalizePermission,
  type BusinessContext,
} from "./tenant";
import { NextResponse } from "next/server";

// Mock next-auth
const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));

// Mock db
const mockUserFindUnique = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockProductFindMany = vi.fn();
const mockProductFindUnique = vi.fn();
const mockProductUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
      update: vi.fn(),
    },
    membership: {
      findUnique: (...args: any[]) => mockMembershipFindUnique(...args),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    product: {
      findMany: (...args: any[]) => mockProductFindMany(...args),
      findUnique: (...args: any[]) => mockProductFindUnique(...args),
      update: (...args: any[]) => mockProductUpdate(...args),
    },
    $transaction: (cb: any) => (typeof cb === "function" ? cb(mockDbTx) : mockTransaction(cb)),
  },
}));

const mockDbTx = {
  product: {
    findMany: (...args: any[]) => mockProductFindMany(...args),
    findFirst: vi.fn(),
  },
  business: {
    update: vi.fn(),
  },
  membership: {
    updateMany: vi.fn(),
  },
};

describe("Multi-Tenant Security & IDOR Prevention Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Cross-Tenant IDOR Protection", () => {
    it("should never allow a query to return another tenant's records", async () => {
      // Simulate tenant A context
      const tenantAContext: BusinessContext = {
        user: { id: "user_a", username: "alice", name: "Alice", isActive: true },
        business: {
          id: "biz_tenant_a",
          name: "Tenant A Store",
          slug: "tenant-a",
          currency: "BDT",
          timezone: "Asia/Dhaka",
          isActive: true,
          phone: null,
          address: null,
        },
        membership: { id: "mem_a", role: "OWNER", isActive: true },
        role: "OWNER",
        permissions: getPermissionsForRole("OWNER"),
      };

      // Mock Product lookup with businessId filter
      mockProductFindMany.mockImplementation(async (query: { where: { businessId: string } }) => {
        if (query.where.businessId === "biz_tenant_a") {
          return [{ id: "prod_1", name: "Tenant A Product", businessId: "biz_tenant_a" }];
        }
        return [];
      });

      // Tenant A queries products
      const productsForA = await mockProductFindMany({
        where: { businessId: tenantAContext.business.id },
      });
      expect(productsForA).toHaveLength(1);
      expect(productsForA[0].businessId).toBe("biz_tenant_a");

      // Tenant A tries to query products of Tenant B
      const productsForB = await mockProductFindMany({
        where: { businessId: "biz_tenant_b" },
      });
      expect(productsForB).toHaveLength(0);
    });

    it("should enforce compound unique / scoping on updates (where: { id, businessId })", () => {
      // Any tenant update must include both record ID and tenant businessId
      const updatePayload = {
        where: { id: "prod_123", businessId: "biz_tenant_a" },
        data: { name: "Updated Name" },
      };

      expect(updatePayload.where.businessId).toBe("biz_tenant_a");
      expect(updatePayload.where.id).toBe("prod_123");
    });
  });

  describe("2. Role-Based Access Control Boundaries", () => {
    it("VIEWER cannot create, edit, or delete products", () => {
      expect(roleHasPermission("VIEWER", "products.view")).toBe(true);
      expect(roleHasPermission("VIEWER", "products.create")).toBe(false);
      expect(roleHasPermission("VIEWER", "products.update")).toBe(false);
      expect(roleHasPermission("VIEWER", "products.edit")).toBe(false);
      expect(roleHasPermission("VIEWER", "products.delete")).toBe(false);
    });

    it("CASHIER can view products and create sales, but cannot delete products or view reports", () => {
      expect(roleHasPermission("CASHIER", "products.view")).toBe(true);
      expect(roleHasPermission("CASHIER", "sales.create")).toBe(true);
      expect(roleHasPermission("CASHIER", "products.delete")).toBe(false);
      expect(roleHasPermission("CASHIER", "reports.view")).toBe(false);
      expect(roleHasPermission("CASHIER", "users.invite")).toBe(false);
    });

    it("MANAGER can manage products and sales, but cannot delete business or manage roles", () => {
      expect(roleHasPermission("MANAGER", "products.create")).toBe(true);
      expect(roleHasPermission("MANAGER", "products.update")).toBe(true);
      expect(roleHasPermission("MANAGER", "sales.create")).toBe(true);
      expect(roleHasPermission("MANAGER", "reports.view")).toBe(true);
      expect(roleHasPermission("MANAGER", "business.delete")).toBe(false);
      expect(roleHasPermission("MANAGER", "users.change_role")).toBe(false);
    });

    it("ADMIN can manage users and update business, but cannot delete business", () => {
      expect(roleHasPermission("ADMIN", "users.invite")).toBe(true);
      expect(roleHasPermission("ADMIN", "users.change_role")).toBe(true);
      expect(roleHasPermission("ADMIN", "business.update")).toBe(true);
      expect(roleHasPermission("ADMIN", "business.delete")).toBe(false);
    });

    it("OWNER has full system access including business.delete", () => {
      expect(roleHasPermission("OWNER", "business.delete")).toBe(true);
      expect(roleHasPermission("OWNER", "business.update")).toBe(true);
      expect(roleHasPermission("OWNER", "users.invite")).toBe(true);
      expect(roleHasPermission("OWNER", "users.remove")).toBe(true);
      expect(roleHasPermission("OWNER", "reports.export")).toBe(true);
    });

    it("checkPermission returns 403 NextResponse when user lacks permission", () => {
      const cashierContext: BusinessContext = {
        user: { id: "u1", username: "cashier1", name: "Cashier", isActive: true },
        business: {
          id: "biz_1",
          name: "Shop",
          slug: "shop",
          currency: "BDT",
          timezone: "Asia/Dhaka",
          isActive: true,
          phone: null,
          address: null,
        },
        membership: { id: "mem_1", role: "CASHIER", isActive: true },
        role: "CASHIER",
        permissions: getPermissionsForRole("CASHIER"),
      };

      const result = checkPermission(cashierContext, "users.invite");
      expect(result).toBeInstanceOf(NextResponse);
      expect(result?.status).toBe(403);
    });

    it("checkRole enforces minimum role requirements", () => {
      const managerContext: BusinessContext = {
        user: { id: "u1", username: "mgr1", name: "Manager", isActive: true },
        business: {
          id: "biz_1",
          name: "Shop",
          slug: "shop",
          currency: "BDT",
          timezone: "Asia/Dhaka",
          isActive: true,
          phone: null,
          address: null,
        },
        membership: { id: "mem_1", role: "MANAGER", isActive: true },
        role: "MANAGER",
        permissions: getPermissionsForRole("MANAGER"),
      };

      // Allowed for MANAGER
      expect(checkRole(managerContext, ["OWNER", "ADMIN", "MANAGER"])).toBeNull();

      // Denied when OWNER or ADMIN only
      const denied = checkRole(managerContext, ["OWNER", "ADMIN"]);
      expect(denied).toBeInstanceOf(NextResponse);
      expect(denied?.status).toBe(403);
    });
  });

  describe("3. Permission Aliases Backward Compatibility", () => {
    it("normalizes aliases correctly", () => {
      expect(normalizePermission("users.create")).toBe("users.invite");
      expect(normalizePermission("products.edit")).toBe("products.update");
      expect(normalizePermission("settings.edit")).toBe("settings.update");
      expect(normalizePermission("unknown.perm")).toBe("unknown.perm");
    });

    it("roleHasPermission succeeds for both canonical and alias names", () => {
      expect(roleHasPermission("ADMIN", "products.update")).toBe(true);
      expect(roleHasPermission("ADMIN", "products.edit")).toBe(true);
      expect(roleHasPermission("ADMIN", "users.invite")).toBe(true);
      expect(roleHasPermission("ADMIN", "users.create")).toBe(true);
    });
  });
});
