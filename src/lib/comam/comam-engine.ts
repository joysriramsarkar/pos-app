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
  expandQueryAliases,
  getProductNames,
  BRAND_ALIASES,
  GENERIC_CATEGORY_WORDS,
  normalizeBengali,
  phoneticKeyBn,
  phoneticKeyFromNormalized,
  searchProducts,
  stringSimilarity,
  stripBengaliSuffixes,
  tokenPhoneticSimilarity,
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

const SPLIT_NUM_WORDS = new Set([
  'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ', 'এগারো', 'বারো',
  'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ', 'কুড়ি', 'বিশ', 'তিরিশ',
  'চল্লিশ', 'পঞ্চাশ', 'ষাট', 'সত্তর', 'আশি', 'নব্বই', 'একশ', 'একশো', 'শত', 'হাজার', 'দু',
  'ওয়ান', 'ওয়ান', 'টু', 'থ্রি', 'ফোর', 'ফাইভ', 'সিক্স', 'এইট', 'নাইন', 'টেন',
]);
const SPLIT_FRACTION_WORDS = new Set(['আধা', 'আধ', 'হাফ', 'দেড়', 'দেড়', 'আড়াই', 'আড়াই', 'পৌনে', 'পোনে', 'সোয়া', 'সাড়ে']);
const SPLIT_PRICE_WORDS = new Set(['টাকা', 'টাকার', 'দামের', 'দামে', 'দর', 'মূল্যের']);
const SPLIT_FILLER_WORDS = new Set(['দাও', 'দিন', 'দেন', 'নাও', 'করো', 'করুন', 'চাই', 'বিল', 'এবং', 'আর', 'ও', 'হল', 'হলো']);

function isPieceQuantityToken(tok: string): boolean {
  return /^(?:এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|ওয়ান|ওয়ান|টু|থ্রি|ফোর|ফাইভ|সিক্স|এইট|নাইন|টেন|এগারো|বারো|তেরো|চৌদ্দ|পনেরো|ষোলো|সতেরো|আঠারো|উনিশ|কুড়ি|বিশ|দু|[\d০-৯]+)(?:টা|টি|টে|টো|খানা)$/.test(tok);
}

function isQuantityStarter(tok: string): boolean {
  return (
    isPieceQuantityToken(tok) ||
    SPLIT_NUM_WORDS.has(tok) ||
    SPLIT_FRACTION_WORDS.has(tok) ||
    /^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(tok) ||
    /^[৳₹$]/.test(tok)
  );
}

/** True when a real product word follows the quantity at tokens[i] (skipping
 * units and stated-price phrases like "১০ টাকা দামের"). A quantity followed
 * only by another quantity is a trailing quantity of the previous item
 * (e.g. "কোকাকোলা দুইটা"), not the start of a new item. */
function hasProductAhead(tokens: string[], i: number): boolean {
  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (UNITS[t] || SPLIT_PRICE_WORDS.has(t) || SPLIT_FILLER_WORDS.has(t)) continue;
    if (/^[৳₹$]/.test(t)) continue;
    // A bare number directly before a price word is a stated price, skip it.
    if (/^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(t) && j + 1 < tokens.length && SPLIT_PRICE_WORDS.has(tokens[j + 1])) continue;
    if (isQuantityStarter(t)) return false;
    if (t.length >= 2) return true;
  }
  return false;
}

/**
 * Split a comma-less run of quantity-led items into one chunk per item:
 * "একটা আমুল চকলেট সিরাপ একটা আমুল ডার্ক চকলেট একটা আমুল শক্তি দুধ"
 *  -> ["একটা আমুল চকলেট সিরাপ", "একটা আমুল ডার্ক চকলেট", "একটা আমুল শক্তি দুধ"]
 * A new chunk starts at a quantity word only when the current chunk already
 * has its own quantity and product words — so trailing quantities
 * ("কোকাকোলা দুইটা", "চিনি ২ কেজি") never split their own item in half.
 */
