import * as fs from 'fs';
import * as path from 'path';

const formatUtilsContent = 
import { convertEnglishToBengaliNumerals } from './utils';

export function isBengali(): boolean {
  if (typeof document !== 'undefined') {
    return document.documentElement.lang === 'bn';
  }
  return false;
}

export function formatPriceGlobal(price: number | null | undefined): string {
  if (price === null || price === undefined) return '';
  const isBn = isBengali();
  const formatted = new Intl.NumberFormat(isBn ? 'bn-BD' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
  return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
}

export function formatDateGlobal(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return '-';
  const isBn = isBengali();
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  const formatted = d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', options);
  return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
}

export function formatNumberGlobal(num: number | string | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (num === null || num === undefined) return '';
  const isBn = isBengali();
  const parsed = typeof num === 'string' ? parseFloat(num) : Number(num);
  if (isNaN(parsed)) return String(num);
  const formatted = new Intl.NumberFormat(isBn ? 'bn-BD' : 'en-IN', options).format(parsed);
  return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
}
;

fs.writeFileSync(path.join(process.cwd(), 'src/lib/format-utils.ts'), formatUtilsContent);
console.log('format-utils.ts created');
