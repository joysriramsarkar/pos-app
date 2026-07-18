import { convertEnglishToBengaliNumerals } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

export type ReceiptLanguage = 'bn' | 'en' | 'both';

export type ReceiptLabels = {
  invoice: string;
  invoiceNo: string;
  date: string;
  time: string;
  dateTime: string;
  customer: string;
  phone: string;
  walkIn: string;
  cashier: string;
  admin: string;
  product: string;
  item: string;
  qty: string;
  price: string;
  rate: string;
  amount: string;
  total: string;
  subtotal: string;
  discount: string;
  tax: string;
  grandTotal: string;
  paid: string;
  balanceDue: string;
  due: string;
  payment: string;
  paymentMethod: string;
  paymentDetails: string;
  status: string;
  method: string;
  notes: string;
  thankYou: string;
  thankYouBn: string;
  billTo: string;
  terms: string;
  term1: string;
  term2: string;
  signatory: string;
  taxInvoice: string;
};

const EN: ReceiptLabels = {
  invoice: 'Invoice',
  invoiceNo: 'Invoice#',
  date: 'Date',
  time: 'Time',
  dateTime: 'Date & Time',
  customer: 'Customer',
  phone: 'Phone',
  walkIn: 'Walk-in Customer',
  cashier: 'Cashier',
  admin: 'Admin',
  product: 'Product',
  item: 'Item',
  qty: 'Qty',
  price: 'Price',
  rate: 'Rate',
  amount: 'Amount',
  total: 'Total',
  subtotal: 'Subtotal',
  discount: 'Discount',
  tax: 'Tax',
  grandTotal: 'Grand Total',
  paid: 'Paid',
  balanceDue: 'Balance Due',
  due: 'Due',
  payment: 'Payment',
  paymentMethod: 'Payment Method',
  paymentDetails: 'Payment Details',
  status: 'Status',
  method: 'Method',
  notes: 'Notes',
  thankYou: 'Thank you for shopping with us!',
  thankYouBn: 'ধন্যবাদ!',
  billTo: 'Bill To',
  terms: 'Terms & Conditions',
  term1: 'Goods once sold will not be taken back.',
  term2: 'Subject to local jurisdiction.',
  signatory: 'Authorized Signatory',
  taxInvoice: 'TAX INVOICE',
};

const BN: ReceiptLabels = {
  invoice: 'ইনভয়েস',
  invoiceNo: 'ইনভয়েস#',
  date: 'তারিখ',
  time: 'সময়',
  dateTime: 'তারিখ ও সময়',
  customer: 'ক্রেতা',
  phone: 'ফোন',
  walkIn: 'সাধারণ ক্রেতা',
  cashier: 'ক্যাশিয়ার',
  admin: 'অ্যাডমিন',
  product: 'পণ্য',
  item: 'পণ্য',
  qty: 'পরিমাণ',
  price: 'মূল্য',
  rate: 'দর',
  amount: 'টাকা',
  total: 'মোট',
  subtotal: 'উপমোট',
  discount: 'ডিসকাউন্ট',
  tax: 'ট্যাক্স',
  grandTotal: 'মোট পরিমাণ',
  paid: 'পরিশোধিত',
  balanceDue: 'বকেয়া',
  due: 'বাকি',
  payment: 'পেমেন্ট',
  paymentMethod: 'পেমেন্ট পদ্ধতি',
  paymentDetails: 'পেমেন্ট বিবরণ',
  status: 'অবস্থা',
  method: 'পদ্ধতি',
  notes: 'নোট',
  thankYou: 'ধন্যবাদ! পুনরায় আসুন',
  thankYouBn: 'ধন্যবাদ!',
  billTo: 'বিল প্রাপক',
  terms: 'শর্তাবলী',
  term1: 'বিক্রিত পণ্য ফেরত নেওয়া হয় না।',
  term2: 'স্থানীয় আইন অনুসারে।',
  signatory: 'অনুমোদিত স্বাক্ষরকারী',
  taxInvoice: 'ট্যাক্স ইনভয়েস',
};

function dual(en: string, bn: string): string {
  if (en === bn) return en;
  return `${bn} / ${en}`;
}

function bothLabels(): ReceiptLabels {
  const out = {} as ReceiptLabels;
  for (const key of Object.keys(EN) as (keyof ReceiptLabels)[]) {
    out[key] = dual(EN[key], BN[key]);
  }
  // Prefer pure Bengali thank-you line for bilingual receipts
  out.thankYou = `${BN.thankYouBn} ${EN.thankYou}`;
  out.thankYouBn = BN.thankYouBn;
  return out;
}

export function getReceiptLanguage(): ReceiptLanguage {
  const lang = useSettingsStore.getState().settings.receipt_language;
  if (lang === 'en' || lang === 'both') return lang;
  return 'bn';
}