function splitQuantityLedItems(part: string): string[] {
  const tokens = part.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return [part];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentHasQty = false;
  let currentHasProduct = false;
  // Only quantity-LED chunks ("একটা X একটা Y") split at the next quantity.
  // In a product-first chunk ("চিনি দুই কেজি সাবান তিনটা") the quantity
  // after a product word is that product's own trailing quantity, so the
  // chunk must stay whole (the product-name splitter handles it instead).
  let currentIsQtyLed = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (
      current.length > 0 &&
      currentIsQtyLed &&
      isQuantityStarter(tok) &&
      currentHasQty &&
      currentHasProduct &&
      hasProductAhead(tokens, i)
    ) {
      chunks.push(current.join(' '));
      current = [];
      currentHasQty = false;
      currentHasProduct = false;
      currentIsQtyLed = false;
    }
    if (current.length === 0) {
      currentIsQtyLed = isQuantityStarter(tok) || /^[৳₹$]/.test(tok);
    }
    current.push(tok);
    if (isQuantityStarter(tok)) {
      currentHasQty = true;
    } else if (!UNITS[tok] && !SPLIT_PRICE_WORDS.has(tok) && !SPLIT_FILLER_WORDS.has(tok) && tok.length >= 2) {
      currentHasProduct = true;
    }
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
}

function splitSegments(text: string): string[] {
  // Normalize colon artifact in speech recognition (e.g., "1:10 টাকা" -> "১০ টাকা") and clean spoken punctuation
  let normalized = normalizeColonArtifacts(text);
  normalized = cleanSpokenPunctuation(normalized);

  // First split by explicit separators: comma, 'এবং', 'আর', 'ও'.
  // The danda '।' is NOT a separator: ASR drops it at mere pauses, often
  // in the middle of one item ("নেভিকাড। সিগারেট পাঁচটা গোল্ডফ্রেক"),
  // so it is treated as a space and product names mark item boundaries.
  normalized = normalized.replace(/।/g, ' ');
  const rawParts = normalized
    .split(/[,،\n;]| এবং | আর | ও /g)
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

    for (const sub of subParts) {
      result.push(...splitQuantityLedItems(sub));
    }
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

function getTailAfterProduct(rest: string, product: Product, products?: Product[]): string {
  const names = getProductNames(product);
  const normRest = normalizeBengali(rest);
  const fold = (s: string) => s.replace(/ী/g, 'ি').replace(/ূ/g, 'ু');
  const foldedRest = fold(normRest);
  let maxEnd = -1;

  for (const n of names) {
    const foldedN = fold(n);
    const idx = foldedRest.indexOf(foldedN);
    if (idx >= 0) {
      maxEnd = Math.max(maxEnd, idx + foldedN.length);
    }
  }

  // Also check individual significant product words (e.g. "চিনি", "সাবান")
  if (maxEnd < 0) {
    const restTokens = normRest.split(/\s+/).filter(Boolean);
    for (const n of names) {
      for (const w of n.split(/\s+/)) {
        if (w.length >= 3) {
          const foldedW = fold(w);
          let currPos = 0;
          for (const tok of restTokens) {
            const tokPos = normRest.indexOf(tok, currPos);
            const foldedTok = fold(tok);
            if (
              foldedTok === foldedW ||
              stripBengaliSuffixes(foldedTok) === stripBengaliSuffixes(foldedW) ||
              BRAND_ALIASES[foldedW]?.includes(foldedTok) ||
              BRAND_ALIASES[foldedTok]?.includes(foldedW)
            ) {
              maxEnd = Math.max(maxEnd, tokPos + tok.length);
            }
            currPos = tokPos + tok.length;
          }
        }
      }
    }
  }

  if (maxEnd < 0) return '';
  let tailCand = normRest.slice(maxEnd).trim().replace(/^[,।\s]+/, '');

  // Advance past any trailing generic category descriptor (e.g. "বিস্কুট" after "মেরী", "দুধ" after "আমুল শক্তি", "সিগারেট" after "নেভিকাট")
  const firstWord = tailCand.split(/\s+/)[0];
  if (
    firstWord &&
    (GENERIC_CATEGORY_WORDS.has(firstWord) ||
      GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(firstWord)))
  ) {
    tailCand = tailCand.slice(firstWord.length).trim().replace(/^[,।\s]+/, '');
  }

  // If the tail is just a bare quantity or unit that was part of this item (e.g. "দুইটা", "দুটো", "১টা", "২ কেজি"), it's not a new product!
  if (
    /^(?:[\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|দেড়|দেড়|আড়াই|আড়াই|আধা|আধ)?\s*(?:টা|টি|টে|টো|খানা|পিস|কেজি|গ্রাম|লিটার|পোয়া|পোয়া|প্যাকেট|প্যাক|ডজন|বোতল)?$/.test(
      tailCand
    ) ||
    GENERIC_CATEGORY_WORDS.has(tailCand) ||
    GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(tailCand))
  ) {
    return '';
  }

  // A lone word without its own quantity trailing a matched item is a descriptor residue,
  // unless it matches a completely different catalog product with high confidence
  const candWords = tailCand.split(/\s+/).filter(Boolean);
  if (candWords.length === 1 && !isQuantityStarter(candWords[0])) {
    if (products && products.length > 0) {
      const { matches } = searchProducts(products, tailCand);
      if (matches.length === 0 || matches[0].score < 0.88 || matches[0].product.id === product.id) {
        return '';
      }
    } else {
      return '';
    }
  }

  return tailCand;
}

