/**
 * Regression guard for the mixed-payment failure: the expense form sends
 * "Mixed" / "Cash" while the Prisma enum only accepts upper-case members.
 */
import { describe, expect, it } from 'vitest';
import {
  toExpensePaymentMethod,
  toExpensePaymentUi,
} from './expense-payment';

describe('expense payment method conversion', () => {
  it('maps form labels to enum members', () => {
    expect(toExpensePaymentMethod('Mixed')).toBe('MIXED');
    expect(toExpensePaymentMethod('mixed')).toBe('MIXED');
    expect(toExpensePaymentMethod('Cash')).toBe('CASH');
    expect(toExpensePaymentMethod('UPI')).toBe('UPI');
  });

  it('keeps already-normalised values', () => {
    expect(toExpensePaymentMethod('MIXED')).toBe('MIXED');
    expect(toExpensePaymentMethod('CASH')).toBe('CASH');
  });

  it('falls back to OTHER for unknown or missing values', () => {
    expect(toExpensePaymentMethod(null)).toBe('OTHER');
    expect(toExpensePaymentMethod('')).toBe('OTHER');
    expect(toExpensePaymentMethod('cheque')).toBe('CHEQUE');
  });

  it('maps enum members back to form labels', () => {
    expect(toExpensePaymentUi('MIXED')).toBe('Mixed');
    expect(toExpensePaymentUi('CASH')).toBe('Cash');
    expect(toExpensePaymentUi('UPI')).toBe('UPI');
    expect(toExpensePaymentUi(null)).toBe('Cash');
  });
});
