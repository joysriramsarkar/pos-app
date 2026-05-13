import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { generateInvoiceNumber, generateServerInvoiceNumber } from './invoice';

describe('Invoice Number Generators', () => {
  describe('generateInvoiceNumber', () => {
    let originalDate: typeof global.Date;
    let originalMath: typeof global.Math;

    beforeEach(() => {
      originalDate = global.Date;
      originalMath = global.Math;
    });

    afterEach(() => {
      global.Date = originalDate;
      global.Math = originalMath;
    });

    it('should generate a deterministic invoice number based on mocked date and random', () => {
      // Mock Date to a fixed value (e.g., 2023-10-25T12:00:00.000Z)
      const FIXED_TIME = 1698235200000;

      class MockDate extends originalDate {
        constructor() {
          super(FIXED_TIME);
        }
        static now() {
          return FIXED_TIME;
        }
      }
      global.Date = MockDate as any;

      // Note: generateInvoiceNumber now uses UUID fragments instead of timestamp+random
      // So we just validate the format here (date + 8-char UUID fragment)
      const invoiceNum = generateInvoiceNumber();
      
      // Format: INV-YYYYMMDD-XXXXXXXX (8 hex characters from UUID)
      const regex = /^INV-\d{8}-[A-F0-9]{8}$/i;
      expect(regex.test(invoiceNum)).toBe(true);
      expect(invoiceNum.startsWith('INV-20231025-')).toBe(true);
    });

    it('should match the expected regular expression format', () => {
      const invoiceNum = generateInvoiceNumber();

      // Format: INV-YYYYMMDD-XXXXXXXX (8 hex characters from UUID)
      const regex = /^INV-\d{8}-[A-F0-9]{8}$/i;
      expect(regex.test(invoiceNum)).toBe(true);
      expect(invoiceNum.length).toBe(21);
    });

    it('should generate different numbers on subsequent calls', () => {
      const num1 = generateInvoiceNumber();
      const num2 = generateInvoiceNumber();

      const regex = /^INV-\d{8}-[A-F0-9]{8}$/i;
      expect(regex.test(num1)).toBe(true);
      expect(regex.test(num2)).toBe(true);
      expect(num1).not.toBe(num2);
    });
  });

  describe('generateServerInvoiceNumber', () => {
    it('should return a string with the correct format', async () => {
      const invoiceNum = await generateServerInvoiceNumber();

      // Format: INV-YYYYMMDD-[UUID_FRAGMENT]
      // UUID fragment is typically 8 hex characters, but let's allow general alphanumeric just in case
      const regex = /^INV-\d{8}-[A-F0-9]{8}$/i;
      expect(regex.test(invoiceNum)).toBe(true);
    });

    it('should generate unique numbers across multiple calls', async () => {
      const num1 = await generateServerInvoiceNumber();
      const num2 = await generateServerInvoiceNumber();

      expect(num1).not.toBe(num2);
    });
  });
});