function tokensEqualForProduct(a: string, b: string): boolean {
  const na = normalizeBengali(a);
  const nb = normalizeBengali(b);
  if (!na || !nb) return false;
  const fold = (s: string) => s.replace(/ী/g, 'ি').replace(/ূ/g, 'ু');
  return na === nb || fold(na) === fold(nb) || stripBengaliSuffixes(na) === stripBengaliSuffixes(nb);
}

/**
 * Product-anchored split: when one comma-less segment names two or more
 * catalog products ("চিনি দুই কেজি সাবান তিনটা ডিম এক ডজন", or
 * "আমুল ডার্ক চকলেট দুইটা আমুল চকলেট সিরাপ একটা"), split right before
 * each product name after the first. Quantities stay attached to the
 * product they belong to, whichever side of the name they were spoken on.
 */
export function splitByKnownProducts(products: Product[], segment: string): string[] {
  const tokens = segment.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return [segment];

  const forms = getNameForms(products);
  if (forms.length === 0) return [segment];

  const normTokens = tokens.map((t) => normalizeBengali(t));
  const textKeys = tokens.map((t) => phoneticKeyBn(t));
  const fold = (s: string) => s.replace(/ী/g, 'ি').replace(/ূ/g, 'ু');

  function tokenMatch(ti: number, form: NameForm, ni: number): boolean {
    if (normTokens[ti] === form.tokens[ni]) return true;
    if (fold(normTokens[ti]) === fold(form.tokens[ni])) return true;
    // Phonetic-skeleton equality only for substantive keys, so short
    // words ("এক", "হল") can never anchor a product by sound alone.
    // Single-token product names need an exact/folded match: with all
    // vowels stripped, unrelated words collide ("সেভেন" ~ "সাবান").
    if (form.tokens.length < 2) return false;
    return textKeys[ti].length >= 3 && textKeys[ti] === form.keys[ni];
  }

  // A heard token can cover two catalog tokens when ASR joins words
  // ("গোল্ডফ্রেক" = গোল্ড+ফ্ল্যাক, "পেপারবোর্ড" = পেপার+বোট), or the reverse
  // when it splits them — matching on phonetic skeletons keeps this cheap.
  function matchSeqAt(ti: number, form: NameForm, ni: number, skipsLeft = 2): number {
    if (ni >= form.tokens.length) return ti;
    if (ti >= tokens.length) return -1;
    if (tokenMatch(ti, form, ni)) {
      const r = matchSeqAt(ti + 1, form, ni + 1, skipsLeft);
      if (r >= 0) return r;
    }
    // Allow omitting a trailing generic category token (e.g. speaker said "গোল্ড ফ্ল্যাক" for "গোল্ড ফ্ল্যাক সিগারেট")
    // Finish the match immediately at ti WITHOUT skipping ahead through subsequent products!
    // Only valid if no other tokens were skipped!
    if (ni === form.tokens.length - 1 && GENERIC_CATEGORY_WORDS.has(form.tokens[ni]) && skipsLeft === 2) {
      return ti;
    }
    if (ni > 0 && skipsLeft > 0) {
      const r = matchSeqAt(ti + 1, form, ni, skipsLeft - 1);
      if (r >= 0) return r;
    }
    // Allow skipping a middle catalog token that speaker omitted (e.g. "আমুল কোকা কফি" -> "আমুল ... কফি")
    if (ni > 0 && ni + 1 < form.tokens.length && skipsLeft > 0) {
      const r = matchSeqAt(ti, form, ni + 1, skipsLeft - 1);
      if (r >= 0) return r;
    }
    const concatKey = ni + 1 < form.tokens.length ? form.keys[ni] + form.keys[ni + 1] : '';
    // Length ratio guard: a heard token may only stand for two catalog
    // tokens when their skeletons are near-equal in length too — a mere
    // prefix ("ময়দা" for "ময়দা খোলা") is one token, not a joined pair.
    const lenRatio1 =
      concatKey.length > 0
        ? Math.min(textKeys[ti].length, concatKey.length) / Math.max(textKeys[ti].length, concatKey.length)
        : 0;
    if (
      ni + 1 < form.tokens.length &&
      textKeys[ti].length >= 3 &&
      (textKeys[ti] === concatKey ||
        (concatKey.length >= 4 && lenRatio1 >= 0.75 && stringSimilarity(textKeys[ti], concatKey) >= 0.85))
    ) {
      const r = matchSeqAt(ti + 1, form, ni + 2, skipsLeft);
      if (r >= 0) return r;
    }
    const joinedHeardKey = ti + 1 < tokens.length ? textKeys[ti] + textKeys[ti + 1] : '';
    const lenRatio2 =
      form.keys[ni].length > 0 && joinedHeardKey.length > 0
        ? Math.min(joinedHeardKey.length, form.keys[ni].length) / Math.max(joinedHeardKey.length, form.keys[ni].length)
        : 0;
    if (
      ti + 1 < tokens.length &&
      form.keys[ni].length >= 3 &&
      (joinedHeardKey === form.keys[ni] ||
        (form.keys[ni].length >= 4 &&
          lenRatio2 >= 0.75 &&
          stringSimilarity(joinedHeardKey, form.keys[ni]) >= 0.85))
    ) {
      const r = matchSeqAt(ti + 2, form, ni + 1, skipsLeft);
      if (r >= 0) return r;
    }
    return -1;
  }

  const formsByFirstToken = new Map<string, NameForm[]>();
  for (const form of forms) {
    for (const bucketKey of [form.tokens[0], form.keys[0]]) {
      const arr = formsByFirstToken.get(bucketKey);
      if (arr) arr.push(form);
      else formsByFirstToken.set(bucketKey, [form]);
    }
  }
  const candidateForms = (ti: number): NameForm[] => {
    const seen = new Set<NameForm>();
    const out: NameForm[] = [];
    for (const bucketKey of [normTokens[ti], textKeys[ti]]) {
      for (const f of formsByFirstToken.get(bucketKey) || []) {
        if (!seen.has(f)) {
          seen.add(f);
          out.push(f);
        }
      }
    }
    // Joined ASR tokens ("গোল্ডফ্রেক" for গোল্ড+ফ্ল্যাক) start with the
    // first name token's skeleton: include forms whose first key is a
    // prefix of (or prefixed by) the heard token's key.
    const heardKey = textKeys[ti];
    if (heardKey.length >= 3) {
      for (const form of forms) {
        const firstKey = form.keys[0];
        if (
          firstKey.length >= 3 &&
          (heardKey.startsWith(firstKey) || firstKey.startsWith(heardKey)) &&
          !seen.has(form)
        ) {
          seen.add(form);
          out.push(form);
        }
      }
    }
    return out;
  };

  const occurrences: Array<{ start: number; end: number; seqLen: number }> = [];
  for (let start = 0; start < tokens.length; start++) {
    const prevOcc = occurrences[occurrences.length - 1];
    if (
      prevOcc &&
      start === prevOcc.end &&
      (GENERIC_CATEGORY_WORDS.has(tokens[start]) ||
        GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(tokens[start])))
    ) {
      continue;
    }
    let bestSeqLen = 0;
    let bestEnd = -1;
    for (const form of candidateForms(start)) {
      if (form.tokens.length < bestSeqLen) continue;
      const end = matchSeqAt(start, form, 0);
      if (end > start && (form.tokens.length > bestSeqLen || end > bestEnd)) {
        bestSeqLen = form.tokens.length;
        bestEnd = end;
      }
    }
    if (bestEnd <= start) {
      // No full name here: try a distinctive first-token (brand) anchor.
      for (const form of candidateForms(start)) {
        if (form.tokens.length < 2) continue;
        if (!tokenMatch(start, form, 0)) continue;
        const first = form.tokens[0];
        const sharingFirst = forms.filter((f) => f.tokens[0] === first).length;
        const appearsMidName = forms.some(
          (f) => f.tokens.slice(1).includes(first)
        );
        if (
          sharingFirst <= 40 &&
          !appearsMidName &&
          first.length >= 3 &&
          !GENERIC_CATEGORY_WORDS.has(first) &&
          !GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(first))
        ) {
          bestSeqLen = 1;
          bestEnd = start + 1;
        }
        break;
      }
    }
    if (bestEnd > start) {
      // A lone-token anchor right after a word that completes a longer
      // catalog name with it ("খোলা চিনি" spoken for "চিনি খোলা") is part
      // of that name, not the start of a new item.
      if (bestSeqLen === 1 && start > 0) {
        const pair = [normTokens[start - 1], normTokens[start]];
        const partOfLonger = forms.some(
          (f) =>
            f.tokens.length >= 2 &&
            pair.every((w) => f.tokens.includes(w)) &&
            !(f.tokens.length === 1)
        );
        if (partOfLonger) continue;
      }
      const prev = occurrences[occurrences.length - 1];
      if (!prev || start >= prev.end) {
        occurrences.push({ start, end: bestEnd, seqLen: bestSeqLen });
      }
    }
  }

  if (occurrences.length < 2) return [segment];

  // Decide which item a quantity in the gap between two product names
  // belongs to: if the following product already has its own quantity
  // after its name, the gap quantity closes the previous item
  // ("নেভিকাড সিগারেট পাঁচটা | গোল্ডফ্রেক সিগারেট দশটা"); otherwise it
  // leads the next item ("...সিরাপ | একটা আমুল ডার্ক চকলেট").
  const boundaries: number[] = [0];
  for (let i = 1; i < occurrences.length; i++) {
    const gapStart = occurrences[i - 1].end;
    const occStart = occurrences[i].start;
    let gapQtyAt = -1;
    for (let j = gapStart; j < occStart; j++) {
      if (isQuantityStarter(tokens[j].replace(/[।,;!?]+$/, ''))) {
        gapQtyAt = j;
        break;
      }
    }
    if (gapQtyAt < 0) {
      boundaries.push(occStart);
      continue;
    }
    // If the gap starts with a stated price phrase for the next product
    // (e.g. "চিনি 10 টাকার বিস্কুট" or "সেভেন আপ ৳10 দামের হলুদ"):
    // the price leads the next item, so split right before the price.
    const isPriceWord = (t: string) => SPLIT_PRICE_WORDS.has(t) || /^[৳₹$]/.test(t);
    const gapStartsWithPrice =
      isPriceWord(tokens[gapQtyAt].replace(/[।,;!?]+$/, '')) ||
      (gapQtyAt + 1 < occStart &&
        isPriceWord(tokens[gapQtyAt + 1].replace(/[।,;!?]+$/, '')) &&
        !isPieceQuantityToken(tokens[gapQtyAt].replace(/[।,;!?]+$/, '')));

    if (gapStartsWithPrice) {
      boundaries.push(gapQtyAt);
      continue;
    }
    // Two quantities in one gap ("সেভেন আপ 2টা 01 কেজি চিনি"): the first,
    // spoken right after the previous product, is its trailing quantity;
    // the second leads the next item. Split between them.
    if (gapQtyAt === gapStart) {
      let firstGroupEnd = gapQtyAt + 1;
      while (
        firstGroupEnd < occStart &&
        UNITS[tokens[firstGroupEnd].replace(/[।,;!?]+$/, '')]
      ) {
        firstGroupEnd++;
      }
      let secondQtyAt = -1;
      for (let j = firstGroupEnd; j < occStart; j++) {
        if (isQuantityStarter(tokens[j].replace(/[।,;!?]+$/, ''))) {
          secondQtyAt = j;
          break;
        }
      }
      if (secondQtyAt >= 0) {
        boundaries.push(secondQtyAt);
        continue;
      }
    }
    const afterEnd = i + 1 < occurrences.length ? occurrences[i + 1].start : tokens.length;
    let nextHasOwnQty = false;
    for (let j = occurrences[i].end; j < afterEnd; j++) {
      if (isQuantityStarter(tokens[j].replace(/[।,;!?]+$/, ''))) {
        nextHasOwnQty = true;
        break;
      }
    }
    boundaries.push(nextHasOwnQty ? occStart : gapQtyAt);
  }

  const chunks: string[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const from = boundaries[i];
    const to = i + 1 < boundaries.length ? boundaries[i + 1] : tokens.length;
    const chunk = tokens.slice(from, to).join(' ').trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks.length > 1 ? chunks : [segment];
}

