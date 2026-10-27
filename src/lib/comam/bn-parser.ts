/**
 * Deterministic Bengali number, fraction and unit parser for POS Comam integration.
 * Ported and enhanced from comam AI's bn.py engine.
 */

export const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const ASCII_DIGITS = '0123456789';

const BN_TO_ASCII_MAP: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

const ASCII_TO_BN_MAP: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};

export function bnToAscii(text: string): string {
  return text.replace(/[০-৯]/g, (ch) => BN_TO_ASCII_MAP[ch] || ch);
}

export function toBnDigits(text: string | number): string {
  return String(text).replace(/[0-9]/g, (ch) => ASCII_TO_BN_MAP[ch] || ch);
}

export function formatBnNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(bnToAscii(value)) : value;
  if (isNaN(num)) return '';
  const formatted = num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
  return toBnDigits(formatted);
}

export function formatBnTaka(value: number | string | null | undefined): string {
  return `${formatBnNumber(value)} টাকা`;
}

export const WORD_NUMBERS: Record<string, number> = {
  'শূন্য': 0, 'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5, 'ছয়': 6,
  'সাত': 7, 'আট': 8, 'নয়': 9, 'দশ': 10, 'এগারো': 11, 'বারো': 12,
  'তেরো': 13, 'চৌদ্দ': 14, 'পনেরো': 15, 'ষোলো': 16, 'সতেরো': 17,
  'আঠারো': 18, 'উনিশ': 19, 'বিশ': 20, 'কুড়ি': 20, 'একুশ': 21,
  'বাইশ': 22, 'তেইশ': 23, 'চব্বিশ': 24, 'পঁচিশ': 25, 'ছাব্বিশ': 26,
  'সাতাশ': 27, 'আটাশ': 28, 'ঊনত্রিশ': 29, 'ত্রিশ': 30, 'তিরিশ': 30, 'তিরিশা': 30, 'একত্রিশ': 31,
  'বত্রিশ': 32, 'তেত্রিশ': 33, 'চৌত্রিশ': 34, 'পঁয়ত্রিশ': 35,
  'ছত্রিশ': 36, 'সাঁইত্রিশ': 37, 'আটত্রিশ': 38, 'ঊনচল্লিশ': 39,
  'চল্লিশ': 40, 'একচল্লিশ': 41, 'বিয়াল্লিশ': 42, 'তেতাল্লিশ': 43,
  'চুয়াল্লিশ': 44, 'পঁয়তাল্লিশ': 45, 'ছেচল্লিশ': 46, 'সাতচল্লিশ': 47,
  'আটচল্লিশ': 48, 'ঊনপঞ্চাশ': 49, 'পঞ্চাশ': 50, 'একান্ন': 51,
  'বাহান্ন': 52, 'তিপ্পান্ন': 53, 'চুয়ান্ন': 54, 'পঞ্চান্ন': 55,
  'ছাপ্পান্ন': 56, 'সাতান্ন': 57, 'আটান্ন': 58, 'ঊনষাট': 59,
  'ষাট': 60, 'একষট্টি': 61, 'বাষট্টি': 62, 'তেষট্টি': 63,
  'চৌষট্টি': 64, 'পঁয়ষট্টি': 65, 'ছেষট্টি': 66, 'সাতষট্টি': 67,
  'আটষট্টি': 68, 'ঊনসত্তর': 69, 'সত্তর': 70, 'একাত্তর': 71,
  'বাহাত্তর': 72, 'তিয়াত্তর': 73, 'চুয়াত্তর': 74, 'পঁচাত্তর': 75,
  'ছিয়াত্তর': 76, 'সাতাত্তর': 77, 'আটাত্তর': 78, 'ঊনআশি': 79,
  'আশি': 80, 'একাশি': 81, 'বিরাশি': 82, 'তিরাশি': 83, 'চুরাশি': 84,
  'পঁচাশি': 85, 'ছিয়াশি': 86, 'সাতাশি': 87, 'আটাশি': 88,
  'ঊননব্বই': 89, 'নব্বই': 90, 'একানব্বই': 91, 'বিরানব্বই': 92,
  'তিরানব্বই': 93, 'চুরানব্বই': 94, 'পঁচানব্বই': 95, 'ছিয়ানব্বই': 96,
  'সাতানব্বই': 97, 'আটানব্বই': 98, 'নিরানব্বই': 99,
};

