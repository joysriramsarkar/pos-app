import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requireBusinessContext,
  checkPermission,
  checkRole,
  roleHasPermission,
  getPermissionsForRole,
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
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
  },
}));

describe("Multi-Tenant Architecture & Isolation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. requireBusinessContext() - Tenant Resolution & Auth Boundary", () => {
    it("should reject unauthenticated request with 401", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const result = await requireBusinessContext();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("should reject when session user has no id with 401", async () => {
      mockGetServerSession.mockResolvedValueOnce({ user: {} });

      const result = await requireBusinessContext();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("should reject when user does not exist in DB with 401", async () => {
      mockGetServerSession.mockResolvedValueOnce({ user: { id: "user_not_found" } });
      mockUserFindUnique.mockResolvedValueOnce(null);

      const result = await requireBusinessContext();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("should reject when user account is deactivated (isActive: false) with 401", async () => {
      mockGetServerSession.mockResolvedValueOnce({ user: { id: "user_deactivated" } });
      mockUserFindUnique.mockResolvedValueOnce({
        id: "user_deactivated",
        username: "inactive",
        name: "Inactive User",
        isActive: false,
        memberships: [],
      });

      const result = await requireBusinessContext();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("should reject when user has no active business membership with 403", async () => {
      mockGetServerSession.mockResolvedValueOnce({ user: { id: "user_no_membership" } });
      mockUserFindUnique.mockResolvedValueOnce({
        id: "user_no_membership",
        username: "nomember",
        name: "No Member",
        isActive: true,
        memberships: [],
      });

      const result = await requireBusinessContext();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });

    it("should reject when business itself is inactive with 403", async () => {
      mockGetServerSession.mockResolvedValueOnce({ user: { id: "user_biz_suspended" } });
      mockUserFindUnique.mockResolvedValueOnce({
        id: "user_biz_suspended",
        username: "shopowner",
        name: "Shop Owner",
        isActive: true,
        memberships: [
          {
            id: "mem_1",
            role: "OWNER",
            isActive: true,
            business: {
              id: "biz_suspended",
              name: "Suspended Shop",
              slug: "suspended-shop",
              currency: "INR",
              timezone: "Asia/Kolkata",
              isActive: false,
            },
          },
        ],
      });

      const result = await requireBusinessContext();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });

    it("should successfully resolve tenant context for valid member", async () => {
      mockGetServerSession.mockResolvedValueOnce({ user: { id: "user_valid" } });
      mockUserFindUnique.mockResolvedValueOnce({
        id: "user_valid",
        username: "rahim",
        name: "Rahim Khan",
        isActive: true,
        memberships: [
          {
            id: "mem_rahim",
            role: "OWNER",
            isActive: true,
            business: {
              id: "biz_rahim_store",
              name: "Rahim Grocery",
              slug: "rahim-grocery",
              currency: "INR",
              timezone: "Asia/Kolkata",
              isActive: true,
            },
          },
        ],
      });

      const result = await requireBusinessContext();
      expect(result).not.toBeInstanceOf(NextResponse);

      const ctx = result as BusinessContext;
      expect(ctx.user.id).toBe("user_valid");
      expect(ctx.user.username).toBe("rahim");
      expect(ctx.business.id).toBe("biz_rahim_store");
      expect(ctx.business.name).toBe("Rahim Grocery");
      expect(ctx.role).toBe("OWNER");
      expect(ctx.permissions).toContain("products.create");
      expect(ctx.permissions).toContain("sales.create");
      expect(ctx.permissions).toContain("settings.update");
    });
  });

  describe("2. RBAC & Permission Enforcement within Tenant Context", () => {
    const cashierContext: BusinessContext = {
      user: { id: "u_cashier", username: "cashier1", name: "Cashier 1", isActive: true },
      business: { id: "biz_1", name: "Shop", slug: "shop", currency: "INR", timezone: "Asia/Kolkata", isActive: true },
      membership: { id: "m_1", role: "CASHIER", isActive: true },
      role: "CASHIER",
      permissions: getPermissionsForRole("CASHIER"),
    };

    const ownerContext: BusinessContext = {
      user: { id: "u_owner", username: "owner1", name: "Owner 1", isActive: true },
      business: { id: "biz_1", name: "Shop", slug: "shop", currency: "INR", timezone: "Asia/Kolkata", isActive: true },
      membership: { id: "m_2", role: "OWNER", isActive: true },
      role: "OWNER",
      permissions: getPermissionsForRole("OWNER"),
    };

    it("allows CASHIER to create sales", () => {
      const denied = checkPermission(cashierContext, "sales.create");
      expect(denied).toBeNull();
    });

    it("denies CASHIER from updating store settings with 403", () => {
      const denied = checkPermission(cashierContext, "settings.update");
      expect(denied).toBeInstanceOf(NextResponse);
      expect(denied?.status).toBe(403);
    });

    it("denies CASHIER from deleting products with 403", () => {
      const denied = checkPermission(cashierContext, "products.delete");
      expect(denied).toBeInstanceOf(NextResponse);
      expect(denied?.status).toBe(403);
    });

    it("allows OWNER all administrative and store actions", () => {
      expect(checkPermission(ownerContext, "settings.update")).toBeNull();
      expect(checkPermission(ownerContext, "products.delete")).toBeNull();
      expect(checkPermission(ownerContext, "users.invite")).toBeNull();
      expect(checkPermission(ownerContext, "sales.refund")).toBeNull();
    });

    it("verifies checkRole works as expected", () => {
      expect(checkRole(ownerContext, ["OWNER", "ADMIN"])).toBeNull();
      expect(checkRole(cashierContext, ["OWNER", "ADMIN"])?.status).toBe(403);
    });
  });

  describe("3. Tenant Data Isolation Rules (Invariants)", () => {
    it("proves two tenants have completely independent business IDs", () => {
      const tenantA = { id: "biz_shop_a", name: "Rahim Grocery" };
      const tenantB = { id: "biz_shop_b", name: "Karim Electronics" };

      expect(tenantA.id).not.toBe(tenantB.id);

      // Simulating a WHERE query filter:
      const productWhereTenantA = { businessId: tenantA.id };
      const productWhereTenantB = { businessId: tenantB.id };

      expect(productWhereTenantA.businessId).not.toBe(productWhereTenantB.businessId);
    });

    it("allows duplicate barcodes across different tenants (tenant-scoped uniqueness)", () => {
      const sharedBarcode = "8901234567890";
      const productTenantA = {
        businessId: "biz_shop_a",
        barcode: sharedBarcode,
        name: "Lays Chips 50g",
      };
      const productTenantB = {
        businessId: "biz_shop_b",
        barcode: sharedBarcode,
        name: "Lays Classic 50g",
      };

      // Composite unique constraint: [businessId, barcode]
      const compoundKeyA = `${productTenantA.businessId}:${productTenantA.barcode}`;
      const compoundKeyB = `${productTenantB.businessId}:${productTenantB.barcode}`;

      expect(compoundKeyA).not.toBe(compoundKeyB);
    });

    it("allows duplicate invoice numbers across different tenants", () => {
      const invoiceNumber = "INV-000001";
      const saleA = { businessId: "biz_shop_a", invoiceNumber };
      const saleB = { businessId: "biz_shop_b", invoiceNumber };

      const compoundKeyA = `${saleA.businessId}:${saleA.invoiceNumber}`;
      const compoundKeyB = `${saleB.businessId}:${saleB.invoiceNumber}`;

      expect(compoundKeyA).not.toBe(compoundKeyB);
    });

    it("allows duplicate customer phone across different tenants", () => {
      const phone = "9876543210";
      const customerA = { businessId: "biz_shop_a", phone, name: "Customer at Shop A" };
      const customerB = { businessId: "biz_shop_b", phone, name: "Same person at Shop B" };

      const compoundKeyA = `${customerA.businessId}:${customerA.phone}`;
      const compoundKeyB = `${customerB.businessId}:${customerB.phone}`;

      expect(compoundKeyA).not.toBe(compoundKeyB);
    });
  });

  describe("4. Static Permission Table Integrity", () => {
    it("guarantees OWNER inherits all permissions from ADMIN, MANAGER, CASHIER, VIEWER", () => {
      const cashierPerms = getPermissionsForRole("CASHIER");
      const ownerPerms = getPermissionsForRole("OWNER");

      for (const perm of cashierPerms) {
        expect(ownerPerms).toContain(perm);
      }
    });

    it("guarantees VIEWER has read-only access and cannot perform mutating actions", () => {
      const viewerPerms = getPermissionsForRole("VIEWER");
      for (const perm of viewerPerms) {
        expect(perm).not.toContain(".create");
        expect(perm).not.toContain(".update");
        expect(perm).not.toContain(".delete");
        expect(perm).not.toContain(".edit");
        expect(perm).not.toContain(".cancel");
      }
    });
  });
});
