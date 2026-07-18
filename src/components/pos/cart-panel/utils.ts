import { convertBengaliToEnglishNumerals } from '@/lib/utils';

export const normalizeAndValidatePhone = (phone: string): string | null => {
  if (!phone) return null;
  let clean = phone.replace(/\s+/g, '');
  clean = convertBengaliToEnglishNumerals(clean);
  if (clean.startsWith('+')) clean = clean.slice(1);
  if (clean.startsWith('091') && clean.length === 13) clean = clean.slice(3);
  else if (clean.startsWith('91') && clean.length === 12) clean = clean.slice(2);
  else if (clean.startsWith('0') && clean.length === 11) clean = clean.slice(1);
  return /^[0-9]{10}$/.test(clean) ? clean : null;
};
