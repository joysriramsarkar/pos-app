import { useLocale } from 'next-intl';
import { convertEnglishToBengaliNumerals } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

/** Always format with en-IN grouping then map digits for bn — avoids double-conversion quirks */
function formatDigits(value: number, isBn: boolean, options?: Intl.NumberFormatOptions): string {
  const formatted = new Intl.NumberFormat('en-IN', options).format(value);
  return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
}

export function makeFormatters(isBn: boolean, currencySymbol: string = '₹') {
  const symbol = currencySymbol || '₹';
  const intlLocale = isBn ? 'bn-BD' : 'en-IN';

  const formatNumber = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return isBn ? convertEnglishToBengaliNumerals(String(value)) : String(value);
    return formatDigits(num, isBn);
  };

  const formatPrice = (price: number | string | null | undefined): string => {
    const parsed = typeof price === 'string' ? parseFloat(price) : price;
    const finalPrice = parsed === null || parsed === undefined || isNaN(parsed as number) ? 0 : (parsed as number);

    const isNegative = finalPrice < 0;
    const absPrice = Math.abs(finalPrice);

    const digitFormatted = formatDigits(absPrice, isBn, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `${isNegative ? '-' : ''}${symbol}${digitFormatted}`;
  };

  const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    // Format with en-IN first so we control digit script via convertEnglishToBengaliNumerals
    const formatted = d.toLocaleDateString(intlLocale, options);
    return isBn ? convertEnglishToBengaliNumerals(formatted) : formatted;
  };

  const formatStringNumbers = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (!isBn) return str;
    return convertEnglishToBengaliNumerals(str);
  };

  /**
   * Compact axis formatter — understands Indian number system.
   * Prepends currency symbol from settings. Use for chart Y-axis tickFormatter.
   */
  const formatCompact = (v: number): string => {
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    let out: string;
    if (a >= 1_00_00_000) out = `${(a / 1_00_00_000).toFixed(1)}${isBn ? 'কোটি' : 'Cr'}`;
    else if (a >= 1_00_000) out = `${(a / 1_00_000).toFixed(1)}${isBn ? 'লাখ' : 'L'}`;
    else if (a >= 1_000) out = `${(a / 1_000).toFixed(1)}${isBn ? 'হা' : 'k'}`;
    else out = a.toFixed(0);
    const formatted = isBn ? convertEnglishToBengaliNumerals(out) : out;
    return `${sign}${symbol}${formatted}`;
  };

  /**
   * Compact unit formatter (no currency symbol) — for quantity/count axes.
   */
  const formatCompactUnit = (v: number): string => {
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    let out: string;
    if (a >= 1_00_00_000) out = `${(a / 1_00_00_000).toFixed(1)}${isBn ? 'কোটি' : 'Cr'}`;
    else if (a >= 1_00_000) out = `${(a / 1_00_000).toFixed(1)}${isBn ? 'লাখ' : 'L'}`;
    else if (a >= 1_000) out = `${(a / 1_000).toFixed(1)}${isBn ? 'হা' : 'k'}`;
    else out = a.toFixed(0);
    const formatted = isBn ? convertEnglishToBengaliNumerals(out) : out;
    return `${sign}${formatted}`;
  };

  return { formatNumber, formatPrice, formatDate, formatStringNumbers, formatCompact, formatCompactUnit, isBn, currencySymbol: symbol };
}

export function useNumberFormat() {
  const locale = useLocale();
  // Fall back to store default (₹) only if unset — never hardcode ৳
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol || '₹');
  return makeFormatters(locale === 'bn', currencySymbol);
}
