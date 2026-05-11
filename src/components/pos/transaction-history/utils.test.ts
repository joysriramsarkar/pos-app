import { expect, test, describe } from 'bun:test';
import { formatPrice, getPaymentStatusColor, getStatusColor } from './utils';

describe('transaction-history utils', () => {
  describe('formatPrice', () => {
    test('formats whole numbers correctly', () => {
      // Different systems might format currencies with spaces (e.g. ₹ 100 vs ₹100 or narrow non-breaking space).
      // To make it robust, we can strip out non-breaking spaces or just check structure.
      const formatted = formatPrice(100);
      expect(formatted).toMatch(/₹\s*100/);
    });

    test('formats decimals up to 2 decimal places', () => {
      expect(formatPrice(100.5)).toMatch(/₹\s*100\.5/);
      expect(formatPrice(100.55)).toMatch(/₹\s*100\.55/);
      expect(formatPrice(100.555)).toMatch(/₹\s*100\.56/); // Testing rounding
    });

    test('formats zero correctly', () => {
      expect(formatPrice(0)).toMatch(/₹\s*0/);
    });

    test('formats large numbers with Indian comma formatting', () => {
      // 10 lakhs -> 10,00,000
      expect(formatPrice(1000000)).toMatch(/₹\s*10,00,000/);
    });
  });

  describe('getPaymentStatusColor', () => {
    test('returns correct color for Paid', () => {
      expect(getPaymentStatusColor('Paid')).toContain('bg-green-100');
    });

    test('returns correct color for Partial', () => {
      expect(getPaymentStatusColor('Partial')).toContain('bg-yellow-100');
    });

    test('returns correct color for Due', () => {
      expect(getPaymentStatusColor('Due')).toContain('bg-red-100');
    });

    test('handles case insensitivity', () => {
      expect(getPaymentStatusColor('paid')).toContain('bg-green-100');
      expect(getPaymentStatusColor('PAID')).toContain('bg-green-100');
      expect(getPaymentStatusColor('PaRtIaL')).toContain('bg-yellow-100');
    });

    test('handles undefined, null, and empty string', () => {
      expect(getPaymentStatusColor(undefined)).toContain('bg-gray-100');
      expect(getPaymentStatusColor(null)).toContain('bg-gray-100');
      expect(getPaymentStatusColor('')).toContain('bg-gray-100');
    });

    test('returns default color for unknown status', () => {
      expect(getPaymentStatusColor('Unknown')).toContain('bg-gray-100');
    });
  });

  describe('getStatusColor', () => {
    test('returns correct color for Completed', () => {
      expect(getStatusColor('Completed')).toContain('bg-blue-100');
    });

    test('returns correct color for Cancelled', () => {
      expect(getStatusColor('Cancelled')).toContain('bg-red-100');
    });

    test('returns correct color for Refunded', () => {
      expect(getStatusColor('Refunded')).toContain('bg-orange-100');
    });

    test('handles case insensitivity', () => {
      expect(getStatusColor('completed')).toContain('bg-blue-100');
      expect(getStatusColor('COMPLETED')).toContain('bg-blue-100');
      expect(getStatusColor('cAnCeLlEd')).toContain('bg-red-100');
    });

    test('handles undefined, null, and empty string', () => {
      expect(getStatusColor(undefined)).toContain('bg-gray-100');
      expect(getStatusColor(null)).toContain('bg-gray-100');
      expect(getStatusColor('')).toContain('bg-gray-100');
    });

    test('returns default color for unknown status', () => {
      expect(getStatusColor('Unknown')).toContain('bg-gray-100');
    });
  });
});
