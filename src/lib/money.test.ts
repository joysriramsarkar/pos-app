import { describe, it, expect } from 'bun:test';
import { toMoneyNumber, addMoney, subtractMoney, multiplyMoney } from './money';

describe('toMoneyNumber', () => {
  it('rounds to 2 decimal places with ROUND_HALF_UP', () => {
    expect(toMoneyNumber(1.005)).toBe(1.01);
    expect(toMoneyNumber(1.004)).toBe(1.00);
    expect(toMoneyNumber(2.555)).toBe(2.56);
  });

  it('handles zero and falsy values', () => {
    expect(toMoneyNumber(0)).toBe(0);
    expect(toMoneyNumber(null as any)).toBe(0);
    expect(toMoneyNumber(undefined as any)).toBe(0);
  });

  it('handles string numbers', () => {
    expect(toMoneyNumber('10.5')).toBe(10.5);
    expect(toMoneyNumber('0.001')).toBe(0.00);
  });

  it('handles large numbers', () => {
    expect(toMoneyNumber(999999.999)).toBe(1000000.00);
  });
});

describe('addMoney', () => {
  it('adds two values correctly', () => {
    expect(addMoney(1.1, 2.2).toNumber()).toBe(3.3);
  });

  it('adds multiple values', () => {
    expect(addMoney(10, 20, 30).toNumber()).toBe(60);
  });

  it('handles floating point precision', () => {
    expect(addMoney(0.1, 0.2).toNumber()).toBe(0.3);
  });

  it('handles zero values', () => {
    expect(addMoney(0, 0).toNumber()).toBe(0);
    expect(addMoney(5, 0).toNumber()).toBe(5);
  });

  it('handles falsy values as zero', () => {
    expect(addMoney(5, null as any).toNumber()).toBe(5);
    expect(addMoney(5, undefined as any).toNumber()).toBe(5);
  });

  it('handles single value', () => {
    expect(addMoney(42.5).toNumber()).toBe(42.5);
  });
});

describe('subtractMoney', () => {
  it('subtracts one value', () => {
    expect(subtractMoney(10, 3).toNumber()).toBe(7);
  });

  it('subtracts multiple values', () => {
    expect(subtractMoney(100, 10, 20, 30).toNumber()).toBe(40);
  });

  it('handles floating point precision', () => {
    expect(subtractMoney(0.3, 0.1).toNumber()).toBe(0.2);
  });

  it('handles zero subtractors', () => {
    expect(subtractMoney(5, 0).toNumber()).toBe(5);
  });

  it('handles falsy subtractors as zero', () => {
    expect(subtractMoney(5, null as any).toNumber()).toBe(5);
  });

  it('can produce negative result', () => {
    expect(subtractMoney(5, 10).toNumber()).toBe(-5);
  });
});

describe('multiplyMoney', () => {
  it('multiplies two values', () => {
    expect(multiplyMoney(3, 4).toNumber()).toBe(12);
  });

  it('handles decimal multiplication', () => {
    expect(multiplyMoney(2.5, 4).toNumber()).toBe(10);
    expect(multiplyMoney(1.1, 3).toNumber()).toBe(3.3);
  });

  it('handles zero', () => {
    expect(multiplyMoney(0, 100).toNumber()).toBe(0);
    expect(multiplyMoney(100, 0).toNumber()).toBe(0);
  });

  it('handles falsy values as zero', () => {
    expect(multiplyMoney(null as any, 5).toNumber()).toBe(0);
    expect(multiplyMoney(5, null as any).toNumber()).toBe(0);
  });

  it('rounds result to 2 decimal places', () => {
    expect(multiplyMoney(1.005, 1).toNumber()).toBe(1.01);
    expect(multiplyMoney(3, 0.333).toNumber()).toBe(1.00);
  });
});
