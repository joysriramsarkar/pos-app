import { describe, expect, it } from "vitest";
import {
  addLineProfit,
  buildProfitInsights,
  emptyProfitAgg,
  finalizeAgg,
  marginPercent,
  resolveUnitCost,
  sortProfitRows,
} from "./report-profit";

describe("report-profit helpers", () => {
  it("prefers cost snapshot over live buying price", () => {
    const live = new Map([["p1", 80]]);
    expect(resolveUnitCost("p1", 50, live)).toBe(50);
    expect(resolveUnitCost("p1", 0, live)).toBe(80);
    expect(resolveUnitCost("missing", 0, live)).toBe(0);
  });

  it("aggregates line profit and margin", () => {
    const agg = emptyProfitAgg();
    addLineProfit(agg, { revenue: 100, unitCost: 40, quantity: 2, saleId: "s1" });
    addLineProfit(agg, { revenue: 50, unitCost: 10, quantity: 1, saleId: "s1" });
    const fin = finalizeAgg(agg);
    expect(fin.revenue).toBe(150);
    expect(fin.cost).toBe(90);
    expect(fin.profit).toBe(60);
    expect(fin.orderCount).toBe(1);
    expect(fin.margin).toBe(40);
  });

  it("sorts by profit, revenue, margin", () => {
    const rows = [
      { name: "a", profit: 10, revenue: 100, margin: 10 },
      { name: "b", profit: 50, revenue: 80, margin: 62.5 },
      { name: "c", profit: 20, revenue: 200, margin: 10 },
    ];
    expect(sortProfitRows(rows, "profit")[0].name).toBe("b");
    expect(sortProfitRows(rows, "revenue")[0].name).toBe("c");
    expect(sortProfitRows(rows, "margin")[0].name).toBe("b");
  });

  it("builds insights including loss makers", () => {
    const insights = buildProfitInsights([
      { name: "Good", profit: 100, margin: 40, revenue: 250 },
      { name: "Thin", profit: 5, margin: 2, revenue: 250 },
      { name: "Loss", profit: -20, margin: -10, revenue: 200 },
    ]);
    expect(insights.topByProfit?.name).toBe("Good");
    expect(insights.lowestMargin?.name).toBe("Loss");
    expect(insights.lossMakers).toBe(1);
  });

  it("marginPercent is 0 when revenue is 0", () => {
    expect(marginPercent(0, 0)).toBe(0);
    expect(marginPercent(100, 25)).toBe(25);
  });
});
