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

  const formatPrice = (price: number | string | null | undefined): string => {
    const parsed = typeof price === 'string' ? parseFloat(price) : price;
    const finalPrice = parsed === null || parsed === undefined || isNaN(parsed as number) ? 0 : (parsed as number);
    
    const isNegative = finalPrice < 0;
    const absPrice = Math.abs(finalPrice);
    
    const formattedNum = new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(absPrice);
    
    const digitFormatted = isBn ? convertEnglishToBengaliNumerals(formattedNum) : formattedNum;
    return `${isNegative ? '-' : ''}${currencySymbol}${digitFormatted}`;
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