export const FRACTION_WORDS: Record<string, number> = {
  'আধা': 0.5,
  'অর্ধেক': 0.5,
  'দেড়': 1.5,
  'আড়াই': 2.5,
  'হাফ': 0.5,
  'half': 0.5,
};

export interface UnitDef {
  unit: 'kg' | 'litre' | 'piece';
  factor: number;
}

export const UNITS: Record<string, UnitDef> = {
  'কেজি': { unit: 'kg', factor: 1.0 },
  'কিলো': { unit: 'kg', factor: 1.0 },
  'কিলোগ্রাম': { unit: 'kg', factor: 1.0 },
  'গ্রাম': { unit: 'kg', factor: 0.001 },
  'লিটার': { unit: 'litre', factor: 1.0 },
  'লি': { unit: 'litre', factor: 1.0 },
  'মিলি': { unit: 'litre', factor: 0.001 },
  'টা': { unit: 'piece', factor: 1.0 },
  'টে': { unit: 'piece', factor: 1.0 },
  'টি': { unit: 'piece', factor: 1.0 },
  'টো': { unit: 'piece', factor: 1.0 },
  'খানা': { unit: 'piece', factor: 1.0 },
  'পিস': { unit: 'piece', factor: 1.0 },
  'প্যাকেট': { unit: 'piece', factor: 1.0 },
  'প্যাক': { unit: 'piece', factor: 1.0 },
  'বোতল': { unit: 'piece', factor: 1.0 },
  'ডজন': { unit: 'piece', factor: 12.0 },
  // English / Banglish unit aliases
  'g': { unit: 'kg', factor: 0.001 },
  'gm': { unit: 'kg', factor: 0.001 },
  'gram': { unit: 'kg', factor: 0.001 },
  'grams': { unit: 'kg', factor: 0.001 },
  'kg': { unit: 'kg', factor: 1.0 },
  'kilo': { unit: 'kg', factor: 1.0 },
  'kilos': { unit: 'kg', factor: 1.0 },
  'l': { unit: 'litre', factor: 1.0 },
  'litre': { unit: 'litre', factor: 1.0 },
  'litres': { unit: 'litre', factor: 1.0 },
  'liter': { unit: 'litre', factor: 1.0 },
  'liters': { unit: 'litre', factor: 1.0 },
  'ml': { unit: 'litre', factor: 0.001 },
  'dozen': { unit: 'piece', factor: 12.0 },
  'pc': { unit: 'piece', factor: 1.0 },
  'pcs': { unit: 'piece', factor: 1.0 },
  'piece': { unit: 'piece', factor: 1.0 },
  'packet': { unit: 'piece', factor: 1.0 },
  'pack': { unit: 'piece', factor: 1.0 },
};

function restUnder(tokens: string[], i: number, limit: number): [number | null, number] {
  if (i >= tokens.length) return [null, i];
  const tok = tokens[i];
  const asciiTok = bnToAscii(tok);
  if (/^\d+(\.\d+)?$/.test(asciiTok)) {
    const val = parseFloat(asciiTok);
    if (val < limit) return [val, i + 1];
  }
  if (WORD_NUMBERS[tok] !== undefined && WORD_NUMBERS[tok] < limit) {
    return [WORD_NUMBERS[tok], i + 1];
  }
  return [null, i];
}

