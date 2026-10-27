/**
 * Comam Natural Language & Voice Engine for pos-app.
 * Parses spoken/typed Bengali shop commands into structured drafts
 * that integrate with the POS cart, inventory and ledger.
 */
import type { Product, Customer } from '@/types/pos';
import {
  UNITS,
  findNumberPhrases,
  formatBnNumber,
  formatBnTaka,
  parseNumberAt,
} from './bn-parser';
import {
  extractSpokenCustomerName,
  findCustomer,
  normalizeBengali,
  searchProducts,
  type ProductMatch,
} from './comam-matcher';

export interface DraftItem {
  product: Product;
  productId: string;
  name: string;
  nameBn?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  ambiguous?: boolean;
  options?: Array<{
    product: Product;
    productId: string;
    name: string;
    nameBn?: string;
    price: number;
  }>;
}

export interface UnknownItem {
  text: string;
  qty: number;
  statedPrice?: number | null;
}

export interface Ambiguity {
  text: string;
  productId: string;
  options: Array<{
    product: Product;
    productId: string;
    name: string;
    nameBn?: string;
    price: number;
  }>;
}

export type CommandKind =
  | 'sale'
  | 'due_query'
  | 'report'
  | 'due_payment'
  | 'undo'
  | 'unknown';

export type ReportType =
  | 'sales_summary'
  | 'low_stock'
  | 'top_products'
  | 'week_compare';

export interface ComamDraft {
  kind: CommandKind;
  raw: string;
  items: DraftItem[];
  unknownItems: UnknownItem[];
  ambiguities: Ambiguity[];
  customer: Customer | null;
  customerName?: string | null;
  paymentType: 'Cash' | 'Due' | 'UPI';
  total: number;
  report?: ReportType;
  duePaymentAmount?: number;
  summaryBn: string;
  needsClarification: boolean;
}

