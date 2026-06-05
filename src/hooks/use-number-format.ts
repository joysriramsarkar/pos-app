import { useLocale } from 'next-intl';
import { convertEnglishToBengaliNumerals } from '@/lib/utils';

export function makeFormatters(isBn: boolean) {
  const intlLocale = isBn ? 'bn-BD' : 'en-IN';

  const formatNumber = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return String(value);
    const formatted = new Intl.NumberFormat(intlLocale).format(num);
    return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
  };

  const formatPrice = (price: number | null | undefined): string => {
    const formatted = new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(price ?? 0);
    return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
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
  return makeFormatters(locale === 'bn');
}
