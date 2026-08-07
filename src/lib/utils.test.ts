import { describe, it, expect } from 'vitest';
import { convertBengaliToEnglishNumerals, isValidEanUpcBarcode, cn, convertEnglishToBengaliNumerals, normalizeSearchText, sortByPopularity } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges class names correctly', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2');
      expect(cn('class1', { class2: true, class3: false })).toBe('class1 class2');
      expect(cn('p-4', 'p-2')).toBe('p-2'); // tailwind-merge override
    });
  });

  describe('convertEnglishToBengaliNumerals', () => {
    it('should convert English numerals to Bengali numerals', () => {
      expect(convertEnglishToBengaliNumerals('0123456789')).toBe('০১২৩৪৫৬৭৮৯');
      expect(convertEnglishToBengaliNumerals(123)).toBe('১২৩');
    });

    it('should handle strings with no English numerals', () => {
      expect(convertEnglishToBengaliNumerals('abcDEF!@#')).toBe('abcDEF!@#');
    });
  });

  describe('convertBengaliToEnglishNumerals', () => {
    it('should convert all Bengali numerals to English numerals', () => {
      expect(convertBengaliToEnglishNumerals('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
    });

    it('should handle strings with no Bengali numerals', () => {
      expect(convertBengaliToEnglishNumerals('0123456789')).toBe('0123456789');
      expect(convertBengaliToEnglishNumerals('abcDEF!@#')).toBe('abcDEF!@#');
    });

    it('should handle mixed strings of Bengali, English, and other characters', () => {
      expect(convertBengaliToEnglishNumerals('Price: ১২০ Taka')).toBe('Price: 120 Taka');
      expect(convertBengaliToEnglishNumerals('১2৩4৫6')).toBe('123456');
    });

    it('should handle an empty string', () => {
      expect(convertBengaliToEnglishNumerals('')).toBe('');
    });

    it('should handle very long strings', () => {
      const longBengaliString = '১'.repeat(1000);
      const expectedEnglishString = '1'.repeat(1000);
      expect(convertBengaliToEnglishNumerals(longBengaliString)).toBe(expectedEnglishString);
    });

    it('should handle strings with whitespace correctly', () => {
      expect(convertBengaliToEnglishNumerals(' ১ ২ ৩ ')).toBe(' 1 2 3 ');
      expect(convertBengaliToEnglishNumerals('\n৪\t৫\r৬')).toBe('\n4\t5\r6');
    });
  });

  describe('sortByPopularity', () => {
    it('puts ranked items first in ascending rank order and sorts unranked items alphabetically', () => {
      const items = [
        { id: 'a', name: 'Banana' },
        { id: 'b', name: 'Apple' },
        { id: 'c', name: 'Carrot' },
        { id: 'd', name: 'Date' },
      ];

      const result = sortByPopularity(items, (id) => {
        if (id === 'a') return 2;
        if (id === 'c') return 1;
        return undefined;
      });

      expect(result.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
    });

    it('sorts all unranked items alphabetically when no rank is available', () => {
      const items = [
        { id: 'x', name: 'Zebra' },
        { id: 'y', name: 'Ant' },
      ];

      const result = sortByPopularity(items, () => undefined);

      expect(result.map((item) => item.id)).toEqual(['y', 'x']);
    });
  });

  describe('isValidEanUpcBarcode', () => {
    it('should return true for valid 12-digit English barcodes', () => {
      expect(isValidEanUpcBarcode('123456789012')).toBe(true);
    });

    it('should return true for valid 13-digit English barcodes', () => {
      expect(isValidEanUpcBarcode('1234567890123')).toBe(true);
    });

    it('should return true for valid 12-digit Bengali barcodes', () => {
      expect(isValidEanUpcBarcode('১২৩৪৫৬৭৮৯০১২')).toBe(true);
    });

    it('should return true for valid 13-digit Bengali barcodes', () => {
      expect(isValidEanUpcBarcode('১২৩৪৫৬৭৮৯০১২৩')).toBe(true);
    });

    it('should return true for mixed valid barcodes (if lengths match)', () => {
      expect(isValidEanUpcBarcode('12৩৪56৭৮9012')).toBe(true);
    });

    it('should trim whitespace before validating', () => {
      expect(isValidEanUpcBarcode('  123456789012  ')).toBe(true);
      expect(isValidEanUpcBarcode('\n১২৩৪৫৬৭৮৯০১২৩\t')).toBe(true);
    });

    it('should return false for barcodes that are too short', () => {
      expect(isValidEanUpcBarcode('12345678901')).toBe(false);
      expect(isValidEanUpcBarcode('১২৩৪৫৬৭৮৯০১')).toBe(false);
    });

    it('should return false for barcodes that are too long', () => {
      expect(isValidEanUpcBarcode('12345678901234')).toBe(false);
      expect(isValidEanUpcBarcode('১২৩৪৫৬৭৮৯০১২৩৪')).toBe(false);
    });

    it('should return false for strings with non-numeric characters', () => {
      expect(isValidEanUpcBarcode('12345678901A')).toBe(false);
      expect(isValidEanUpcBarcode('১২৩৪৫৬৭৮৯০১ক')).toBe(false);
      expect(isValidEanUpcBarcode('123-456789012')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidEanUpcBarcode('')).toBe(false);
    });
  });
});
