/**
 * Comam Natural Language & Voice Engine for pos-app.
 * Parses spoken/typed Bengali shop commands into structured drafts
 * that integrate with the POS cart, inventory and ledger.
 */
import type { Product, Customer } from '@/types/pos';
import {
  UNITS,
  bnToAscii,
  cleanSpokenPunctuation,
  findNumberPhrases,
  formatBnNumber,
  formatBnTaka,
  normalizeColonArtifacts,
  parseNumberAt,
} from './bn-parser';
import {
  extractCustomerClause,
  extractDueQueryTarget,
  extractSpokenCustomerName,
  findCustomer,
  normalizeBengali,
  searchProducts,
  stripBengaliSuffixes,
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
  | 'week_compare'
  | 'product_sales';

export interface ComamDraft {
  kind: CommandKind;
  raw: string;
  items: DraftItem[];
  unknownItems: UnknownItem[];
  ambiguities: Ambiguity[];
  customer: Customer | null;
  customerName?: string | null;
  hasUnknownCustomer?: boolean;
  paymentType: 'Cash' | 'Due' | 'UPI';
  total: number;
  report?: ReportType;
  targetProduct?: Product;
  period?: 'today' | 'week' | 'month';
  duePaymentAmount?: number;
  summaryBn: string;
  needsClarification: boolean;
}

function splitSegments(text: string): string[] {
  // Normalize colon artifact in speech recognition (e.g., "1:10 টাকা" -> "১০ টাকা") and clean spoken punctuation
  let normalized = normalizeColonArtifacts(text);
  normalized = cleanSpokenPunctuation(normalized);

  // First split by explicit separators: comma, danda, 'এবং', 'আর', 'ও'
  const rawParts = normalized
    .split(/[,،।\n;]| এবং | আর | ও /g)
    .map((s) => s.trim())
    .filter(Boolean);

  const result: string[] = [];
  for (let part of rawParts) {
    // Split boundary when any word is followed by a stated price pattern that is followed by a product name:
    // e.g. "চিনি 10 টাকার বিস্কুট" -> "চিনি" and "10 টাকার বিস্কুট"
    // But keeps "সানরাইজ হলুদ ৳10 দামের" intact because nothing follows ৳10 দামের.
    part = part.replace(
      /(?<=\S)\s+(?=(?:[৳₹$]\s*[\d০-৯]+|[\d০-৯]+)\s*(?:টাকার|টাকা\s*দামের|দামের)\s+[^\s,।\d০-৯]+)/gi,
      '###SPLIT###'
    );

    // If a segment contains boundary where a quantity/unit is followed by another item:
    // e.g. "সেভেন আপ 2টা 01 কেজি চিনি"
    // But do NOT split if the following token is just the item's own price e.g. "১টা ১০ টাকা"
    const subParts = part
      .replace(
        /(\S+?(?:টা|টি|টে|টো|খানা|পিস|কেজি|গ্রাম|লিটার|বোতল|প্যাকেট|প্যাক|ডজন|kg|g|l|ml|pcs?))\s+(?=(?:[\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|দেড়|আড়াই|আধা|হাফ|পৌনে|সোয়া)\s*(?:টা|টি|টে|টো|খানা|পিস|কেজি|গ্রাম|লিটার|বোতল|প্যাকেট|প্যাক|ডজন|kg|g|l|ml|pcs?|(?!টাকা\b)[^\s,।\d০-৯]+))/gi,
        '$1###SPLIT###'
      )
      .split('###SPLIT###')
      .map((s) => s.trim())
      .filter(Boolean);

    result.push(...subParts);
  }

  return result;
}

function extractStatedPrice(segment: string): { statedPrice: number | null; cleanSegment: string } {
  // 1. Explicit pattern with currency symbol or price suffix:
  // e.g. "৳10 দামের", "৳ 10 দামের", "৳10", "₹10", "১০ টাকা দামের", "১০ টাকার", "১০ দামের", "10/- দামের"
  const priceRegexes = [
    /(?:^|\s)([৳₹$]\s*[\d০-৯]+(?:\.[\d০-৯]+)?)\s*(?:টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর)?(?=$|[\s,।])/i,
    /(?:^|\s)([\d০-৯]+(?:\.[\d০-৯]+)?|[^\s,।]+)\s*(?:টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর)(?=$|[\s,।])/i,
    /(?:^|\s)([৳₹$]\s*[\d০-৯]+(?:\.[\d০-৯]+)?)(?=$|[\s,।])/i,
  ];

  for (const regex of priceRegexes) {
    const match = segment.match(regex);
    if (match) {
      const numPart = match[1].replace(/^[৳₹$]|^(?:tk|rs)\.?|[\/–-]+$|[৳₹$]$/gi, '').trim();
      const phrases = findNumberPhrases(numPart);
      let priceVal: number | null = null;
      if (phrases.length > 0) {
        priceVal = phrases[0].value;
      } else {
        const ascii = bnToAscii(numPart);
        if (/^\d+(\.\d+)?$/.test(ascii)) {
          priceVal = parseFloat(ascii);
        }
      }

      if (priceVal !== null && !isNaN(priceVal) && priceVal > 0) {
        let clean = segment.replace(match[0], ' ');
        // Also strip any redundant price mentions from the rest of the segment
        clean = clean
          .replace(
            /(?:[৳₹$]\s*[\d০-৯]+|[\d০-৯]+)\s*(?:টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর|টাকা)/gi,
            ' '
          )
          .replace(/\s+/g, ' ')
          .trim();
        return { statedPrice: priceVal, cleanSegment: clean };
      }
    }
  }

  // 2. Fallback using findNumberPhrases for written words e.g. "দশ টাকা দামের"
  const phrases = findNumberPhrases(segment);
  for (const phrase of phrases) {
    const after = segment.slice(phrase.end).trimStart();
    for (const token of ['টাকা দামের', 'টাকার দামের', 'টাকার', 'দামের', 'দামে', 'মূল্যের', 'টাকা']) {
      if (after.startsWith(token)) {
        if (token === 'টাকা' && !after.slice(token.length).trim()) {
          // Stated total at end of entire segment (skip)
          continue;
        }
        const cut = segment.indexOf(token, phrase.end) + token.length;
        const clean = (segment.slice(0, phrase.start) + ' ' + segment.slice(cut)).trim();
        return { statedPrice: phrase.value, cleanSegment: clean };
      }
    }
    if (phrase.isCurrency) {
      const clean = (segment.slice(0, phrase.start) + ' ' + segment.slice(phrase.end)).trim();
      return { statedPrice: phrase.value, cleanSegment: clean };
    }
  }

  return { statedPrice: null, cleanSegment: segment };
}

function getTailAfterProduct(rest: string, product: Product): string {
  const names = [
    product.nameBn ? normalizeBengali(product.nameBn) : '',
    product.name ? normalizeBengali(product.name) : '',
  ].filter(Boolean);

  const normRest = normalizeBengali(rest);
  let maxEnd = -1;

  for (const n of names) {
    const idx = normRest.indexOf(n);
    if (idx >= 0) {
      maxEnd = Math.max(maxEnd, idx + n.length);
    }
  }

  // Also check individual significant product words (e.g. "চিনি", "সাবান")
  if (maxEnd < 0) {
    for (const n of names) {
      for (const w of n.split(/\s+/)) {
        if (w.length >= 3) {
          const idx = normRest.indexOf(w);
          if (idx >= 0) {
            maxEnd = Math.max(maxEnd, idx + w.length);
          }
        }
      }
    }
  }

  if (maxEnd < 0) return '';
  const tailCand = normRest.slice(maxEnd).trim().replace(/^[,।\s]+/, '');
  // If the tail is just a bare quantity or unit that was part of this item (e.g. "দুইটা", "দুটো", "১টা", "২ কেজি"), it's not a new product!
  if (
    /^(?:[\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|দেড়|দেড়|আড়াই|আড়াই|আধা|আধ)?\s*(?:টা|টি|টে|টো|খানা|পিস|কেজি|গ্রাম|লিটার|পোয়া|পোয়া|প্যাকেট|প্যাক|ডজন|বোতল)?$/.test(
      tailCand
    )
  ) {
    return '';
  }
  return tailCand;
}

function parseItemSegment(
  products: Product[],
  rawSegment: string
): {
  item: DraftItem | null;
  ambiguity: Ambiguity | null;
  unknown: UnknownItem | null;
  cleanSegment: string;
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

  // Try matching original rest, and fallback to rest stripped of redundant price tokens
  const strippedPriceRest = rest
    .replace(
      /(?:[৳₹$]\s*[\d০-৯]+|[\d০-৯]+)\s*(?:টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর|টাকা)/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  let { matches, isAmbiguous } = searchProducts(products, rest);
  if (matches.length === 0 && strippedPriceRest && strippedPriceRest !== rest) {
    const fallbackSearch = searchProducts(products, strippedPriceRest);
    if (fallbackSearch.matches.length > 0) {
      matches = fallbackSearch.matches;
      isAmbiguous = fallbackSearch.isAmbiguous;
      rest = strippedPriceRest;
    }
  }

  if (matches.length === 0) {
    return {
      item: null,
      ambiguity: null,
      unknown: {
        text: rest || rawSegment,
        qty: qty || 1.0,
        statedPrice,
      },
      cleanSegment,
    };
  }

  let finalQty = (qty || 1.0) * unitFactor;

  // Stated price variant selection: "১০ টাকা দামের বিস্কুট" picks the 10-taka pack!
  if (statedPrice !== null) {
    const priceHits = matches.filter(
      (m) =>
        Math.abs(m.product.sellingPrice - statedPrice) < 0.01 ||
        (m.product.nameBn &&
          (m.product.nameBn.includes(`${statedPrice} টাকা`) ||
            m.product.nameBn.includes(`${formatBnNumber(statedPrice)} টাকা`))) ||
        (m.product.name &&
          (m.product.name.toLowerCase().includes(`rs. ${statedPrice}`) ||
            m.product.name.toLowerCase().includes(`rs ${statedPrice}`)))
    );

    if (priceHits.length >= 1) {
      const p = priceHits[0].product;
      const unitP = p.sellingPrice > 0 ? p.sellingPrice : statedPrice;
      return {
        item: {
          product: p,
          productId: p.id,
          name: p.name,
          nameBn: p.nameBn || p.name,
          qty: finalQty,
          unit: p.unit,
          unitPrice: unitP,
          lineTotal: Math.round(unitP * finalQty * 100) / 100,
          ambiguous: false,
        },
        ambiguity: null,
        unknown: null,
        cleanSegment,
      };
    }
  }

  const chosenProduct = matches[0].product;
  let lineTotal = Math.round(chosenProduct.sellingPrice * finalQty * 100) / 100;

  // Weight-based stated price e.g. "৭৫ টাকার চিনি"
  if (statedPrice !== null && (chosenProduct.unit === 'kg' || chosenProduct.unit === 'litre')) {
    if (chosenProduct.sellingPrice > 0) {
      finalQty = Math.round((statedPrice / chosenProduct.sellingPrice) * 1000) / 1000;
    }
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
    cleanSegment,
  };
}

export function parseComamCommand(
  text: string,
  products: Product[],
  customers: Customer[]
): ComamDraft {
  let raw = text.trim();
  raw = normalizeColonArtifacts(raw);
  raw = cleanSpokenPunctuation(raw);
  const norm = normalizeBengali(raw);

  // 1. Detect Specific Product Sales Query (e.g. "আজকে আমুল শক্তি কয়টা বিক্রি হয়েছে?", "আজ চিনি কতটুকু বিক্রি হলো?")
  const isAskingSaleQuantity =
    /বিক্রি|সেল|বিক্রয়/.test(raw) &&
    /কয়টা|কয়টি|কটা|কতটা|কতগুলো|কতটুকু|পরিমাণ|কত\s*পিস|কত\s*কেজি|কত\s*প্যাকেট|কত\s*টাকার|কতটাকা/.test(raw);

  if (isAskingSaleQuantity || (/বিক্রি|সেল/.test(raw) && !/সবচেয়ে|বেশি|কম|টপ|জনপ্রিয়|মোট\s*বিক্রি|আজ\s*কত\s*বিক্রি|আজকের\s*বিক্রি/.test(raw))) {
    const cleanedForProduct = raw
      .replace(/(আজকে?|গতকাল|এই\s*সপ্তাহে?|এই\s*মাসে?|কয়টা|কয়টি|কটা|কতটা|কতগুলো|কতটুকু|পরিমাণ|পিস|কেজি|প্যাকেট|টাকার|টাকা|বিক্রি|বিক্রয়|সেল|হয়েছে|হলো|বলুন|বলো|জানাও|তথ্য|রিপোর্ট|\?|।)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedForProduct.length >= 2) {
      const { matches } = searchProducts(products, cleanedForProduct, 1);
      if (matches.length > 0 && matches[0].score >= 0.52) {
        const targetProd = matches[0].product;
        const period: 'today' | 'week' | 'month' = /সপ্তাহ/.test(raw)
          ? 'week'
          : /মাস/.test(raw)
          ? 'month'
          : 'today';
        const prodTitle = targetProd.nameBn || targetProd.name;
        return {
          kind: 'report',
          raw,
          items: [],
          unknownItems: [],
          ambiguities: [],
          customer: null,
          paymentType: 'Cash',
          total: 0,
          report: 'product_sales',
          targetProduct: targetProd,
          period,
          summaryBn: `"${prodTitle}"-এর বিক্রয় তথ্য দেখা হচ্ছে।`,
          needsClarification: false,
        };
      }
    }
  }

  // 2. Detect General Reports Intent
  if (/বিক্রি|সেলস|লাভ|পরিসংখ্যান|হিসাব/.test(raw) && /কেমন|কত|আজ|আজকের|আজকে|সপ্তাহে|সপ্তাহের|মাসে|মাসের/.test(raw)) {
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
      summaryBn: /লাভ/.test(raw)
        ? 'আজকের বিক্রয় ও আনুমানিক লাভের হিসাব বের করা হচ্ছে।'
        : 'আজকের মোট বিক্রয়ের হিসাব বের করা হচ্ছে।',
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

  // 3. Detect Due Query Intent ("কার কত বাকি?", "লক্ষণ সরকারের বাকি কত?", "রহিমদার কত বাকি?")
  const hasDueWord = norm.includes('বাকি') || norm.includes('বকেয়া');
  const isQuestioningDue =
    /(?:^|\s)(কত|কার|কাদের|হিসাব|বলো|জানাও|দেখাও)(?:\s|$)/.test(norm) ||
    /^(কার|কাদের|মোট|সব|কত)\s*(?:বাকি|বকেয়া)/.test(norm);

  if (
    hasDueWord &&
    isQuestioningDue &&
    !/কেজি|গ্রাম|লিটার|পিস|প্যাকেট|ডজন|বোতল|\bটা\b|\bটি\b|দামের|টাকার\s+[^\s]+/.test(raw)
  ) {
    const { isGeneral, targetName } = extractDueQueryTarget(raw);

    if (isGeneral || !targetName) {
      return {
        kind: 'due_query',
        raw,
        items: [],
        unknownItems: [],
        ambiguities: [],
        customer: null,
        customerName: null,
        paymentType: 'Due',
        total: 0,
        summaryBn: 'সকল ক্রেতার বাকি হিসাব দেখা হচ্ছে।',
        needsClarification: false,
      };
    }

    // Specific customer due query
    const cust = findCustomer(customers, targetName) || findCustomer(customers, raw);
    if (cust) {
      return {
        kind: 'due_query',
        raw,
        items: [],
        unknownItems: [],
        ambiguities: [],
        customer: cust,
        customerName: (cust as any).nameBn || cust.name,
        paymentType: 'Due',
        total: 0,
        summaryBn: `${(cust as any).nameBn || cust.name}-এর বাকি হিসাব: ${formatBnTaka(cust.totalDue)}।`,
        needsClarification: false,
      };
    } else {
      return {
        kind: 'due_query',
        raw,
        items: [],
        unknownItems: [],
        ambiguities: [],
        customer: null,
        customerName: targetName,
        paymentType: 'Due',
        total: 0,
        summaryBn: `"${targetName}" নামে কোনো গ্রাহক খুঁজে পাওয়া যায়নি।`,
        needsClarification: false,
      };
    }
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

  // 5. Billing / Sale Command ("এক কেজি খোলা চিনি লক্ষণ সরকারের নামে বিল করো")
  const { customer, customerName, cleanItemsText, isExplicitDue } = extractCustomerClause(
    raw,
    customers,
    products
  );

  let paymentType: 'Cash' | 'Due' | 'UPI' = 'Cash';
  if (isExplicitDue || /বাকি|বাকিতে|খাতায়/.test(raw)) {
    paymentType = 'Due';
  } else if (/ইউপিআই|ইউপিআইতে|upi|gpay|paytm|phonepe|অনলাইন|অনলাইনে/.test(raw)) {
    paymentType = 'UPI';
  }

  const segments = splitSegments(cleanItemsText);
  const items: DraftItem[] = [];
  const unknownItems: UnknownItem[] = [];
  const ambiguities: Ambiguity[] = [];

  function consume(segText: string, depth = 0) {
    if (depth > 4) return;
    const cleanedSeg = segText
      .replace(/(?:^|\s)(?:নগদে?|বাকিতে?|ইউপিআই(?:তে)?|বিল(?:\s*করো)?|হল|হলো|এবং|আর|ও)(?=$|\s)/gi, ' ')
      .replace(/[।,;!?]/g, ' ')
      .trim();
    if (!cleanedSeg || cleanedSeg.length < 2) return;

    // Ensure segment contains actual product words, not just isolated numbers, units, filler words or price suffixes
    const productWordsOnly = cleanedSeg
      .replace(/(?:[৳₹$]\s*[\d০-৯]+|[\d০-৯]+(?:\.[\d০-৯]+)?)/g, ' ')
      .replace(
        /(টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর|টাকা|পিস|টা|টি|টে|টো|খানা|কেজি|গ্রাম|লিটার|পোয়া|পোয়া|প্যাকেট|প্যাক|ডজন|বোতল)/gi,
        ' '
      )
      .replace(
        /(?:^|[\s।,;!?])(?:এক|দুই|দুটো|দুইটা|একটা|তিন|তিনটা|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|এগারো|বারো|তেরো|চৌদ্দ|পনেরো|ষোলো|সতেরো|আঠারো|উনিশ|কুড়ি|বিশ|তিরিশ|চল্লিশ|পঞ্চাশ|ষাট|সত্তর|আশি|নব্বই|একশো|শত|হাজার|আধা|আধ|হাফ|দেড়|দেড়|আড়াই|আড়াই|পৌনে|সোয়া|কমা|দাঁড়ি|দাড়ি|ফুলস্টপ|হল|হলো|এবং|আর|ও)(?=$|[\s।,;!?])/gi,
        ' '
      )
      .replace(/[\s।,;!?]+/g, ' ')
      .trim();
    if (!productWordsOnly || productWordsOnly.length < 2) return;

    const res = parseItemSegment(products, cleanedSeg);
    if (res.item) {
      items.push(res.item);
      const tail = getTailAfterProduct(res.cleanSegment, res.item.product);
      if (
        tail &&
        (findNumberPhrases(tail).length > 0 ||
          /(\S+?)(টে|টা|টি|টো|খানা|কেজি|গ্রাম|লিটার)/.test(tail))
      ) {
        consume(tail, depth + 1);
      }
    }
    if (res.ambiguity) {
      ambiguities.push(res.ambiguity);
    }
    if (res.unknown) {
      // Strip price and filler residues from unknown product text
      const cleanUnknown = res.unknown.text
        .replace(/^[৳₹$]\s*[\d০-৯]+(?:\.[\d০-৯]+)?/gi, '')
        .replace(/(টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর|বিল|করো|দিন|দাও)/gi, '')
        .trim();

      const isIgnorableWord =
        /^(?:[\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|দেড়|দেড়|আড়াই|আড়াই|আধা|আধ)?\s*(?:টা|টি|টে|টো|খানা|পিস|কেজি|গ্রাম|লিটার|পোয়া|পোয়া|প্যাকেট|প্যাক|ডজন|বোতল|কমা|দাঁড়ি|দাড়ি|ফুলস্টপ)?$/i.test(
          cleanUnknown
        ) ||
        cleanUnknown === 'কমা' ||
        cleanUnknown === 'দাঁড়ি' ||
        cleanUnknown === 'ফুলস্টপ';

      if (cleanUnknown.length >= 2 && !isIgnorableWord) {
        unknownItems.push({
          ...res.unknown,
          text: cleanUnknown,
        });
      }
    }
  }

  for (const seg of segments) {
    consume(seg);
  }

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // Generate Bengali summary for human readback
  let summaryBn = '';
  if (items.length > 0) {
    const itemSummaries = items.map(
      (it) => `${it.nameBn || it.name} (${formatBnNumber(it.qty)} ${it.unit})`
    );
    summaryBn = `${itemSummaries.join(', ')} — মোট ${formatBnTaka(total)}`;

    const hasUnknownCustomer = Boolean(customerName && !customer);
    const custName = customer?.name || customerName;
    if (custName) {
      if (paymentType === 'Due') {
        summaryBn += ` (${custName}-এর নামে বাকি)`;
      } else if (paymentType === 'UPI') {
        summaryBn += ` (${custName}-এর নামে ইউপিআই)`;
      } else {
        summaryBn += ` (${custName}-এর নামে বিল)`;
      }
      if (hasUnknownCustomer) {
        summaryBn += ` — সতর্কতা: "${customerName}" গ্রাহক তালিকায় নেই, নতুন তৈরি করতে পারেন।`;
      }
    } else {
      if (paymentType === 'Due') {
        summaryBn += ` (বাকি)`;
      } else if (paymentType === 'UPI') {
        summaryBn += ' (ইউপিআই)';
      } else {
        summaryBn += ' (নগদ)';
      }
    }
  } else if (unknownItems.length > 0) {
    summaryBn = `ক্যাটালগে মেলেনি: ${unknownItems.map((u) => u.text).join(', ')}`;
  } else {
    summaryBn = 'কথাটি বুঝতে পারিনি — আবার বলবেন?';
  }

  const hasUnknownCustomer = Boolean(customerName && !customer);

  return {
    kind: items.length > 0 ? 'sale' : 'unknown',
    raw,
    items,
    unknownItems,
    ambiguities,
    customer,
    customerName: customer ? ((customer as any).nameBn || customerName || customer.name) : customerName,
    hasUnknownCustomer,
    paymentType,
    total: Math.round(total * 100) / 100,
    summaryBn,
    needsClarification: ambiguities.length > 0,
  };
}
