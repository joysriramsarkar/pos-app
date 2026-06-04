import { useSettingsStore } from '@/stores/settings-store';
import { convertEnglishToBengaliNumerals } from '@/lib/utils';

/**
 * Hook to format numbers in the app's current language
 * Converts numbers to Bengali if app language is 'bn'
 */
export function useNumberFormat() {
  const { settings } = useSettingsStore();
  
  const formatNumber = (value: number | string): string => {
    const stringValue = String(value);
    
    // If language is Bengali, convert the numerals
    if (settings.app_language === 'bn') {
      return convertEnglishToBengaliNumerals(stringValue);
    }
    
    return stringValue;
  };

  const formatPrice = (price: number | null | undefined): string => {
    const numPrice = price ?? 0;
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(numPrice);
    
    // If language is Bengali, convert the numerals in the price
    if (settings.app_language === 'bn') {
      return convertEnglishToBengaliNumerals(formatted);
    }
    
    return formatted;
  };

  return { formatNumber, formatPrice };
}
