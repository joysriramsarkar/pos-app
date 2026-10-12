import { describe, expect, it } from "vitest";
import { canClaimLease } from "@/lib/offline/indexeddb";

describe("OFF-002/H15 lease decision (pure, no IndexedDB needed)", () => {
  const base = { synced: false, failed: false } as const;

  it("claims unleased items", () => {
    expect(canClaimLease({ ...base }, "tab-a", 1000)).toBe(true);
  });

  it("re-enters its own lease", () => {
    expect(
      canClaimLease({ ...base, leaseOwner: "tab-a", leaseExpiresAt: new Date(9999) }, "tab-a", 1000)
    ).toBe(true);
  });

  it("blocks other owners while the lease is live", () => {
    expect(
      canClaimLease({ ...base, leaseOwner: "tab-a", leaseExpiresAt: new Date(9999) }, "tab-b", 1000)
    ).toBe(false);
  });

  it("allows takeover after expiry", () => {
    expect(
      canClaimLease({ ...base, leaseOwner: "tab-a", leaseExpiresAt: new Date(500) }, "tab-b", 1000)
    ).toBe(true);
  });

  it("never claims synced/failed/missing items", () => {
    expect(canClaimLease(null, "tab-a")).toBe(false);
    expect(canClaimLease(undefined, "tab-a")).toBe(false);
    expect(canClaimLease({ ...base, synced: true }, "tab-a")).toBe(false);
    expect(canClaimLease({ ...base, failed: true }, "tab-a")).toBe(false);
  });
});