interface NameForm {
  tokens: string[];
  keys: string[];
}

const nameFormsCache = new WeakMap<Product[], NameForm[]>();

function getNameForms(products: Product[]): NameForm[] {
  let forms = nameFormsCache.get(products);
  if (forms) return forms;
  forms = [];
  const seen = new Set<string>();
  for (const p of products) {
    if (p.isActive === false) continue;
    for (const rawName of [p.nameBn, p.name]) {
      if (!rawName) continue;
      const seq = normalizeBengali(rawName).split(/\s+/).filter(Boolean);
      if (seq.length === 0) continue;

      const isSingleCategoryWord = (toks: string[]) =>
        toks.length === 1 &&
        (GENERIC_CATEGORY_WORDS.has(toks[0]) || GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(toks[0])));

      const fullKey = seq.join(' ');
      if (!seen.has(fullKey) && (seq.length >= 2 || (seq.length === 1 && seq[0].length >= 3))) {
        seen.add(fullKey);
        forms.push({ tokens: seq, keys: seq.map((t) => phoneticKeyFromNormalized(t)) });
      }

      // Core form: strip trailing prices (e.g. "৯০ টাকা", "২০ টাকা", "১০") and packaging units
      const core: string[] = [];
      for (let i = 0; i < seq.length; i++) {
        const t = seq[i];
        if (
          /^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(t) &&
          i + 1 < seq.length &&
          ['টাকা', 'গ্রাম', 'কেজি', 'লিটার', 'মিলি', 'প্যাকেট', 'পিস'].includes(seq[i + 1])
        ) {
          break;
        }
        if (i === seq.length - 2 && /^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(t) && seq[i + 1] === 'টাকা') {
          break;
        }
        if (i === seq.length - 1 && (/^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(t) || t === 'টাকা')) {
          break;
        }
        core.push(t);
      }

      const coreKey = core.join(' ');
      if (
        core.length > 0 &&
        core.length < seq.length &&
        !seen.has(coreKey) &&
        (core.length >= 2 || (core.length === 1 && core[0].length >= 3 && !isSingleCategoryWord(core)))
      ) {
        seen.add(coreKey);
        forms.push({ tokens: core, keys: core.map((t) => phoneticKeyFromNormalized(t)) });
      }

      // If core ends with a generic category word and has preceding brand words, strip it to create brand form
      if (core.length >= 2 && GENERIC_CATEGORY_WORDS.has(core[core.length - 1])) {
        const brandOnly = core.slice(0, -1);
        const brandKey = brandOnly.join(' ');
        if (
          !seen.has(brandKey) &&
          (brandOnly.length >= 2 || (brandOnly.length === 1 && brandOnly[0].length >= 3 && !isSingleCategoryWord(brandOnly)))
        ) {
          seen.add(brandKey);
          forms.push({ tokens: brandOnly, keys: brandOnly.map((t) => phoneticKeyFromNormalized(t)) });
        }
      }
    }
  }
  // Sort longer forms first so greedy matching prioritizes more specific multi-token names
  forms.sort((a, b) => b.tokens.length - a.tokens.length);
  nameFormsCache.set(products, forms);
  return forms;
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

  let spokenUnitWord = false;
  if (qtySpan) {
    const after = segment.slice(qtySpan[1]).trim();
    const sortedUnits = Object.entries(UNITS).sort((a, b) => b[0].length - a[0].length);
    for (const [unitWord, def] of sortedUnits) {
      if (after.startsWith(unitWord)) {
        unitFactor = def.factor;
        spokenUnitWord = true;
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

  // Price-echo guard: catalog names often embed their price ("আমুল
  // শক্তি ৩৩ টাকা"). A bare number phrase equal to the matched product's
  // price, with no unit spoken, echoes that name — not a quantity.
  if (qtySpan && qty !== null && !spokenUnitWord) {
    const chosen = matches[0].product;
    if (Math.abs(chosen.sellingPrice - qty) < 0.01) {
      const nameText = `${chosen.nameBn || ''} ${chosen.name || ''}`;
      if (
        nameText.includes(formatBnNumber(qty)) ||
        nameText.toLowerCase().includes(String(qty))
      ) {
        finalQty = 1.0;
      }
    }
  }

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

export function dedupeConsecutiveWords(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    const prev = out[out.length - 1];
    if (prev && normalizeBengali(prev) === normalizeBengali(tok)) continue;
    out.push(tok);
  }
  return out.join(' ');
}

export function parseComamCommand(
  text: string,
  products: Product[],
  customers: Customer[]
): ComamDraft {
  let raw = text.trim();
  raw = normalizeColonArtifacts(raw);
  raw = cleanSpokenPunctuation(raw);
  raw = dedupeConsecutiveWords(raw);
  // Clean nasalized breath / pause hesitation artifact where ASR transcribes "৫ এবং" before conjunction
  raw = raw.replace(/(?:^|\s)৫\s+(?=এবং|আর|ও\b)/g, ' ');
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

  // Product-anchored split of the WHOLE utterance first: ASR punctuation
  // (। ,) lands at speech pauses, often in the middle of one item, so
  // catalog product names — matched phonetically — are the reliable item
  // boundaries. The punctuation/quantity splitters remain the fallback.
  const anchoredSegments = splitByKnownProducts(products, cleanItemsText);
  // Anchored chunks can still contain a trailing "এবং <item>" the anchor
  // pass could not see (e.g. a price-led item spoken by price + short
  // name), so each chunk goes through the regular segment splitter too.
  const segments =
    anchoredSegments.length > 1
      ? anchoredSegments.flatMap((chunk) =>
          chunk
            .split(/ এবং | আর | ও /g)
            .map((s) => s.trim())
            .filter(Boolean)
            .flatMap((part) => splitQuantityLedItems(part))
        )
      : splitSegments(cleanItemsText);
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

    // One segment can still hide several product-first items with no
    // separator at all ("চিনি দুই কেজি সাবান তিনটা"): split on catalog
    // product names and parse each piece as its own item.
    if (depth < 4) {
      const productChunks = splitByKnownProducts(products, cleanedSeg);
      if (productChunks.length > 1) {
        for (const chunk of productChunks) {
          consume(chunk, depth + 1);
        }
        return;
      }
    }

    const res = parseItemSegment(products, cleanedSeg);
    if (res.item) {
      items.push(res.item);
      const tail = getTailAfterProduct(res.cleanSegment, res.item.product, products);
      if (
        tail &&
        (findNumberPhrases(tail).length > 0 ||
          /(\S+?)(টে|টা|টি|টো|খানা|কেজি|গ্রাম|লিটার)/.test(tail) ||
          searchProducts(products, tail).matches.length > 0)
      ) {
        // Name-continuation guard: a quantity-less tail whose first
        // content word belongs to the just-billed product's own name is
        // the remainder of that name — never bill it as a second product.
        const tailContentWords = tail
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => t.replace(/[।,;!?]+$/, ''))
          .filter(
            (t) =>
              !isQuantityStarter(t) &&
              !UNITS[t] &&
              !['এবং', 'আর', 'ও'].includes(t)
          );
        const foldV = (x: string) => x.replace(/ী/g, 'ি').replace(/ূ/g, 'ু');
        const ownNameTokens = `${res.item.product.nameBn || ''} ${res.item.product.name || ''}`
          .split(/\s+/)
          .map((t) => foldV(normalizeBengali(t)));
        const tailHasQty =
          findNumberPhrases(tail).length > 0 ||
          /(\S+?)(টে|টা|টি|টো|খানা)/.test(tail);
        if (
          tailContentWords.length > 0 &&
          !tailHasQty &&
          ownNameTokens.includes(foldV(normalizeBengali(tailContentWords[0])))
        ) {
          // skip tail consumption entirely
        } else if (true) {
        // Descriptor guard: strip the quantity this item already used;
        // if one generic word remains and it is just a descriptor token
        // (a word of this product's name, or a category word shared by
        // several products like দুধ/সিগারেট), it is not another item.
        const tailWords = tail.split(/\s+/).filter(Boolean);
        let wi = 0;
        while (
          wi < tailWords.length &&
          (isQuantityStarter(tailWords[wi].replace(/[।,;!?]+$/, '')) ||
            UNITS[tailWords[wi].replace(/[।,;!?]+$/, '')])
        ) {
          wi++;
        }
        const residue = tailWords.slice(wi);
        let isDescriptorResidue = false;
        if (residue.length === 1) {
          const w = normalizeBengali(residue[0]);
          const ownTokens = `${res.item.product.nameBn || ''} ${res.item.product.name || ''}`
            .split(/\s+/)
            .map((t) => normalizeBengali(t));
          const sharedCount = products.filter((p) =>
            `${p.nameBn || ''} ${p.name || ''}`
              .split(/\s+/)
              .map((t) => normalizeBengali(t))
              .includes(w)
          ).length;
          isDescriptorResidue =
            ownTokens.includes(w) ||
            sharedCount >= 2 ||
            GENERIC_CATEGORY_WORDS.has(w) ||
            GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(w));
        }
        if (!isDescriptorResidue) {
          consume(tail, depth + 1);
        }
        }
      }
    }
    if (res.ambiguity) {
      ambiguities.push(res.ambiguity);
    }
    if (res.unknown) {
      // If segment is multi-word (>= 3 words) and failed to match as a single item,
      // try to extract any identifiable catalog product from inside it before declaring unknown!
      const segTokens = cleanedSeg.split(/\s+/).filter(Boolean);
      if (segTokens.length >= 3 && depth < 4) {
        let bestSub: { start: number; end: number; score: number } | null = null;
        for (let win = Math.min(segTokens.length - 1, 4); win >= 2; win--) {
          for (let s = 0; s + win <= segTokens.length; s++) {
            const subStr = segTokens.slice(s, s + win).join(' ');
            const { matches } = searchProducts(products, subStr);
            if (matches.length > 0 && matches[0].score >= 0.88) {
              if (!bestSub || matches[0].score > bestSub.score || win > (bestSub.end - bestSub.start)) {
                bestSub = { start: s, end: s + win, score: matches[0].score };
              }
            }
          }
        }
        if (bestSub) {
          const before = segTokens.slice(0, bestSub.start).join(' ').trim();
          const matchChunk = segTokens.slice(bestSub.start, bestSub.end).join(' ').trim();
          const after = segTokens.slice(bestSub.end).join(' ').trim();
          if (before) consume(before, depth + 1);
          if (matchChunk) consume(matchChunk, depth + 1);
          if (after) consume(after, depth + 1);
          return;
        }
      }

      // Strip price and filler residues from unknown product text
      const cleanUnknown = res.unknown.text
        .replace(/^[৳₹$]\s*[\d০-৯]+(?:\.[\d০-৯]+)?/gi, '')
        .replace(/(টাকা\s*দামের|টাকার\s*দামের|টাকার|টাকা\s*মূল্যের|মূল্যের|দামের|দামে|দর|বিল|করো|দিন|দাও)/gi, '')
        .trim();

      const isIgnorableWord =
        /^(?:[\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|ওয়ান|ওয়ান|টু|থ্রি|ফোর|ফাইভ|সিক্স|এইট|নাইন|টেন|দেড়|দেড়|আড়াই|আড়াই|আধা|আধ)?\s*(?:টা|টি|টে|টো|খানা|পিস|কেজি|গ্রাম|লিটার|পোয়া|পোয়া|প্যাকেট|প্যাক|ডজন|বোতল|কমা|দাঁড়ি|দাড়ি|ফুলস্টপ)?$/i.test(
          cleanUnknown
        ) ||
        cleanUnknown === 'কমা' ||
        cleanUnknown === 'দাঁড়ি' ||
        cleanUnknown === 'ফুলস্টপ';

      if (
        cleanUnknown.length >= 2 &&
        !isIgnorableWord &&
        !/^[\u09BE-\u09CC\u09CD]/.test(cleanUnknown)
      ) {
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
