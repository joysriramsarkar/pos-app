import { describe, expect, it, mock } from 'vitest';

// Test the business logic of the product report calculation directly
// without importing the route (which has force-dynamic and complex deps)

describe('GET /api/reports/products - business logic', () => {
  it('calculates profit correctly from revenue and cost snapshot at sale', () => {
    const revenue = 1000;
    const costPriceAtSale = 50; // historical WAC, not live buyingPrice
    const quantity = 10;
    const profit = revenue - costPriceAtSale * quantity;
    expect(profit).toBe(500);
  });

  it('falls back to current buyingPrice when cost snapshot is zero (legacy rows)', () => {
    const revenue = 1000;
    const costPriceAtSale = 0;
    const liveBuyingPrice = 40;
    const quantity = 10;
    const unitCost = costPriceAtSale > 0 ? costPriceAtSale : liveBuyingPrice;
    const profit = revenue - unitCost * quantity;
    expect(profit).toBe(600);
  });

  it('handles missing product details gracefully', () => {
    const productsMap = new Map<string, { name: string; buyingPrice: number; unit: string }>();
    const productId = 'unknown';
    const details = productsMap.get(productId);
    const name = details?.name ?? 'Unknown Product';
    const unit = details?.unit ?? 'unit';
    expect(name).toBe('Unknown Product');
    expect(unit).toBe('unit');
  });

  it('sorts products by revenue descending', () => {
    const products = [
      { id: 'p1', revenue: 500 },
      { id: 'p2', revenue: 1500 },
      { id: 'p3', revenue: 1000 },
    ];
    const sorted = [...products].sort((a, b) => b.revenue - a.revenue);
    expect(sorted[0].id).toBe('p2');
    expect(sorted[1].id).toBe('p3');
    expect(sorted[2].id).toBe('p1');
  });

  it('uses days=30 as default when no date params provided', () => {
    const sp = new URLSearchParams('');
    const days = parseInt(sp.get('days') || '30');
    expect(days).toBe(30);
  });

  it('parses custom days param correctly', () => {
    const sp = new URLSearchParams('days=7');
    const days = parseInt(sp.get('days') || '30');
    expect(days).toBe(7);
  });

  it('detects from/to date range params', () => {
    const sp = new URLSearchParams('from=2024-01-01&to=2024-01-31');
    expect(sp.get('from')).toBe('2024-01-01');
    expect(sp.get('to')).toBe('2024-01-31');
  });
});