export function getReceiptLabels(lang: ReceiptLanguage = getReceiptLanguage()): ReceiptLabels {
  if (lang === 'en') return EN;
  if (lang === 'both') return bothLabels();
  return BN;
}

/** Whether receipt numbers should use Bengali digits */
export function receiptUsesBengaliDigits(lang: ReceiptLanguage = getReceiptLanguage()): boolean {
  return lang === 'bn' || lang === 'both';
}

export function formatReceiptNumber(
  value: number | string | null | undefined,
  options?: Intl.NumberFormatOptions,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) {
    const raw = String(value);
    return receiptUsesBengaliDigits(lang) ? convertEnglishToBengaliNumerals(raw) : raw;
  }
  const formatted = new Intl.NumberFormat('en-IN', options).format(num);
  return receiptUsesBengaliDigits(lang) ? convertEnglishToBengaliNumerals(formatted) : formatted;
}

export function formatReceiptMoney(
  amount: number | string | null | undefined,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  const symbol = useSettingsStore.getState().settings.currency_symbol || '₹';
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  const final = amount === null || amount === undefined || isNaN(num) ? 0 : num;
  const isNegative = final < 0;
  const abs = Math.abs(final);
  const digits = formatReceiptNumber(abs, { minimumFractionDigits: 0, maximumFractionDigits: 2 }, lang);
  return `${isNegative ? '-' : ''}${symbol}${digits}`;
}

const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];
const BN_DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

export function formatReceiptDate(
  date: Date | string | number,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  if (lang === 'en') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Bengali (or both): full Bengali date
  const toBn = (n: number) => convertEnglishToBengaliNumerals(String(n));
  const day = BN_DAYS[d.getDay()];
  return `${toBn(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}, ${day}`;
}

export function formatReceiptTime(
  date: Date | string | number,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  if (lang === 'en') {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  const hours = d.getHours();
  const minutes = convertEnglishToBengaliNumerals(String(d.getMinutes()).padStart(2, '0'));
  const period = hours >= 12 ? 'পিএম' : 'এএম';
  const h12 = convertEnglishToBengaliNumerals(String(hours % 12 || 12));
  return `${h12}:${minutes} ${period}`;
}

export function formatReceiptDateTime(
  date: Date | string | number,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  return `${formatReceiptDate(date, lang)} ${formatReceiptTime(date, lang)}`;
}

/** Map stored payment method values to receipt-facing labels */
export function formatReceiptPaymentMethod(
  method: string,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  const map: Record<string, { en: string; bn: string }> = {
    Cash: { en: 'Cash', bn: 'নগদ' },
    নগদ: { en: 'Cash', bn: 'নগদ' },
    UPI: { en: 'UPI', bn: 'ইউপিআই' },
    ইউপিআই: { en: 'UPI', bn: 'ইউপিআই' },
    Mixed: { en: 'Mixed', bn: 'মিশ্র' },
    মিশ্র: { en: 'Mixed', bn: 'মিশ্র' },
    Due: { en: 'Due', bn: 'বাকি' },
    বাকি: { en: 'Due', bn: 'বাকি' },
    Prepaid: { en: 'Prepaid', bn: 'প্রিপেইড' },
    প্রিপেইড: { en: 'Prepaid', bn: 'প্রিপেইড' },
  };
  const entry = map[method];
  if (!entry) return method;
  if (lang === 'en') return entry.en;
  if (lang === 'both') return dual(entry.en, entry.bn);
  return entry.bn;
}

export function formatReceiptPaymentStatus(
  status: string,
  lang: ReceiptLanguage = getReceiptLanguage(),
): string {
  const map: Record<string, { en: string; bn: string }> = {
    Paid: { en: 'Paid', bn: 'পরিশোধিত' },
    PAID: { en: 'Paid', bn: 'পরিশোধিত' },
    Partial: { en: 'Partial', bn: 'আংশিক' },
    PARTIAL: { en: 'Partial', bn: 'আংশিক' },
    Due: { en: 'Due', bn: 'বাকি' },
    DUE: { en: 'Due', bn: 'বাকি' },
  };
  const entry = map[status] || map[status?.toUpperCase?.()];
  if (!entry) return status;
  if (lang === 'en') return entry.en;
  if (lang === 'both') return dual(entry.en, entry.bn);
  return entry.bn;
}

/** Store display name for receipt header */
export function getReceiptStoreTitle(config: { name: string; nameBn: string }, lang: ReceiptLanguage = getReceiptLanguage()): {
  primary: string;
  secondary?: string;
} {
  if (lang === 'en') return { primary: config.name || config.nameBn };
  if (lang === 'bn') return { primary: config.nameBn || config.name };
  // both
  return {
    primary: config.nameBn || config.name,
    secondary: config.name && config.name !== config.nameBn ? config.name : undefined,
  };
}
