import { convertEnglishToBengaliNumerals } from './utils';
import { useSettingsStore } from '@/stores/settings-store';

export function isBengali(): boolean {
  if (typeof document !== 'undefined') {
    return document.documentElement.lang === 'bn';
  }
  return false;
}

export function formatPriceGlobal(price: number | null | undefined): string {
  if (price === null || price === undefined || isNaN(Number(price))) return '';
  const isBn = isBengali();
  
  // Get active currency symbol from settings store
  const currencySymbol = useSettingsStore.getState().settings.currency_symbol || '₹';
  let currencyCode = 'INR';
  if (currencySymbol === '৳') currencyCode = 'BDT';
  else if (currencySymbol === '$') currencyCode = 'USD';
  else if (currencySymbol === '€') currencyCode = 'EUR';
  else if (currencySymbol === '£') currencyCode = 'GBP';

  const isStandard = ['INR', 'BDT', 'USD', 'EUR', 'GBP'].includes(currencyCode);
  const intlLocale = isBn ? 'bn-BD' : 'en-IN';

  if (isStandard) {
    const formatted = new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(price));
    return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
  } else {
    const formattedNum = new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(price));
    const digitFormatted = isBn ? convertEnglishToBengaliNumerals(formattedNum) : formattedNum;
    return `${currencySymbol}${digitFormatted}`;
  }
}

export function formatDateGlobal(date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions): string {
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
