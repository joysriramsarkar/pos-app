import { describe, it, expect } from 'vitest';
import { planSaleStockUsage } from './sale-stock';

describe('planSaleStockUsage', () => {
  it('uses full WAC when stock covers the sale', () => {
    const plan = planSaleStockUsage({
      productId: 'p1',
      productName: 'Rice',
      requiredQty: 5,
      stockBefore: 10,
      wacUnitCost: 40,
    });
    expect(plan.ownedQty).toBe(5);
    expect(plan.shortageQty).toBe(0);
    expect(plan.blendedUnitCost).toBe(40);
  });

  it('blends cost when part of qty is auto-adjusted', () => {
    // 3 owned @ 40, 2 shortage @ 0 → blended 24
    const plan = planSaleStockUsage({
      productId: 'p1',
      productName: 'Rice',
      requiredQty: 5,
      stockBefore: 3,
      wacUnitCost: 40,
    });
    expect(plan.ownedQty).toBe(3);
    expect(plan.shortageQty).toBe(2);
    expect(plan.blendedUnitCost).toBe(24);
  });

  it('treats zero stock as fully phantom (zero COGS)', () => {
    const plan = planSaleStockUsage({
      productId: 'p1',
      productName: 'Oil',
      requiredQty: 2,
      stockBefore: 0,
      wacUnitCost: 100,
    });
    expect(plan.ownedQty).toBe(0);
    expect(plan.shortageQty).toBe(2);
    expect(plan.blendedUnitCost).toBe(0);
  });

  it('treats negative stock as zero owned and full shortage', () => {
    const plan = planSaleStockUsage({
      productId: 'p1',
      productName: 'Soap',
      requiredQty: 4,
      stockBefore: -2,
      wacUnitCost: 10,
    });
    expect(plan.ownedQty).toBe(0);
    expect(plan.shortageQty).toBe(4);
    expect(plan.blendedUnitCost).toBe(0);
    // apply path uses gap = required - stockBefore = 6 to reach 0 after sale
    expect(plan.requiredQty - plan.stockBefore).toBe(6);
  });

  it('exact stock match has no shortage', () => {
    const plan = planSaleStockUsage({
      productId: 'p1',
      productName: 'Tea',
      requiredQty: 7,
      stockBefore: 7,
      wacUnitCost: 12,
    });
    expect(plan.shortageQty).toBe(0);
    expect(plan.ownedQty).toBe(7);
    expect(plan.blendedUnitCost).toBe(12);
  });
});
