import { describe, it, expect } from 'vitest';
import { addMoney, subtractMoney, toMoneyDecimal } from './money';
import { SalesListQuerySchema, DailyManualRecordInputSchema, SaleStatusUpdateSchema } from '@/schemas';

/**
 * Critical money invariants used when recording sales / ledger updates.
 */
describe('sale payment money invariants', () => {
  it('due amount is total minus paid (never negative when paid >= total)', () => {
    const total = toMoneyDecimal(150.5);
    const paid = toMoneyDecimal(150.5);
    const due = subtractMoney(total, paid);
    expect(due.toNumber()).toBe(0);
  });

  it('partial payment leaves correct due remainder', () => {
    const total = toMoneyDecimal(100);
    const paid = toMoneyDecimal(40);
    const due = subtractMoney(total, paid);
    expect(due.toNumber()).toBe(60);
  });

  it('external paid excludes prepaid portion of amountPaid', () => {
    const amountPaid = toMoneyDecimal(80);
    const prepaidUsed = toMoneyDecimal(30);
    const external = subtractMoney(amountPaid, prepaidUsed);
    expect(external.toNumber()).toBe(50);
  });

  it('subtotal + tax - discount matches expected total path', () => {
    const subtotal = addMoney(10, 20, 30); // 60
    const discount = toMoneyDecimal(5);
    const tax = toMoneyDecimal(2);
    const total = addMoney(subtractMoney(subtotal, discount), tax);
    expect(total.toNumber()).toBe(57);
  });

  it('rejects overpayment amountPaid > total at comparison level', () => {
    const total = toMoneyDecimal(100);
    const amountPaid = toMoneyDecimal(100.01);
    expect(amountPaid.gt(total)).toBe(true);
  });
});

describe('SalesListQuerySchema', () => {
  it('accepts valid list query and applies defaults', () => {
    const result = SalesListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects oversized invoice search strings', () => {
    const result = SalesListQuerySchema.safeParse({
      invoiceNumber: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status values', () => {
    const result = SalesListQuerySchema.safeParse({ status: 'Hacked' });
    expect(result.success).toBe(false);
  });

  it('caps limit at 100', () => {
    const result = SalesListQuerySchema.safeParse({ limit: 500 });
    expect(result.success).toBe(false);
  });
});

describe('DailyManualRecordInputSchema', () => {
  it('requires yyyy-MM-dd date keys', () => {
    expect(DailyManualRecordInputSchema.safeParse({ date: '2026-07-18' }).success).toBe(true);
    expect(DailyManualRecordInputSchema.safeParse({ date: '18/07/2026' }).success).toBe(false);
    expect(DailyManualRecordInputSchema.safeParse({ date: 'not-a-date' }).success).toBe(false);
  });
});

describe('SaleStatusUpdateSchema', () => {
  it('only allows Cancelled or Refunded', () => {
    expect(
      SaleStatusUpdateSchema.safeParse({ id: 's1', status: 'Cancelled' }).success,
    ).toBe(true);
    expect(
      SaleStatusUpdateSchema.safeParse({ id: 's1', status: 'Completed' }).success,
    ).toBe(false);
  });
});
