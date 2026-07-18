import { describe, expect, it } from 'vitest';
import {
  buildProfitInsights,
  finalizeAgg,
  emptyProfitAgg,
  addLineProfit,
  sortProfitRows,
  marginPercent,
  resolveUnitCost,
} from '@/lib/report-profit';

describe('/api/reports/profit domain logic', () => {
  it('order-level profit = invoice revenue − item costs', () => {
    const revenue = 500;
    const live = new Map([['a', 40], ['b', 10]]);
    const cost =
      resolveUnitCost('a', 50, live) * 2 +
      resolveUnitCost('b', 0, live) * 5;
    // 50*2 + 10*5 = 150
    expect(cost).toBe(150);
    expect(revenue - cost).toBe(350);
    expect(marginPercent(revenue, revenue - cost)).toBe(70);
  });

  it('customer aggregation rolls up multiple orders', () => {
    const agg = emptyProfitAgg();
    // order 1: rev 100 cost 40
    addLineProfit(agg, { revenue: 100, unitCost: 20, quantity: 2, saleId: 'o1' });
    // order 2: rev 200 cost 50
    addLineProfit(agg, { revenue: 200, unitCost: 25, quantity: 2, saleId: 'o2' });
    const fin = finalizeAgg(agg);
    expect(fin.revenue).toBe(300);
    expect(fin.cost).toBe(90);
    expect(fin.profit).toBe(210);
    expect(fin.orderCount).toBe(2);
  });

  it('sorts profit rows with loss makers last when sorting by profit', () => {
    const rows = [
      { name: 'loss', profit: -10, revenue: 50, margin: -20 },
      { name: 'win', profit: 80, revenue: 100, margin: 80 },
      { name: 'mid', profit: 20, revenue: 100, margin: 20 },
    ];
    const sorted = sortProfitRows(rows, 'profit');
    expect(sorted.map((r) => r.name)).toEqual(['win', 'mid', 'loss']);
  });

  it('insights count negative profit rows', () => {
    const insights = buildProfitInsights([
      { name: 'A', profit: 10, margin: 10, revenue: 100 },
      { name: 'B', profit: -5, margin: -5, revenue: 100 },
      { name: 'C', profit: -1, margin: -1, revenue: 50 },
    ]);
    expect(insights.lossMakers).toBe(2);
    expect(insights.topByProfit?.name).toBe('A');
  });
});