function splitSegments(text: string): string[] {
  return text
    .split(/[,،]| এবং | আর | ও /g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractStatedPrice(segment: string): { statedPrice: number | null; cleanSegment: string } {
  const phrases = findNumberPhrases(segment);

  for (const { value, start, end } of phrases) {
    const after = segment.slice(end);
    const stripped = after.trimStart();
    const lead = after.length - stripped.length;

    for (const token of ['টাকা দামের', 'টাকার', 'টাকা']) {
      if (stripped.startsWith(token)) {
        const cut = end + lead + token.length;
        if (token === 'টাকা' && !segment.slice(cut).trim()) {
          // Stated total at end of segment, skip
          continue;
        }
        const clean = (segment.slice(0, start) + ' ' + segment.slice(cut)).trim();
        return { statedPrice: value, cleanSegment: clean };
      }
    }
  }

  return { statedPrice: null, cleanSegment: segment };
}

function parseItemSegment(
  products: Product[],
  rawSegment: string
): {
  item: DraftItem | null;
  ambiguity: Ambiguity | null;
  unknown: UnknownItem | null;
} {
  const { statedPrice, cleanSegment } = extractStatedPrice(rawSegment);
  let segment = cleanSegment;
  const phrases = findNumberPhrases(segment);

  // Piece-suffixed number e.g. "দুটো", "দুইটা", "৩টি", "একখানা"
  const pm = segment.match(/(\S+?)(টে|টা|টি|টো|খানা)(?=$|[\s,।])/);
  let pmVal: number | null = null;
  if (pm) {
    if (pm[1] === 'দু') {
      pmVal = 2.0;
    } else {
      const [parsed] = parseNumberAt([pm[1]], 0);
      pmVal = parsed;
    }
  }

  let qty: number | null = null;
  let qtySpan: [number, number] | null = null;

  const phraseFirst =
    phrases.length > 0 &&
    (!pm || phrases[0].start <= pm.index! || phrases[0].start <= pm.index! + pm[0].length + 1);

  if (phraseFirst) {
    qty = phrases[0].value;
    qtySpan = [phrases[0].start, phrases[0].end];
    // Check for speech stutter / self-correction e.g. "দুই দুই ডজন ডিম"
    const afterFirst = segment.slice(phrases[0].end).trimStart();
    const sub = findNumberPhrases(afterFirst);
    if (sub.length > 0 && sub[0].start === 0) {
      const remaining = afterFirst.slice(sub[0].end).trimStart();
      if (Object.keys(UNITS).some((u) => remaining.startsWith(u))) {
        qty = sub[0].value;
        const lead = segment.slice(phrases[0].end).length - afterFirst.length;
        qtySpan = [phrases[0].end + lead + sub[0].start, phrases[0].end + lead + sub[0].end];
      }
    }
  }

  let unitFactor = 1.0;
  let rest = segment;

  if (qtySpan) {
    const after = segment.slice(qtySpan[1]).trim();
    const sortedUnits = Object.entries(UNITS).sort((a, b) => b[0].length - a[0].length);
    for (const [unitWord, def] of sortedUnits) {
      if (after.startsWith(unitWord)) {
        unitFactor = def.factor;
        rest = (segment.slice(0, qtySpan[0]) + ' ' + after.slice(unitWord.length)).trim();
        break;
      }
    }
    if (rest === segment) {
      rest = (segment.slice(0, qtySpan[0]) + ' ' + segment.slice(qtySpan[1])).trim();
    }
  }

  if (qty === null && pmVal !== null && pm) {
    qty = pmVal;
    unitFactor = 1.0;
    rest = (segment.slice(0, pm.index!) + ' ' + segment.slice(pm.index! + pm[0].length)).trim();
  }

  // Clean filler words
  rest = rest.replace(/(দাও|দিন|দেন|নাও|করো|করুন|চাই|লিখে রাখো|রাখো|বিল|প্যাকেট)/g, '').trim();

  let { matches, isAmbiguous } = searchProducts(products, rest);

  if (matches.length === 0) {
    return {
      item: null,
      ambiguity: null,
      unknown: {
        text: rest || rawSegment,
        qty: qty || 1.0,
        statedPrice,
      },
    };
  }

  const finalQty = (qty || 1.0) * unitFactor;

  // Stated price variant selection: "১০ টাকা দামের বিস্কুট" picks the 10-taka pack!
  if (statedPrice !== null) {
    const priceHits = matches.filter((m) => Math.abs(m.product.sellingPrice - statedPrice) < 0.01);
    if (priceHits.length === 1) {
      const p = priceHits[0].product;
      return {
        item: {
          product: p,
          productId: p.id,
          name: p.name,
          nameBn: p.nameBn || p.name,
          qty: finalQty,
          unit: p.unit,
          unitPrice: p.sellingPrice,
          lineTotal: Math.round(p.sellingPrice * finalQty * 100) / 100,
        },
        ambiguity: null,
        unknown: null,
      };
    }
  }

  const chosenProduct = matches[0].product;
  let lineTotal = Math.round(chosenProduct.sellingPrice * finalQty * 100) / 100;

  // Weight-based stated price e.g. "৭৫ টাকার চিনি"
  if (statedPrice !== null && matches.length === 1 && (chosenProduct.unit === 'kg' || chosenProduct.unit === 'litre')) {
    lineTotal = statedPrice;
  }

  let ambiguity: Ambiguity | null = null;
  const options = isAmbiguous
    ? matches.slice(0, 3).map((m) => ({
        product: m.product,
        productId: m.product.id,
        name: m.product.name,
        nameBn: m.product.nameBn || m.product.name,
        price: m.product.sellingPrice,
      }))
    : undefined;

  if (isAmbiguous && options) {
    ambiguity = {
      text: rest,
      productId: chosenProduct.id,
      options,
    };
  }

  return {
    item: {
      product: chosenProduct,
      productId: chosenProduct.id,
      name: chosenProduct.name,
      nameBn: chosenProduct.nameBn || chosenProduct.name,
      qty: finalQty,
      unit: chosenProduct.unit,
      unitPrice: chosenProduct.sellingPrice,
      lineTotal,
      ambiguous: isAmbiguous,
      options,
    },
    ambiguity,
    unknown: null,
  };
}

export function parseComamCommand(
  text: string,
  products: Product[],
  customers: Customer[]
): ComamDraft {
  const raw = text.trim();
  const norm = normalizeBengali(raw);

  // 1. Detect Reports Intent
  if (/বিক্রি|সেলস|লাভ|পরিসংখ্যান|হিসাব/.test(raw) && /কেমন|কত|আজ|আজকের|আজকে|সপ্তাহে|সপ্তাহের/.test(raw)) {
    if (/সপ্তাহ/.test(raw)) {
      return {
        kind: 'report',
        raw,
        items: [],
        unknownItems: [],
        ambiguities: [],
        customer: null,
        paymentType: 'Cash',
        total: 0,
        report: 'week_compare',
        summaryBn: 'এই সপ্তাহের বিক্রয় রিপোর্ট প্রস্তুত করা হচ্ছে।',
        needsClarification: false,
      };
    }
    return {
      kind: 'report',
      raw,
      items: [],
      unknownItems: [],
      ambiguities: [],
      customer: null,
      paymentType: 'Cash',
      total: 0,
      report: 'sales_summary',
      summaryBn: 'আজকের মোট বিক্রয় ও লাভের তথ্য বের করা হচ্ছে।',
      needsClarification: false,
    };
  }

  if (/কোন|পণ্য|মাল/.test(raw) && /শেষ|কম|স্টক|ঘাটতি/.test(raw)) {
    return {
      kind: 'report',
      raw,
      items: [],
      unknownItems: [],
      ambiguities: [],
      customer: null,
      paymentType: 'Cash',
      total: 0,
      report: 'low_stock',
      summaryBn: 'কম স্টকের পণ্য তালিকা পরীক্ষা করা হচ্ছে।',
      needsClarification: false,
    };
  }

  if (/বেশি বিক্রি|টপ পণ্য|জনপ্রিয়/.test(raw)) {
    return {
      kind: 'report',
      raw,
      items: [],
      unknownItems: [],
      ambiguities: [],
      customer: null,
      paymentType: 'Cash',
      total: 0,
      report: 'top_products',
      summaryBn: 'সবচেয়ে বেশি বিক্রিত পণ্যের হিসাব প্রস্তুত করা হচ্ছে।',
      needsClarification: false,
    };
  }

  // 2. Detect Due Query Intent ("কার কত বাকি?", "রহিমদার কত বাকি?")
  if (norm.includes('বাকি') && (norm.includes('কত') || norm.includes('কার') || norm.includes('কাদের'))) {
    const cust = findCustomer(customers, raw);
    return {
      kind: 'due_query',
      raw,
      items: [],
      unknownItems: [],
      ambiguities: [],
      customer: cust,
      customerName: cust ? cust.name : null,
      paymentType: 'Due',
      total: 0,
      summaryBn: cust
        ? `${cust.name}-এর বাকি হিসাব: ${formatBnTaka(cust.totalDue)}।`
        : 'সকল ক্রেতার বাকি হিসাব দেখা হচ্ছে।',
      needsClarification: false,
    };
  }

  // 3. Detect Undo Last Sale ("শেষ বিক্রিটা বাতিল করো")
  if (/শেষ|আগের|লাস্ট/.test(raw) && /বিক্রি|বিল|সেল/.test(raw) && /বাতিল|ক্যানসেল|ফেরত|মুছে/.test(raw)) {
    return {
      kind: 'undo',
      raw,
      items: [],
      unknownItems: [],
      ambiguities: [],
      customer: null,
      paymentType: 'Cash',
      total: 0,
      summaryBn: 'সর্বশেষ বিক্রয় বাতিল করার নির্দেশ চিহ্নিত হয়েছে।',
      needsClarification: false,
    };
  }

  // 4. Detect Due Payment ("রহিমদা ৫০০ টাকা জমা দিলেন")
  if (/জমা|পরিশোধ|পেমেন্ট/.test(raw) && /দিলেন|দিল|করল|হলো/.test(raw)) {
    const cust = findCustomer(customers, raw);
    const phrases = findNumberPhrases(raw);
    const amount = phrases.length > 0 ? phrases[0].value : 0;
    return {
      kind: 'due_payment',
      raw,
      items: [],
      unknownItems: [],
      ambiguities: [],
      customer: cust,
      customerName: cust ? cust.name : extractSpokenCustomerName(raw, products),
      paymentType: 'Cash',
      total: amount,
      duePaymentAmount: amount,
      summaryBn: cust
        ? `${cust.name} ${formatBnTaka(amount)} বাকি জমা দিচ্ছেন।`
        : `${formatBnTaka(amount)} বাকি জমার ড্রাফট।`,
      needsClarification: false,
    };
  }

  // 5. Billing / Sale Command ("দুই কেজি চিনি, ১ কেজি ডাল, রহিমদার নামে বাকি")
  const customer = findCustomer(customers, raw);
  const newCustomerName = customer ? null : extractSpokenCustomerName(raw, products);

  let paymentType: 'Cash' | 'Due' | 'UPI' = 'Cash';
  if (/বাকি|বাকিতে|নামে|খাতায়/.test(raw)) {
    paymentType = 'Due';
  } else if (/ইউপিআই|ইউপিআইতে|upi|gpay|paytm|phonepe|অনলাইন|অনলাইনে/.test(raw)) {
    paymentType = 'UPI';
  }

  const segments = splitSegments(raw);
  const items: DraftItem[] = [];
  const unknownItems: UnknownItem[] = [];
  const ambiguities: Ambiguity[] = [];

  for (const seg of segments) {
    // Ignore payment or customer trailing words in segment, but preserve price expressions
    const cleanedSeg = seg.replace(/(নগদে?|বাকিতে?|ইউপিআই(?:তে)?|বিল(?:\s*করো)?)/g, ' ').trim();
    if (!cleanedSeg) continue;

    const res = parseItemSegment(products, cleanedSeg);
    if (res.item) {
      items.push(res.item);
    }
    if (res.ambiguity) {
      ambiguities.push(res.ambiguity);
    }
    if (res.unknown) {
      unknownItems.push(res.unknown);
    }
  }

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // Generate Bengali summary for human readback
  let summaryBn = '';
  if (items.length > 0) {
    const itemSummaries = items.map(
      (it) => `${it.nameBn || it.name} (${formatBnNumber(it.qty)} ${it.unit})`
    );
    summaryBn = `${itemSummaries.join(', ')} — মোট ${formatBnTaka(total)}`;

    if (paymentType === 'Due') {
      const custName = customer?.name || newCustomerName || 'ক্রেতা';
      summaryBn += ` (${custName}-এর নামে বাকি)`;
    } else if (paymentType === 'UPI') {
      summaryBn += ' (ইউপিআই)';
    } else {
      summaryBn += ' (নগদ)';
    }
  } else if (unknownItems.length > 0) {
    summaryBn = `ক্যাটালগে মেলেনি: ${unknownItems.map((u) => u.text).join(', ')}`;
  } else {
    summaryBn = 'কথাটি বুঝতে পারিনি — আবার বলবেন?';
  }

  return {
    kind: items.length > 0 ? 'sale' : 'unknown',
    raw,
    items,
    unknownItems,
    ambiguities,
    customer,
    customerName: customer ? customer.name : newCustomerName,
    paymentType,
    total: Math.round(total * 100) / 100,
    summaryBn,
    needsClarification: ambiguities.length > 0,
  };
}