function baseNumber(tokens: string[], i: number): [number | null, number] {
  if (i >= tokens.length) return [null, i];
  const tok = tokens[i];
  const asciiTok = bnToAscii(tok);
  let value: number | null = null;

  if (/^\d+(\.\d+)?$/.test(asciiTok)) {
    value = parseFloat(asciiTok);
    i += 1;
  } else if (tok.endsWith('শ') && WORD_NUMBERS[tok.slice(0, -1)] !== undefined && WORD_NUMBERS[tok.slice(0, -1)] < 10) {
    value = WORD_NUMBERS[tok.slice(0, -1)] * 100;
    i += 1;
    const [rest, j] = restUnder(tokens, i, 100);
    if (rest !== null) {
      value += rest;
      i = j;
    }
  } else if (tok.endsWith('শো') && WORD_NUMBERS[tok.slice(0, -2)] !== undefined && WORD_NUMBERS[tok.slice(0, -2)] < 10) {
    value = WORD_NUMBERS[tok.slice(0, -2)] * 100;
    i += 1;
    const [rest, j] = restUnder(tokens, i, 100);
    if (rest !== null) {
      value += rest;
      i = j;
    }
  } else if (WORD_NUMBERS[tok] !== undefined) {
    value = WORD_NUMBERS[tok];
    i += 1;
  } else {
    return [null, i];
  }

  // Multipliers: শত / শো / হাজার
  if (i < tokens.length && (tokens[i] === 'শত' || tokens[i] === 'শো')) {
    value *= 100;
    i += 1;
    const [rest, j] = baseNumber(tokens, i);
    if (rest !== null && rest < 100) {
      value += rest;
      i = j;
    }
  } else if (i < tokens.length && tokens[i] === 'হাজার') {
    value *= 1000;
    i += 1;
    const [rest, j] = baseNumber(tokens, i);
    if (rest !== null && rest < 1000) {
      value += rest;
      i = j;
    }
  }

  return [value, i];
}

export function parseNumberAt(tokens: string[], i: number): [number | null, number] {
  if (i >= tokens.length) return [null, i];
  const tok = tokens[i];
  const lower = tok.toLowerCase();

  if (lower === 'half') return [0.5, i + 1];

  if (tok === 'সাড়ে') {
    const [base, j] = baseNumber(tokens, i + 1);
    if (base !== null) {
      if (base >= 100) {
        const unit = base >= 1000 ? 1000 : 100;
        if (base % unit === 0) return [base + unit / 2, j];
      }
      return [base + 0.5, j];
    }
    return [null, i];
  }

  if (tok === 'পৌনে' || tok === 'পোনে') {
    const [base, j] = baseNumber(tokens, i + 1);
    if (base !== null) return [base - 0.25, j];
    return [null, i];
  }

  if (tok === 'সোয়া') {
    const [base, j] = baseNumber(tokens, i + 1);
    if (base !== null) return [base + 0.25, j];
    return [null, i];
  }

  if (FRACTION_WORDS[tok] !== undefined) {
    if (i + 1 < tokens.length && tokens[i + 1] === 'হাজার') {
      return [FRACTION_WORDS[tok] * 1000, i + 2];
    }
    return [FRACTION_WORDS[tok], i + 1];
  }

  if (tok === 'একশ' || tok === 'একশো' || tok === 'শত') {
    const [rest, j] = baseNumber(tokens, i + 1);
    if (rest !== null && rest < 100) {
      return [100 + rest, j];
    }
    return [100, i + 1];
  }

  return baseNumber(tokens, i);
}

export interface NumberPhrase {
  value: number;
  start: number;
  end: number;
}

export function findNumberPhrases(text: string): NumberPhrase[] {
  const tokenRegex = /[^\s,।;]+/g;
  const tokens: Array<{ word: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = tokenRegex.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }

  const words = tokens.map((t) => t.word);
  const found: NumberPhrase[] = [];
  let i = 0;

  while (i < words.length) {
    const [value, j] = parseNumberAt(words, i);
    if (value !== null && j > i) {
      found.push({
        value,
        start: tokens[i].start,
        end: tokens[j - 1].end,
      });
      i = j;
    } else {
      i += 1;
    }
  }

  return found;
}
