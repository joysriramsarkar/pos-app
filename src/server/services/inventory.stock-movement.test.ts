/**
 * P1-D: canonical stock movement rules, tested without a database.
 * The fake `tx` implements only what `applyStockMovementTx` touches, so these
 * assertions cover the money/inventory logic (underflow, WAC, change type)
 * that used to drift between the sync route and the inventory service.
 */
import { describe, expect, it } from "vitest";
import { applyStockMovementTx } from "@/server/services/inventory.service";
import { ERROR_CODES } from "@/lib/domain-errors";

type Row = { id: string; currentStock: number; buyingPrice: number };

function makeTx(initial: { stock: number; buyingPrice: number; missing?: boolean }) {
  const state = { stock: initial.stock, buyingPrice: initial.buyingPrice };
  const history: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];

  const tx = {
    $queryRaw: async () =>
      initial.missing
        ? []
        : [{ id: "p1", currentStock: state.stock, buyingPrice: state.buyingPrice }],
    product: {
      findUnique: async () => ({ currentStock: state.stock, buyingPrice: state.buyingPrice }),
      update: async ({ data }: { data: any }) => {
        const increment =
          typeof data.currentStock === "object" ? data.currentStock.increment : data.currentStock;
        state.stock += Number(increment ?? 0);
        if (data.buyingPrice !== undefined) state.buyingPrice = Number(data.buyingPrice);
        return { currentStock: state.stock, buyingPrice: state.buyingPrice };
      },
    },
    stockHistory: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        history.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
  };

  return { tx, state, history, audit };
}

const base = { businessId: "b1", productId: "p1" };

describe("P1-D applyStockMovementTx", () => {
  it("rejects an underflow instead of silently doing nothing", async () => {
    const { tx, state, history } = makeTx({ stock: 3, buyingPrice: 10 });

    await expect(
      applyStockMovementTx(tx as any, { ...base, quantityChange: -5 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INSUFFICIENT_STOCK });

    expect(state.stock).toBe(3);
    expect(history).toHaveLength(0);
  });

  it("rejects a zero / non-finite quantity", async () => {
    const { tx } = makeTx({ stock: 3, buyingPrice: 10 });
    await expect(
      applyStockMovementTx(tx as any, { ...base, quantityChange: 0 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_INPUT });
    await expect(
      applyStockMovementTx(tx as any, { ...base, quantityChange: Number.POSITIVE_INFINITY }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_INPUT });
  });

  it("updates WAC and labels a costed receipt as PURCHASE", async () => {
    const { tx, state, history, audit } = makeTx({ stock: 10, buyingPrice: 10 });

    const result = await applyStockMovementTx(tx as any, {
      ...base,
      quantityChange: 10,
      unitCost: 20,
    });

    // (10×10 + 10×20) / 20 = 15
    expect(result.changeType).toBe("PURCHASE");
    expect(state.stock).toBe(20);
    expect(state.buyingPrice).toBe(15);
    expect(history[0].changeType).toBe("PURCHASE");
    expect(history[0].quantity).toBe(10);
    expect(audit[0].action).toBe("STOCK_ENTRY_CREATED");
  });

  it("does not fake a purchase when no unit cost is supplied", async () => {
    const { tx, state, history, audit } = makeTx({ stock: 4, buyingPrice: 12 });

    const result = await applyStockMovementTx(tx as any, {
      ...base,
      quantityChange: 6,
      reason: "Offline sync stock movement",
    });

    expect(result.changeType).toBe("ADJUSTMENT");
    expect(state.stock).toBe(10);
    expect(state.buyingPrice).toBe(12);
    expect(history[0].changeType).toBe("ADJUSTMENT");
    expect(audit[0].action).toBe("STOCK_ADJUSTED");
  });

  it("labels an outflow as ADJUSTMENT and records the negative quantity", async () => {
    const { tx, state, history } = makeTx({ stock: 5, buyingPrice: 8 });

    const result = await applyStockMovementTx(tx as any, {
      ...base,
      quantityChange: -2,
    });

    expect(result.changeType).toBe("ADJUSTMENT");
    expect(state.stock).toBe(3);
    expect(history[0].quantity).toBe(-2);
  });

  it("handles negative server stock as zero available", async () => {
    const { tx } = makeTx({ stock: -4, buyingPrice: 8 });
    await expect(
      applyStockMovementTx(tx as any, { ...base, quantityChange: -1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INSUFFICIENT_STOCK });
  });

  it("fails loudly when the product is not in this business", async () => {
    const { tx } = makeTx({ stock: 5, buyingPrice: 8, missing: true });
    await expect(
      applyStockMovementTx(tx as any, { ...base, quantityChange: 1, unitCost: 9 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRODUCT_NOT_FOUND });
  });
});
