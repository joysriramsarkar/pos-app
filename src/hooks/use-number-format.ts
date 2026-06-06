import { useLocale } from 'next-intl';
import { convertEnglishToBengaliNumerals } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

export function makeFormatters(isBn: boolean, currencySymbol: string = '₹') {
  const intlLocale = isBn ? 'bn-BD' : 'en-IN';

  let currencyCode = 'INR';
  if (currencySymbol === '৳') currencyCode = 'BDT';
  else if (currencySymbol === '$') currencyCode = 'USD';
  else if (currencySymbol === '€') currencyCode = 'EUR';
  else if (currencySymbol === '£') currencyCode = 'GBP';

  const formatNumber = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return String(value);
    const formatted = new Intl.NumberFormat(intlLocale).format(num);
    return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
  };

  const formatPrice = (price: number | null | undefined): string => {
    const isStandard = ['INR', 'BDT', 'USD', 'EUR', 'GBP'].includes(currencyCode);
    
    if (isStandard) {
      const formatted = new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
      }).format(price ?? 0);
      return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
    } else {
      const numFormatted = new Intl.NumberFormat(intlLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(price ?? 0);
      const digitFormatted = isBn ? convertEnglishToBengaliNumerals(numFormatted) : numFormatted;
      return `${currencySymbol}${digitFormatted}`;
    }
  };

  const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    const formatted = d.toLocaleDateString(intlLocale, options);
    return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
  };

  const formatStringNumbers = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (!isBn) return str;
    return convertEnglishToBengaliNumerals(str);
  };

  return { formatNumber, formatPrice, formatDate, formatStringNumbers, isBn };
}

export function useNumberFormat() {
  const locale = useLocale();
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol);
  return makeFormatters(locale === 'bn', currencySymbol);
}
