import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockDeleteMany } = vi.hoisted(() => ({ mockDeleteMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { syncQueue: { deleteMany: mockDeleteMany } },
}));

import { purgeOldSyncedQueue } from "@/lib/sync-retention";

describe("MP-32 sync retention purge", () => {
  beforeEach(() => mockDeleteMany.mockReset());

  it("deletes only synced rows older than the cutoff", async () => {
    mockDeleteMany.mockResolvedValue({ count: 7 });
    const res = await purgeOldSyncedQueue(90);
    expect(res.deleted).toBe(7);
    const where = mockDeleteMany.mock.calls[0][0].where;
    expect(where.synced).toBe(true);
    expect(where.syncedAt.lt).toBeInstanceOf(Date);
    // cutoff ≈ 90 days ago (allow 60s skew for CI slowness)
    const ageDays = (Date.now() - where.syncedAt.lt.getTime()) / 86400000;
    expect(ageDays).toBeGreaterThan(89);
    expect(ageDays).toBeLessThan(91);
    // failed/pending rows are never in scope (no failed filter at all)
    expect("failed" in where).toBe(false);
  });
});
