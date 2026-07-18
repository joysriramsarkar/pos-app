import { describe, it, expect } from 'vitest';
import { aggregateSaleItemQuantities, findSaleItemTotalMismatch } from './sale-calculations';

describe('aggregateSaleItemQuantities', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateSaleItemQuantities([])).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const result = aggregateSaleItemQuantities([{ productId: 'p1', quantity: 3 }]);
    expect(result).toEqual([{ productId: 'p1', quantity: 3 }]);
  });

  it('aggregates duplicate productIds', () => {
    const items = [
      { productId: 'p1', quantity: 2 },
      { productId: 'p1', quantity: 3 },
    ];
    const result = aggregateSaleItemQuantities(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ productId: 'p1', quantity: 5 });
  });

  it('keeps distinct productIds separate', () => {
    const items = [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 4 },
    ];
    const result = aggregateSaleItemQuantities(items);
    expect(result).toHaveLength(2);
    const p1 = result.find(r => r.productId === 'p1');
    const p2 = result.find(r => r.productId === 'p2');
    expect(p1?.quantity).toBe(2);
    expect(p2?.quantity).toBe(4);
  });

  it('handles decimal quantities with precision', () => {
    const items = [
      { productId: 'p1', quantity: 0.1 },
      { productId: 'p1', quantity: 0.2 },
    ];
    const result = aggregateSaleItemQuantities(items);
    expect(result[0].quantity).toBe(0.3);
  });

  it('handles mixed products with duplicates', () => {
    const items = [
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 2 },
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 4 },
    ];
    const result = aggregateSaleItemQuantities(items);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.productId === 'p1')?.quantity).toBe(4);
    expect(result.find(r => r.productId === 'p2')?.quantity).toBe(6);
  });
});

describe('findSaleItemTotalMismatch', () => {
  it('returns null when all totals are correct', () => {
    const items = [
      { productId: 'p1', productName: 'Item A', quantity: 2, unitPrice: 50, totalPrice: 100 },
      { productId: 'p2', productName: 'Item B', quantity: 3, unitPrice: 10, totalPrice: 30 },
    ];
    expect(findSaleItemTotalMismatch(items)).toBeNull();
  });

  it('returns error message when total is wrong', () => {
    const items = [
      { productId: 'p1', productName: 'Item A', quantity: 2, unitPrice: 50, totalPrice: 99 },
    ];
    const result = findSaleItemTotalMismatch(items);
    expect(result).not.toBeNull();
    expect(result).toContain('Item A');
    expect(result).toContain('100.00');
  });

  it('returns null for empty items array', () => {
    expect(findSaleItemTotalMismatch([])).toBeNull();
  });

  it('uses productId in message when productName is missing', () => {
    const items = [
      { productId: 'p1', productName: '', quantity: 2, unitPrice: 50, totalPrice: 99 },
    ];
    const result = findSaleItemTotalMismatch(items);
    expect(result).toContain('p1');
  });

  it('handles decimal quantities and prices correctly', () => {
    const items = [
      { productId: 'p1', productName: 'Item', quantity: 1.5, unitPrice: 10, totalPrice: 15 },
    ];
    expect(findSaleItemTotalMismatch(items)).toBeNull();
  });

  it('detects mismatch on second item', () => {
    const items = [
      { productId: 'p1', productName: 'Item A', quantity: 2, unitPrice: 50, totalPrice: 100 },
      { productId: 'p2', productName: 'Item B', quantity: 3, unitPrice: 10, totalPrice: 25 },
    ];
    const result = findSaleItemTotalMismatch(items);
    expect(result).toContain('Item B');
  });
});
