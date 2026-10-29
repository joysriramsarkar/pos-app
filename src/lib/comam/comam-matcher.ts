/**
 * Catalog & Customer Matcher for Comam AI integration in pos-app.
 * Matches spoken Bengali/Banglish against POS products and customers.
 */
import type { Product, Customer } from '@/types/pos';

import { bnToAscii } from './bn-parser';

export const BRAND_ALIASES: Record<string, string[]> = {
  'সেভেন আপ': ['৭ আপ', '7 up', '7up', 'seven up'],
  '৭ আপ': ['সেভেন আপ', '7 up', '7up', 'seven up'],
  '7 up': ['সেভেন আপ', '৭ আপ', '7up'],
  '7up': ['সেভেন আপ', '৭ আপ', '7 up'],
  'সানরাইজ': ['সাবরাইজ', 'sunrise'],
  'সাবরাইজ': ['সানরাইজ', 'sunrise'],
  'sunrise': ['সানরাইজ', 'সাবরাইজ'],
  'হলুদ': ['হলদি', 'haldi', 'turmeric', 'হলুদের'],
  'হলুদের': ['হলুদ', 'হলদি', 'haldi', 'turmeric'],
  'haldi': ['হলুদ', 'হলদি'],
  'চিনি': ['sugar', 'সুগার', 'চিনির'],
  'চিনির': ['চিনি', 'sugar'],
  'sugar': ['চিনি'],
  'কোক': ['কোকা কোলা', 'কোকাকোলা', 'coca cola', 'coke'],
  'কোকাকোলা': ['কোক', 'কোকা কোলা', 'coke'],
  'থামস আপ': ['থাম্বস আপ', 'thums up', 'thumps up'],
  'স্প্রাইট': ['sprite'],
  'মিরিন্ডা': ['mirinda'],
  'ফান্টা': ['fanta'],
  'ম্যাগি': ['maggi'],
  'ক্লোজ আপ': ['close up', 'ক্লোজআপ'],
  'ডাভ': ['dove'],
  'লাক্স': ['lux'],
  'হুইল': ['wheel'],
  'সার্ফ এক্সেল': ['surf excel'],
  'লাইফবয়': ['lifebuoy', 'লাইসবয়'],
  'ফরচুন': ['fortune'],
  'বিস্কফার্ম': ['বিস্কফার', 'বিস্কফার্মের', 'বিস্ক ফার্ম', 'biskfarm', 'bisk farm'],
  'বিস্কফার': ['বিস্কফার্ম', 'বিস্কফার্মের', 'biskfarm'],
  'biskfarm': ['বিস্কফার্ম', 'বিস্কফার', 'বিস্ক ফার্ম'],
  'মেরী': ['marie', 'মেরি', 'মেরি বিস্কুট', 'মেরী বিস্কুট'],
  'মেরি': ['marie', 'মেরী', 'মেরি বিস্কুট', 'মেরী বিস্কুট'],
  'মারি': ['marie', 'মেরি', 'মেরী', 'মারি বিস্কুট', 'মেরী বিস্কুট'],
  'marie': ['মেরি', 'মেরী', 'মারি'],
  'বিস্কুট': ['বিস্কিট', 'biscuit', 'biscuits'],
  'biscuit': ['বিস্কুট', 'বিস্কিট'],
  'খোলা চিনি': ['চিনি', 'সাদা চিনি', 'লুজ চিনি', 'sugar', 'চিনি খোলা'],
  'চিনি খোলা': ['খোলা চিনি', 'চিনি', 'লুজ চিনি', 'sugar'],
  'লুজ চিনি': ['চিনি', 'খোলা চিনি', 'sugar'],
  'সাদা চিনি': ['চিনি', 'sugar'],
  'খোলা ময়দা': ['ময়দা', 'লুজ ময়দা', 'খোলা ময়দা', 'ময়দা', 'ময়দা খোলা'],
  'ময়দা খোলা': ['খোলা ময়দা', 'ময়দা', 'লুজ ময়দা', 'খোলা ময়দা', 'ময়দা'],
  'খোলা ময়দা': ['ময়দা', 'লুজ ময়দা', 'খোলা ময়দা', 'ময়দা'],
  'ময়দা': ['খোলা ময়দা', 'খোলা ময়দা', 'maida', 'ময়দা'],
  'ময়দা': ['খোলা ময়দা', 'খোলা ময়দা', 'maida', 'ময়দা'],
  'সরিষার তেল': ['সর্ষের তেল', 'মাস্টার্ড অয়েল', 'mustard oil', 'সরিষা তেল'],
  'সর্ষের তেল': ['সরিষার তেল', 'mustard oil', 'সরিষা তেল'],
  'সরিষা তেল': ['সরিষার তেল', 'mustard oil'],
  'সাদা তেল': ['সয়াবিন তেল', 'সয়াবিন তেল', 'রিফাইন তেল', 'soyabean oil'],
  'সয়াবিন তেল': ['সাদা তেল', 'সয়াবিন তেল', 'soyabean oil', 'রিফাইন তেল'],
  'সয়াবিন তেল': ['সাদা তেল', 'সয়াবিন তেল', 'soyabean oil', 'রিফাইন তেল'],
  'খোলা চাল': ['চাল', 'rice'],
  'খোলা ডাল': ['ডাল', 'মসুর ডাল'],
  'আমুল': ['amul', 'আমল'],
  'amul': ['আমুল'],
  'কোজ': ['কুল', 'কোল', 'kool'],
  'কোল': ['কুল', 'কোজ', 'kool'],
  'কুল': ['কোল', 'কোজ', 'kool'],
  'চকলেট': ['chocolate', 'চকোলেট'],
  'চকোলেট': ['চকলেট', 'chocolate'],
  'chocolate': ['চকলেট'],
  'সিরাপ': ['syrup'],
  'syrup': ['সিরাপ'],
  'ডার্ক': ['dark'],
  'dark': ['ডার্ক'],
  'পেপসি': ['pepsi'],
  'pepsi': ['পেপসি'],
  'দুধ': ['milk', 'দুদ'],
  'milk': ['দুধ'],
  'শক্তি': ['shakti'],
  'shakti': ['শক্তি'],
  'কালো': ['black'],
  'black': ['কালো'],
  'নেভিকাট': ['navy cut', 'নেভি কাট', 'নেভিকাড', 'নেবিকাট', 'navycut'],
  'নেভি কাট': ['নেভিকাট', 'navy cut'],
  'গোল্ড ফ্ল্যাক': ['gold flake', 'গোল্ড ফ্লেক', 'গোল্ড ফ্লেক্স', 'গোল্ডফ্ল্যাক', 'গোল্ডফ্লেক', 'গোল্ডফ্লেক্স', 'goldflake'],
  'গোল্ড ফ্লেক': ['গোল্ড ফ্ল্যাক', 'গোল্ড ফ্লেক্স', 'gold flake', 'গোল্ডফ্ল্যাক', 'গোল্ডফ্লেক', 'গোল্ডফ্লেক্স'],
  'গোল্ড ফ্লেক্স': ['গোল্ড ফ্ল্যাক', 'গোল্ড ফ্লেক', 'gold flake', 'গোল্ডফ্ল্যাক', 'গোল্ডফ্লেক', 'গোল্ডফ্লেক্স'],
  'গোল্ডফ্লেক্স': ['গোল্ড ফ্ল্যাক', 'গোল্ড ফ্লেক', 'gold flake', 'গোল্ডফ্ল্যাক', 'গোল্ড ফ্লেক্স'],
  'গোল্ডফ্লেক': ['গোল্ড ফ্ল্যাক', 'গোল্ড ফ্লেক', 'gold flake', 'গোল্ডফ্ল্যাক', 'গোল্ড ফ্লেক'],
  'ফ্ল্যাক': ['flake', 'flakes', 'ফ্লেক', 'ফ্লেক্স'],
  'ফ্লেক': ['flake', 'flakes', 'ফ্ল্যাক', 'ফ্লেক্স'],
  'ফ্লেক্স': ['flake', 'flakes', 'ফ্ল্যাক', 'ফ্লেক'],
  'সিগারেট': ['cigarette', 'cigarettes'],
  'পেপার বোট': ['paper boat', 'পেপারবোট'],
  'নেসকাফে': ['nescafe'],
  'nescafe': ['নেসকাফে'],
};

export const GENERIC_CATEGORY_WORDS = new Set([
  'সিগারেট', 'সাবান', 'তেল', 'বিস্কুট', 'বিস্কিট', 'দুধ', 'কফি', 'চা', 'জল', 'পানি', 'কোল্ডড্রিংকস',
  'কোল্ডড্রিংক', 'মশলা', 'মসলা', 'গুঁড়ো', 'গুঁড়া', 'গুড়া', 'পাউডার', 'নুডলস', 'নুডুলস', 'শ্যাম্পু',
  'টুথপেস্ট', 'মধু', 'ঘি', 'মাখন', 'আটা', 'ময়দা', 'ময়দা', 'সুজি', 'ডাল', 'চাল', 'লবণ', 'নুন',
  'প্যাকেট', 'প্যাক', 'বোতল'
]);

export const CATEGORY_ANCHORS: Record<string, { namePatterns: string[]; categoryPatterns: string[] }> = {
  'সিগারেট': {
    namePatterns: [
      'সিগারেট', 'cigarette', 'bidi', 'বিড়ি', 'গোল্ড ফ্ল্যাক', 'গোল্ড ফ্লেক', 'গোল্ড ফ্লেক্স',
      'gold flake', 'নেভিকাট', 'navy cut', 'শিখর', 'চারমিনার', 'উইলস', 'wills',
      'বেনসন', 'benson', 'মার্লবোরো', 'marlboro', 'টোটাল', 'টোটাল সিগারেট', 'classic', 'king'
    ],
    categoryPatterns: ['cigarette', 'সিগারেট', 'tobacco', 'ধূমপান'],
  },
  'বিস্কুট': {
    namePatterns: ['বিস্কুট', 'বিস্কিট', 'biscuit', 'cookie', 'cookies', 'মেরী', 'মেরি', 'marie'],
    categoryPatterns: ['snack', 'biscuit', 'bakery', 'confectionery', 'বিস্কুট'],
  },
  'বিস্কিট': {
    namePatterns: ['বিস্কুট', 'বিস্কিট', 'biscuit', 'cookie', 'cookies', 'মেরী', 'মেরি', 'marie'],
    categoryPatterns: ['snack', 'biscuit', 'bakery', 'confectionery', 'বিস্কুট'],
  },
  'সাবান': {
    namePatterns: ['সাবান', 'soap', 'bar', 'lifebuoy', 'lux', 'dettol'],
    categoryPatterns: ['cleaning', 'household', 'personal', 'সাবান'],
  },
  'শ্যাম্পু': {
    namePatterns: ['শ্যাম্পু', 'shampoo'],
    categoryPatterns: ['personal', 'hair', 'শ্যাম্পু'],
  },
  'দুধ': {
    namePatterns: ['দুধ', 'milk', 'দুদ', 'আমুল', 'amul'],
    categoryPatterns: ['dairy', 'milk', 'দুধ'],
  },
  'কফি': {
    namePatterns: ['কফি', 'coffee', 'nescafe', 'নেসকাফে'],
    categoryPatterns: ['beverage', 'coffee', 'কফি'],
  },
  'চা': {
    namePatterns: ['চা', 'tea', 'তাজমহল', 'রেড লেবেল'],
    categoryPatterns: ['beverage', 'tea', 'চা'],
  },
  'তেল': {
    namePatterns: ['তেল', 'oil', 'সর্ষে', 'সরিষা', 'সয়াবিন', 'ফরচুন'],
    categoryPatterns: ['oil', 'groceries', 'তেল'],
  },
};

export function hasWordMatch(container: string, target: string): boolean {
  if (!container || !target) return false;
  const cTokens = container.split(/\s+/).filter(Boolean);
  const tTokens = target.split(/\s+/).filter(Boolean);
  if (tTokens.length === 0 || cTokens.length === 0) return false;
  if (tTokens.length === 1) {
    const t0 = tTokens[0];
    const strippedT0 = stripBengaliSuffixes(t0);
    return cTokens.some(
      (c) =>
        c === t0 ||
        stripBengaliSuffixes(c) === strippedT0 ||
        stripBengaliSuffixes(c) === t0 ||
        c === strippedT0
    );
  }
  const joinedTarget = tTokens.map(stripBengaliSuffixes).join(' ');
  const strippedContainer = cTokens.map(stripBengaliSuffixes);
  for (let i = 0; i <= strippedContainer.length - tTokens.length; i++) {
    if (strippedContainer.slice(i, i + tTokens.length).join(' ') === joinedTarget) {
      return true;
    }
  }
  return false;
}

export function normalizeBengali(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/য়/g, 'য়')
    .replace(/ড়/g, 'ড়')
    .replace(/[\s\-_]+/g, ' ')
    .replace(/[।,;:!?\"'()]/g, '')
    .trim();
}

/** Fold long vowels to short (ASR confuses them, e.g. spoken long-u
 * Amul). Used only for comparison variants, never for display text. */
export function foldLongVowels(text: string): string {
  return text.replace(/ী/g, 'ি').replace(/ূ/g, 'ু');
}

const PHONETIC_CHAR_MAP: Record<string, string> = {
  'ট': 'ট', 'ঠ': 'ট', 'ড': 'ট', 'ঢ': 'ট',
  'ত': 'ত', 'থ': 'ত', 'দ': 'ত', 'ধ': 'ত',
  'প': 'প', 'ফ': 'প',
  'ব': 'ব', 'ভ': 'ব',
  'ক': 'ক', 'খ': 'ক', 'গ': 'ক', 'ঘ': 'ক', 'ঙ': 'ক',
  'চ': 'চ', 'ছ': 'চ', 'জ': 'চ', 'ঝ': 'চ', 'য': 'চ',
  'শ': 'স', 'ষ': 'স', 'স': 'স',
  'র': 'র', 'ল': 'র',
  'ণ': 'ন', 'ন': 'ন',
  'ম': 'ম', 'হ': 'হ', 'ড়': 'র', 'ঢ়': 'র',
};

/**
 * Phonetic key for a Bengali word as actually heard by speech recognition.
 * bn-BD ASR systematically confuses consonant classes (ট/ড, ত/দ, প/ফ, ব/ভ,
 * শ/স, র/ল in English brand names like Flake->ফ্রেক) and drops vowel
 * length, so matching on this collapsed consonant skeleton makes
 * "নেভিকাড" and "নেভিকাট", "ফ্রেক" and "ফ্ল্যাক" compare equal while
 * genuinely different words stay apart.
 */
export function phoneticKeyBn(word: string): string {
  return phoneticKeyFromNormalized(foldLongVowels(normalizeBengali(word)));
}

/** Phonetic key for a word that is already normalizeBengali()-ed. */
export function phoneticKeyFromNormalized(norm: string): string {
  let out = '';
  const chars = Array.from(norm);
  for (let idx = 0; idx < chars.length; idx++) {
    const ch = chars[idx];
    // Ya-phala (্য, as in ফ্ল্যাক) is a glide ASR often drops entirely
    // (ফ্রেক): it carries no consonant identity of its own here.
    if (ch === 'য' && idx > 0 && chars[idx - 1] === '্') continue;
    if (PHONETIC_CHAR_MAP[ch]) {
      out += PHONETIC_CHAR_MAP[ch];
    } else if (/[ািীুূৃেৈোৌ্ँঃয়অআইঈউঊএঐওঔ\s]/.test(ch)) {
      continue; // vowel signs / independent vowels carry little identity
    } else {
      out += ch;
    }
  }
  return out;
}

/** Similarity between two spoken/catalog words with ASR confusions forgiven. */
export function tokenPhoneticSimilarity(a: string, b: string): number {
  const fa = foldLongVowels(normalizeBengali(a));
  const fb = foldLongVowels(normalizeBengali(b));
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;

  // Length ratio guard: a short word cannot be phonetically equal to a multi-word phrase
  const lenRatio = Math.min(fa.length, fb.length) / Math.max(fa.length, fb.length);
  if (lenRatio < 0.6) return 0;

  const ka = phoneticKeyBn(a);
  const kb = phoneticKeyBn(b);
  let sim = stringSimilarity(fa, fb);
  if (ka && ka === kb) return ka.length >= 3 ? 0.97 : Math.max(sim, 0.7);
  if (ka.length >= 2 && kb.length >= 2) {
    const kRatio = Math.min(ka.length, kb.length) / Math.max(ka.length, kb.length);
    if (kRatio >= 0.7) {
      sim = Math.max(sim, stringSimilarity(ka, kb));
    }
  }
  return sim;
}

/**
 * Catalog-aware transcript repair: rewrite spoken tokens that phonetically
 * match catalog product-name tokens into the catalog spelling, so the
 * shopkeeper sees (and the parser reads) "নেভিকাট … গোল্ড ফ্ল্যাক" instead
 * of the recognizer's "নেভিকাড … গোল্ডফ্রেক". Joined ASR tokens are split
 * back ("পেপারবোর্ড" -> "পেপার বোট"). Non-product words are left untouched.
 */
interface CatalogNameForm {
  displayTokens: string[];
  normTokens: string[];
  tokenKeys: string[];
}

const catalogNameFormsCache = new WeakMap<Product[], CatalogNameForm[]>();

function getCatalogNameForms(products: Product[]): CatalogNameForm[] {
  const cached = catalogNameFormsCache.get(products);
  if (cached) return cached;
  const forms: CatalogNameForm[] = [];
  for (const p of products) {
    if (p.isActive === false) continue;
    const display = (p.nameBn || p.name || '').trim();
    if (!display) continue;
    const rawTokens = display.split(/\s+/).filter(Boolean);
    const normTokens = normalizeBengali(display).split(/\s+/).filter(Boolean);
    if (normTokens.length === 0) continue;

    // Filter out trailing prices and packaging units from display replacement forms
    let cut = normTokens.length;
    for (let i = 0; i < normTokens.length; i++) {
      if (
        /^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(normTokens[i]) &&
        i + 1 < normTokens.length &&
        ['টাকা', 'গ্রাম', 'কেজি', 'লিটার', 'মিলি'].includes(normTokens[i + 1])
      ) {
        cut = i;
        break;
      }
      if (i === normTokens.length - 2 && /^[\d০-৯]+(?:\.[\d০-৯]+)?$/.test(normTokens[i]) && normTokens[i + 1] === 'টাকা') {
        cut = i;
        break;
      }
    }

    const trimmedNorm = normTokens.slice(0, cut);
    const trimmedDisplay = rawTokens.slice(0, cut);
    if (trimmedNorm.length > 0) {
      forms.push({
        displayTokens: trimmedDisplay,
        normTokens: trimmedNorm,
        tokenKeys: trimmedNorm.map((t) => phoneticKeyFromNormalized(foldLongVowels(t))),
      });
    }
  }
  catalogNameFormsCache.set(products, forms);
  return forms;
}

export function correctTranscriptWithCatalog(text: string, products: Product[]): string {
  if (!text || products.length === 0) return text;

  const forms = getCatalogNameForms(products);
  if (forms.length === 0) return text;

  const rawTokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < rawTokens.length) {
    let best: { end: number; display: string[]; sim: number } | null = null;
    // Try text windows of 1-2 tokens against name windows of 1-2 tokens.
    for (let textWin = 1; textWin <= 2 && i + textWin <= rawTokens.length; textWin++) {
      const heard = rawTokens.slice(i, i + textWin).join(' ');
      const heardKeys = new Set(
        rawTokens
          .slice(i, i + textWin)
          .map((t) => phoneticKeyFromNormalized(foldLongVowels(normalizeBengali(t))))
      );
      const heardTokens = new Set(
        rawTokens.slice(i, i + textWin).map((t) => normalizeBengali(t))
      );
      for (const form of forms) {
        const shares = form.normTokens.some(
          (t, ti) =>
            heardTokens.has(t) ||
            heardKeys.has(form.tokenKeys[ti]) ||
            (form.tokenKeys[ti].length >= 3 &&
              Array.from(heardKeys).some(
                (hk) =>
                  hk.length >= 3 &&
                  (hk.startsWith(form.tokenKeys[ti]) || form.tokenKeys[ti].startsWith(hk))
              ))
        );
        if (!shares) continue;
        for (
          let nameWin = Math.max(1, textWin - 1);
          nameWin <= textWin + 1 && nameWin <= form.normTokens.length;
          nameWin++
        ) {
          for (let s = 0; s + nameWin <= form.normTokens.length; s++) {
            const catalogJoined = form.normTokens.slice(s, s + nameWin).join(' ');
            if (normalizeBengali(heard) === catalogJoined) continue; // already correct
            const sim = tokenPhoneticSimilarity(heard, catalogJoined);
            if (sim >= 0.94 && (!best || sim > best.sim || (sim === best.sim && nameWin > best.display.length))) {
              best = { end: i + textWin, display: form.displayTokens.slice(s, s + nameWin), sim };
            }
          }
        }
      }
    }
    if (best) {
      out.push(...best.display);
      i = best.end;
    } else {
      out.push(rawTokens[i]);
      i += 1;
    }
  }
  return out.join(' ');
}

export function expandQueryAliases(text: string): string[] {
  const norm = normalizeBengali(text);
  if (!norm) return [];
  const variants = new Set<string>([norm]);

  // Suffix stripped variant (e.g. "হলুদের" -> "হলুদ", "চিনির" -> "চিনি", "ময়দার" -> "ময়দা")
  const strippedWords = norm
    .split(/\s+/)
    .map((w) => stripBengaliSuffixes(w))
    .join(' ');
  if (strippedWords && strippedWords !== norm) {
    variants.add(strippedWords);
  }

  // Generic category word stripped variant (e.g. "নেভিকাট সিগারেট" -> "নেভিকাট", "মেরী বিস্কুট" -> "মেরী")
  const nonCategoryWords = norm
    .split(/\s+/)
    .filter((w) => !GENERIC_CATEGORY_WORDS.has(w) && !GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(w)))
    .join(' ');
  if (nonCategoryWords && nonCategoryWords !== norm && nonCategoryWords.length >= 2) {
    variants.add(nonCategoryWords);
  }

  // Transliterate English spoken numbers in Bengali script
  const numSub = norm
    .replace(/\bসেভেন\b|সেভেন/g, '৭')
    .replace(/\bওয়ান\b|ওয়ান/g, '১')
    .replace(/\bটু\b|টু/g, '২')
    .replace(/\bথ্রি\b|থ্রি/g, '৩')
    .replace(/\bফোর\b|ফোর/g, '৪')
    .replace(/\bফাইভ\b|ফাইভ/g, '৫')
    .replace(/\bসিক্স\b|সিক্স/g, '৬')
    .replace(/\bএইট\b|এইট/g, '৮')
    .replace(/\bনাইন\b|নাইন/g, '৯')
    .replace(/\bটেন\b|টেন/g, '১০');
  variants.add(numSub);

  // English digits representation (e.g. "৭ আপ" -> "7 up" / "7 আপ")
  const asciiConverted = bnToAscii(numSub);
  variants.add(asciiConverted);
  variants.add(asciiConverted.replace(/আপ\b/g, 'up'));

  // Brand synonyms
  for (const [key, aliases] of Object.entries(BRAND_ALIASES)) {
    if (norm.includes(key)) {
      for (const alias of aliases) {
        variants.add(norm.replace(key, alias).trim());
      }
    }
    if (strippedWords && strippedWords.includes(key)) {
      for (const alias of aliases) {
        variants.add(strippedWords.replace(key, alias).trim());
      }
    }
    if (numSub.includes(key)) {
      for (const alias of aliases) {
        variants.add(numSub.replace(key, alias).trim());
      }
    }
  }

  // Cumulative alias pass: apply every brand alias at once so a Bengali
  // query can equal an English-only catalog name ("Amul Dark Chocolate").
  let cumulative = norm;
  const queryIsBengali = /[\u0980-\u09FF]/.test(norm);
  for (const [key, aliases] of Object.entries(BRAND_ALIASES)) {
    // One direction only per pass: bidirectional alias pairs would
    // otherwise replace each other's output back and cancel out.
    if (/[\u0980-\u09FF]/.test(key) !== queryIsBengali) continue;
    if (aliases.length > 0 && cumulative.includes(key)) {
      cumulative = cumulative.split(key).join(aliases[0]);
    }
  }
  if (cumulative !== norm) variants.add(cumulative);
  variants.add(transliterateBnToLatin(norm));
  if (cumulative !== norm) variants.add(transliterateBnToLatin(cumulative));

  // Vowel-folded copies of every variant, so spoken long/short vowel
  // variants still reach an exact catalog match.
  for (const v of Array.from(variants)) variants.add(foldLongVowels(v));

  return Array.from(variants).filter(Boolean);
}

/** Compute string similarity ratio (Dice's coefficient / bigram overlap) */
export function stringSimilarity(s1: string, s2: string): number {
  const str1 = normalizeBengali(s1);
  const str2 = normalizeBengali(s2);

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  // Substring shortcut only for meaningful lengths: a 1-2 char catalog
  // value (size "L", category initial) is inside almost every query and
  // must not score as a near-match for unrelated spoken words.
  if (Math.min(str1.length, str2.length) >= 3 && (str1.includes(str2) || str2.includes(str1))) return 0.9;

  // Bigram Dice coefficient
  const getBigrams = (str: string): Map<string, number> => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.substring(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  let intersection = 0;

  for (const [bg, count] of b1) {
    if (b2.has(bg)) {
      intersection += Math.min(count, b2.get(bg)!);
    }
  }

  const total = (str1.length - 1) + (str2.length - 1);
  if (total <= 0) return 0.0;
  return (2.0 * intersection) / total;
}

export interface ProductMatch {
  product: Product;
  score: number;
}

export interface SearchProductsResult {
  matches: ProductMatch[];
  isAmbiguous: boolean;
}

const productNamesCache = new WeakMap<Product, string[]>();

export function getProductNames(p: Product): string[] {
  const cached = productNamesCache.get(p);
  if (cached) return cached;
  const names: string[] = [];
  if (p.nameBn) {
    const normBn = normalizeBengali(p.nameBn);
    names.push(normBn);
    const coreBn = normBn
      .replace(/\s+[\d০-৯]+(?:\.[\d০-৯]+)?\s*(?:টাকা|টাকার|দামের|গ্রাম|কেজি|লিটার|মিলি|প্যাকেট|পিস|ডজন|বোতল)?$/gi, '')
      .replace(/\s+(?:টাকা|টাকার|দামের)$/gi, '')
      .trim();
    if (coreBn && coreBn !== normBn) names.push(coreBn);
  }
  if (p.name) {
    const normEn = normalizeBengali(p.name);
    names.push(normEn);
    const coreEn = normEn
      .replace(/\s+(?:rs\.?|inr|tk\.?)\s*[\d০-৯]+(?:\.[\d০-৯]+)?$/gi, '')
      .replace(/\s+[\d০-৯]+(?:\.[\d০-৯]+)?\s*(?:rs\.?|inr|tk\.?|g|kg|ml|l|pcs?|pack)?$/gi, '')
      .trim();
    if (coreEn && coreEn !== normEn) names.push(coreEn);
  }
  if (p.category) names.push(normalizeBengali(p.category));

  // Also include attributes e.g. Color, Size, Brand if present
  if (p.attributes && typeof p.attributes === 'object') {
    for (const val of Object.values(p.attributes)) {
      if (typeof val === 'string' && val.trim()) {
        names.push(normalizeBengali(val));
      }
    }
  }

  const folded = names.map((n) => foldLongVowels(n)).filter((n) => !names.includes(n));
  const result = [...names, ...folded].filter(Boolean);
  productNamesCache.set(p, result);
  return result;
}

interface NameInfo {
  name: string;
  words: string[];
  keys: string[];
}

const productNameInfoCache = new WeakMap<Product, NameInfo[]>();

function getProductNameInfos(p: Product): NameInfo[] {
  const cached = productNameInfoCache.get(p);
  if (cached) return cached;
  const infos = getProductNames(p).map((name) => {
    const words = name.split(/\s+/).filter((w) => w.length >= 2);
    return { name, words, keys: words.map((w) => phoneticKeyFromNormalized(foldLongVowels(w))) };
  });
  productNameInfoCache.set(p, infos);
  return infos;
}

const catalogVocabCache = new WeakMap<
  Product[],
  { tokens: Set<string>; keys: Set<string> }
>();

function getCatalogVocab(products: Product[]): { tokens: Set<string>; keys: Set<string> } {
  const cached = catalogVocabCache.get(products);
  if (cached) return cached;
  const tokens = new Set<string>();
  const keys = new Set<string>();
  for (const p of products) {
    if (p.isActive === false) continue;
    for (const info of getProductNameInfos(p)) {
      info.words.forEach((w) => tokens.add(w));
      info.keys.forEach((k) => keys.add(k));
    }
  }
  const vocab = { tokens, keys };
  catalogVocabCache.set(products, vocab);
  return vocab;
}

const searchResultCache = new WeakMap<Product[], Map<string, SearchProductsResult>>();

export function searchProducts(
  products: Product[],
  query: string,
  limit: number = 5
): SearchProductsResult {
  const cacheKey = `${limit}|${query}`;
  let perCatalog = searchResultCache.get(products);
  const cached = perCatalog?.get(cacheKey);
  if (cached) return cached;

  const result = searchProductsUncached(products, query, limit);
  if (!perCatalog) {
    perCatalog = new Map();
    searchResultCache.set(products, perCatalog);
  }
  if (perCatalog.size > 500) perCatalog.clear();
  perCatalog.set(cacheKey, result);
  return result;
}

function searchProductsUncached(
  products: Product[],
  query: string,
  limit: number = 5
): SearchProductsResult {
  const normQuery = normalizeBengali(query);
  const qVariants = expandQueryAliases(query);
  if (qVariants.length === 0) return { matches: [], isAmbiguous: false };

  // Per-variant word lists are query-level facts: compute once, not once
  // per product x name x variant in the scan below.
  const variantInfos = qVariants.map((q) => ({
    q,
    words: q.split(/\s+/).filter((w) => w.length >= 2),
  }));
  const qTokenSet = new Set<string>();
  const qKeySet = new Set<string>();
  for (const v of variantInfos) {
    for (const w of v.words) {
      qTokenSet.add(w);
      qTokenSet.add(foldLongVowels(w));
      qKeySet.add(phoneticKeyFromNormalized(foldLongVowels(w)));
    }
  }
  const productCouldMatch = (infos: NameInfo[]): boolean => {
    for (const info of infos) {
      for (let i = 0; i < info.words.length; i++) {
        const w = info.words[i];
        if (qTokenSet.has(w) || qTokenSet.has(foldLongVowels(w))) return true;
        const k = info.keys[i];
        if (qKeySet.has(k)) return true;
        for (const qk of qKeySet) {
          if (
            k.length >= 3 &&
            qk.length >= 3 &&
            (k.startsWith(qk) || qk.startsWith(k))
          ) {
            return true;
          }
        }
      }
      // Substring relations in either direction (name inside query etc.)
      for (const v of variantInfos) {
        if (hasWordMatch(info.name, v.q) || hasWordMatch(v.q, info.name)) return true;
      }
    }
    return false;
  };
  const alignQWords = normQuery.split(/\s+/).filter((w) => w.length >= 2);
  const alignQKeys = alignQWords.map((w) => phoneticKeyBn(w));

  const qTokensList = normQuery.split(/\s+/).filter(Boolean);
  const qTokensWithStripped = [
    ...qTokensList,
    ...qTokensList.map((t) => stripBengaliSuffixes(t)),
  ];
  const activeAnchorKey = Object.keys(CATEGORY_ANCHORS).find((key) =>
    qTokensWithStripped.includes(key)
  );
  const activeAnchor = activeAnchorKey ? CATEGORY_ANCHORS[activeAnchorKey] : null;

  // Helper to check if a product specifically matches the non-generic core of the query
  const queryCoreWords = normQuery
    .split(/\s+/)
    .filter((w) => !GENERIC_CATEGORY_WORDS.has(w) && !GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(w)));

  const productMatchesCore = (p: Product): boolean => {
    if (queryCoreWords.length === 0) return true;
    const pText = `${p.nameBn || ''} ${p.name || ''}`;
    return queryCoreWords.some((cw) => hasWordMatch(pText, cw) || pText.includes(cw));
  };

  const diceGate = (name: string): boolean => {
    const words = name.split(/\s+/).filter((w) => w.length >= 2);
    for (const w of words) {
      const k = phoneticKeyBn(w);
      for (const qk of alignQKeys) {
        if (k === qk) return true;
        if (k.length >= 3 && qk.length >= 3 && (k.includes(qk) || qk.includes(k))) return true;
      }
      // A spoken word appearing verbatim inside the name also opens the gate.
      if (alignQWords.some((qw) => name.includes(qw))) return true;
    }
    return false;
  };
  const scored: ProductMatch[] = [];

  for (const product of products) {
    if (product.isActive === false) continue;

    if (activeAnchor) {
      const pName = `${product.nameBn || ''} ${product.name || ''}`.toLowerCase();
      const pCat = (product.category || '').toLowerCase();
      const matchesAnchor =
        activeAnchor.namePatterns.some((pat) => pName.includes(pat.toLowerCase())) ||
        activeAnchor.categoryPatterns.some((pat) => pCat.includes(pat.toLowerCase()));
      if (!matchesAnchor) {
        continue;
      }
    }

    let bestScore = 0.0;
    const names = getProductNameInfos(product);
    if (!productCouldMatch(names)) continue;

    for (const { name, words: nWords, keys: nKeysArr } of names) {
      for (const { q, words: qWordsPre } of variantInfos) {
        let score = 0.0;
        if (q === name) {
          // Direct unaliased exact match gets 1.05; aliased exact match gets 1.0
          score = (q === normQuery) ? 1.05 : 1.0;
        } else if (q.length >= 3 && hasWordMatch(name, q)) {
          const lengthBonus = Math.min(0.06, (q.length / Math.max(name.length, 1)) * 0.06);
          score = 0.92 + lengthBonus;
        } else if (q.length >= 3 && name.length >= 3 && hasWordMatch(q, name)) {
          // name.length guard: a 1-2 char catalog value (size "L", a short
          // category/attribute) must never substring-match every query.
          score = 0.91;
        } else {
          // Token subset match: all tokens of q exist in name
          const qWords = qWordsPre;
          if (qWords.length >= 2 && qWords.every((w) => name.includes(w))) {
            score = 0.90;
          } else if (diceGate(name)) {
            const sim = stringSimilarity(q, name);
            score = sim;
          }
        }
        bestScore = Math.max(bestScore, score);
        if (bestScore >= 1.05) break;
      }
      // ASR-tolerant token alignment, once per catalog name: each spoken
      // word is matched phonetically against the name's words, so a
      // garbled brand token ("নেভিকাড", "গোল্ডফ্রেক") still lands on the
      // right product even when whole-string similarity is weak.
      if (bestScore < 0.88) {
        const nKeys = new Set(nKeysArr);
        const sharesSkeleton = alignQWords.some((w) => nKeys.has(phoneticKeyBn(w)));
        if (sharesSkeleton && nWords.length > 0) {
          let sum = 0;
          let covered = 0;
          for (const qw of alignQWords) {
            const bestTok = Math.max(...nWords.map((nw) => tokenPhoneticSimilarity(qw, nw)));
            sum += bestTok;
            if (bestTok >= 0.75) covered++;
          }
          const avg = sum / alignQWords.length;
          if (avg >= 0.8 && covered / alignQWords.length >= 0.5) {
            bestScore = Math.max(bestScore, 0.76 + avg * 0.12);
          }
        }
      }
      if (bestScore >= 1.05) break;
    }

    if (bestScore >= 0.55) {
      scored.push({ product, score: bestScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  let topMatches = scored.slice(0, limit);

  if (topMatches.length === 0) {
    const { tokens: catalogTokens, keys: catalogKeys } = getCatalogVocab(products);
    const qWords = normQuery.split(/\s+/).filter(Boolean);
    const kept = qWords.filter(
      (w) =>
        catalogTokens.has(w) ||
        catalogKeys.has(phoneticKeyBn(w)) ||
        /[\d০-৯]/.test(w)
    );
    const substantiveKept = kept.filter(
      (w) =>
        !GENERIC_CATEGORY_WORDS.has(w) &&
        !GENERIC_CATEGORY_WORDS.has(stripBengaliSuffixes(w))
    );
    if (substantiveKept.length > 0 && kept.length < qWords.length) {
      const retry = searchProductsUncached(products, kept.join(' '), limit);
      if (retry.matches.length > 0) return retry;
    }
  }

  const isAmbiguous =
    topMatches.length >= 2 &&
    topMatches[1].score >= 0.55 &&
    topMatches[0].score - topMatches[1].score < 0.08 &&
    !(topMatches[0].score >= 0.98 && topMatches[1].score <= 0.92) &&
    !(productMatchesCore(topMatches[0].product) && !productMatchesCore(topMatches[1].product));

  return { matches: topMatches, isAmbiguous };
}

const BN_TO_LATIN_MAP: Record<string, string> = {
  'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri',
  'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
  'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
  'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': '', 'ঁ': '',
  'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
  'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': '',
};

export function transliterateBnToLatin(text: string): string {
  if (!text) return '';
  const norm = normalizeBengali(text).replace(/ক্ষ/g, 'kh');
  return norm
    .split('')
    .map((ch) => BN_TO_LATIN_MAP[ch] || ch)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const SURNAMES_PRESERVE_AR = new Set([
  'সরকার', 'কর্মকার', 'হালদার', 'পোদ্দার', 'জোয়ারদার', 'তালুকদার', 'মজুমদার', 'শিকদার', 'সর্দার'
]);

export function stripBengaliSuffixes(name: string): string {
  let cleaned = name.trim();

  // 1. Check for compound honorific suffixes (e.g. "রহিমদার", "সুধীরকাকার", "বিকাশবাবুর", "রফিকভাইয়ের")
  // Do NOT strip "দার" if it's a real surname like "হালদার", "মজুমদার", "পোদ্দার"
  const honorificMatch = cleaned.match(/(?:দার|দা|বাবুর|বাবু|কাকার|কাকা|ভাইয়ের|ভাইয়ের|ভাই|দির|দিদি|দি|কে|রে)$/);
  if (honorificMatch) {
    const isRealSurname = SURNAMES_PRESERVE_AR.has(cleaned) || SURNAMES_PRESERVE_AR.has(cleaned.split(/\s+/).pop() || '');
    if (!isRealSurname || honorificMatch[0] !== 'দার') {
      return cleaned.slice(0, honorificMatch.index).trim();
    }
  }

  // 2. Genitive suffix '-এর' or 'ের' (after consonants: "রহিমের", "সরকারের", "প্রদীপের")
  if (/(?:-এর|ের)$/.test(cleaned)) {
    return cleaned.replace(/(?:-এর|ের)$/, '').trim();
  }

  // 3. Genitive 'র' only after vowel 'া' (e.g. "সুমিতার", "রীতার", "মমতার")
  if (/(?<=[া])র$/.test(cleaned) && !SURNAMES_PRESERVE_AR.has(cleaned)) {
    return cleaned.replace(/র$/, '').trim();
  }

  return cleaned;
}

export function extractDueQueryTarget(text: string): {
  isGeneral: boolean;
  targetName: string | null;
} {
  let norm = normalizeBengali(text);
  norm = norm.replace(/[?,।!]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Pure general query patterns
  const isPureGeneral =
    /^(?:দোকানের\s+|আমাদের\s+)?(?:কার|কাদের|সকলের|সবার|দোকানের)\s+(?:কত\s+)?(?:বাকি|বকেয়া|দেনা)/i.test(norm) ||
    /^(?:মোট\s+|সব\s+)?(?:বাকি|বকেয়া|দেনা)(?:\s*(?:কত|কেমন|হিসাব|খাতা|তালিকা|বলো|জানাও|দেখাও))?$/i.test(norm) ||
    /^(?:বাকি|বকেয়া)\s*খাতা/i.test(norm);

  if (isPureGeneral) {
    return { isGeneral: true, targetName: null };
  }

  // 2. Extract customer candidate:
  // e.g. "রহিমদার কত টাকা বাকি", "লক্ষণ সরকারের মোট বাকি কত", "রহিমের বাকি কত আছে"
  let candidate = norm
    .replace(/^(?:আজকে?|দয়া\s*করে|একটু)\s+/, '')
    .replace(/\s+(?:বাকি|বকেয়া|দেনা)(?:\s*(?:হিসাব|খাতা))?.*$/i, '')
    .replace(/\s+(?:কত|কেমন|কত\s*টাকা|কতটাকা)\s+(?:বাকি|বকেয়া|দেনা).*$/i, '')
    .replace(/\s+(?:মোট|সব)\s+(?:বাকি|বকেয়া|দেনা).*$/i, '')
    .replace(/\s+(?:মোট|সব|কত|টাকা|হিসাব|দেনা|বাকি|বকেয়া)$/i, '')
    .replace(/\s+(?:মোট|সব|কত|টাকা|হিসাব|দেনা|বাকি|বকেয়া)$/i, '')
    .trim();

  candidate = stripBengaliSuffixes(candidate);
  candidate = candidate.replace(/\s+(?:মোট|সব|কত|টাকা)$/i, '').trim();
  candidate = stripBengaliSuffixes(candidate);

  if (
    candidate.length >= 2 &&
    !/^(?:কার|কাদের|সকলের|সবার|মোট|সব|দোকানের|আমাদের|দেনা|বাকি|বকেয়া)$/i.test(candidate)
  ) {
    return { isGeneral: false, targetName: candidate };
  }

  return { isGeneral: true, targetName: null };
}

// Common short Bengali words or conversational tokens that should never loosely match a customer
const COMMON_WORD_STOP_LIST = new Set([
  'বি', 'সে', 'মা', 'এক', 'একটা', 'দুই', 'দুইটা', 'দুটো', 'তিন', 'তিনটা', 'চার', 'চারটা', 'পাঁচ', 'পাঁচটা',
  'লোক', 'টাকা', 'দামের', 'দামে', 'দর', 'কেজি', 'গ্রাম', 'পোয়া', 'পোয়া', 'চিনি', 'ময়দা', 'ময়দা', 'হলুদ',
  'দাও', 'দিন', 'করো', 'করুন', 'এবং', 'আর', 'ও', 'কমা', 'ফুলস্টপ', 'বিল', 'খাতা', 'বাকি'
]);

export function findCustomer(
  customers: Customer[],
  text: string
): Customer | null {
  const normText = normalizeBengali(text);
  if (!normText) return null;

  const strippedText = stripBengaliSuffixes(normText);
  const latinText = transliterateBnToLatin(normText);
  const strippedLatinText = transliterateBnToLatin(strippedText);

  // 1. Exact match on full name, Bengali name, English name, or phone number
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const exactCandidates = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
      customer.phone ? customer.phone.trim() : '',
    ].filter(Boolean);

    for (const cand of exactCandidates) {
      if (cand === normText || cand === strippedText) {
        return customer;
      }
    }
  }

  // 2. Word boundary match: customer's full name is a complete phrase/token sequence in the text
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const names = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
    ].filter(Boolean);

    for (const n of names) {
      if (COMMON_WORD_STOP_LIST.has(n)) continue;
      // Must be at least 3 characters and match whole word boundaries (including common Bengali honorifics)
      if (n.length >= 3) {
        const regex = new RegExp(`(?:^|\\s+)${n}(?:-এর|ের|র|দার|দা|বাবু|বাবুর|কাকা|কাকার|ভাই|ভাইয়ের|ভাইয়ের|কে|রে)?(?=\\s+|$)`, 'i');
        if (regex.test(normText) || regex.test(strippedText)) {
          return customer;
        }
      }
    }
  }

  // 2b. Token match for single-word customer names after stripping suffixes (e.g. "রহিমদার" -> "রহিম", "রহিমদা" -> "রহিম")
  const strippedTokens = normText.split(/\s+/).map(stripBengaliSuffixes);
  for (const customer of customers) {
    if (customer.isActive === false) continue;
    const names = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
    ].filter(Boolean);
    for (const n of names) {
      if (COMMON_WORD_STOP_LIST.has(n)) continue;
      if (n.length >= 3 && strippedTokens.includes(n)) {
        return customer;
      }
    }
  }

  // 3. For multi-word customer names (e.g. "লক্ষণ সরকার"):
  // Query matches if all non-stop words of the customer name are present in query tokens
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const cNames = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
    ].filter(Boolean);

    for (const cName of cNames) {
      const cWords = cName.split(/\s+/).filter((w) => w.length >= 2 && !COMMON_WORD_STOP_LIST.has(w));
      if (cWords.length >= 2) {
        const textWords = new Set(normText.split(/\s+/).map(stripBengaliSuffixes));
        if (cWords.every((cw) => textWords.has(cw))) {
          return customer;
        }
      }
    }
  }

  // 4. Transliteration match (Bengali query matching English customer name or vice versa)
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const cNames = [
      customer.name ? customer.name.toLowerCase().trim() : '',
      customer.nameEn ? customer.nameEn.toLowerCase().trim() : '',
    ].filter(Boolean);

    for (const cName of cNames) {
      if (cName.length >= 4 && !COMMON_WORD_STOP_LIST.has(cName)) {
        if (latinText === cName || strippedLatinText === cName) {
          return customer;
        }
        const regex = new RegExp(`(?:^|\\s+)${cName}(?=\\s+|$)`, 'i');
        if (regex.test(latinText) || regex.test(strippedLatinText)) {
          return customer;
        }
      }
    }
  }

  return null;
}

const NAME_STOP_WORDS = new Set([
  'বিল', 'করো', 'করুন', 'দাও', 'দিন', 'দেন', 'নাও', 'চাই', 'বাকি', 'বাকিতে',
  'নগদ', 'নগদে', 'টাকা', 'টাকার', 'কেজি', 'গ্রাম', 'লিটার', 'ডজন', 'পোয়া', 'পোয়া', 'আর',
  'এবং', 'ও', 'জমা', 'দিলেন', 'দিল', 'কিনলাম', 'কিনেছি', 'এনেছি', 'আনলাম',
  'বিক্রি', 'সেল', 'ইউপিআই', 'ইউপিআইতে', 'কার্টে', 'রাখো', 'যোগ',
]);

export function extractSpokenCustomerName(text: string, products: Product[]): string | null {
  const normText = normalizeBengali(text);
  const patterns = [
    /([\u0980-\u09FF]+(?:\s+[\u0980-\u09FF]+){0,2})কে(?:\s+|$)/,
    /([\u0980-\u09FF]+(?:\s+[\u0980-\u09FF]+){0,2})র?\s+নামে/,
  ];

  for (const pat of patterns) {
    const m = normText.match(pat);
    if (!m) continue;

    const words = m[1].split(/\s+/).filter(Boolean);
    while (words.length > 0 && NAME_STOP_WORDS.has(words[0])) {
      words.shift();
    }
    if (words.length === 0 || words.some((w) => NAME_STOP_WORDS.has(w))) {
      continue;
    }

    let lastWord = words[words.length - 1];
    if (lastWord.endsWith('দার') && lastWord.length > 3) {
      words[words.length - 1] = lastWord.slice(0, -3);
    } else if (lastWord.endsWith('দা') && lastWord.length > 3) {
      words[words.length - 1] = lastWord.slice(0, -2);
    }

    const candidateName = words.join(' ').trim();
    if (!candidateName) continue;

    // Check if the candidate name is actually a product
    const { matches } = searchProducts(products, candidateName, 1);
    if (matches.length > 0 && matches[0].score >= 0.9) {
      continue; // It's a product, not a customer
    }

    return candidateName;
  }

  return null;
}

export function isProductOrUnitOrNumber(word: string, products: Product[]): boolean {
  const norm = normalizeBengali(word);
  if (!norm) return false;

  const UNITS = [
    'কেজি', 'কিলো', 'কিলোগ্রাম', 'গ্রাম', 'লিটার', 'লি', 'মিলি', 'পিস', 'প্যাকেট', 'প্যাক',
    'ডজন', 'বোতল', 'পোয়া', 'পোয়া', 'টা', 'টি', 'টে', 'টো', 'খানা', 'টাকা', 'টাকার',
    'মূল্যের', 'দামের', 'দামে', 'দর'
  ];
  if (UNITS.includes(norm)) return true;
  if (/^[\d০-৯]+$/.test(norm)) return true;

  const NUM_WORDS = [
    'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ',
    'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ', 'কুড়ি', 'বিশ',
    'তিরিশ', 'চল্লিশ', 'পঞ্চাশ', 'ষাট', 'সত্তর', 'আশি', 'নব্বই', 'একশো', 'শ', 'শো', 'হাজার',
    'আধা', 'আধ', 'হাফ', 'দেড়', 'দেড়', 'আড়াই', 'আড়াই', 'পৌনে', 'সোয়া'
  ];
  if (NUM_WORDS.includes(norm)) return true;

  // Recognizes piece-suffixed numbers e.g. "তিনটা", "দুটো", "দুইটা", "১টা", "৪টি", "১খানা", etc.
  const piecePattern = /^([\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|এগারো|বারো|তেরো|চৌদ্দ|পনেরো|ষোলো|সতেরো|আঠারো|উনিশ|কুড়ি|বিশ|দু|আধ|আধা|দেড়|দেড়|আড়াই|আড়াই|পৌনে|সোয়া)(?:টা|টি|টে|টো|খানা|পিস|প্যাকেট|কেজি|গ্রাম|লিটার|পোয়া|পোয়া)$/;
  if (piecePattern.test(norm)) return true;

  // Check product catalog
  for (const p of products) {
    if (p.nameBn) {
      const pNorm = normalizeBengali(p.nameBn);
      if (pNorm === norm || pNorm.split(/\s+/).includes(norm)) return true;
    }
    if (p.name) {
      const pNorm = normalizeBengali(p.name);
      if (pNorm === norm || pNorm.split(/\s+/).includes(norm)) return true;
    }
  }

  return false;
}

export function extractCustomerClause(
  rawText: string,
  customers: Customer[],
  products: Product[]
): {
  customer: Customer | null;
  customerName: string | null;
  cleanItemsText: string;
  isExplicitDue: boolean;
} {
  const text = rawText
    .replace(/[;!?\"'()—–-]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  let customerCandidate: string | null = null;
  let cleanItemsText = text;
  let isExplicitDue = false;

  // Pattern 1: "... [customer] (র/এর)? নামে [বাকি/বিল/করো/রাখো]" or "... [customer] (র/এর)? খাতায় [বাকি]"
  const nameKeywordMatch = text.match(
    /(?:^|\s+)(?:র|এর|-এর)?\s*(নামে|খাতায়)(?:\s+(?:বাকি|বিল|সেল))?(?:\s*(?:করো|করুন|রাখো|দাও|দিন|লিখে\s*রাখো|লিখুন))?(?=$|[\s।,;!?]+)/i
  );

  if (nameKeywordMatch && nameKeywordMatch.index !== undefined) {
    if (/বাকি|খাতায়|নামে/.test(nameKeywordMatch[0])) {
      isExplicitDue = true;
    }
    if (/নগদ|নগদে|ক্যাশ/.test(rawText)) {
      isExplicitDue = false;
    }
    const beforeKeyword = text.slice(0, nameKeywordMatch.index).trim();
    const afterKeyword = text.slice(nameKeywordMatch.index + nameKeywordMatch[0].length).trim();
    const tokens = beforeKeyword.split(/\s+/).filter(Boolean);

    const nameTokens: string[] = [];
    while (tokens.length > 0 && nameTokens.length < 3) {
      const last = tokens[tokens.length - 1];
      const cleanedLast = stripBengaliSuffixes(last);

      if (
        isProductOrUnitOrNumber(cleanedLast, products) ||
        isProductOrUnitOrNumber(last, products)
      ) {
        break;
      }
      nameTokens.unshift(cleanedLast);
      tokens.pop();
    }

    if (nameTokens.length > 0) {
      customerCandidate = nameTokens.join(' ');
      cleanItemsText = (tokens.join(' ') + ' ' + afterKeyword).trim();
    }
  }

  // Pattern 2: "[customer] (কে/রে) (বিল করো|দাও|দিন|সেল করো)"
  if (!customerCandidate) {
    const keMatch = text.match(
      /(?:^|\s+)([^\s,।]+(?:\s+[^\s,।]+)?)(কে|রে)\s+(?:বিল\s*করো|দাও|দিন|সেল\s*করো)(?=$|\s+)/i
    );
    if (keMatch && keMatch[1]) {
      const cand = stripBengaliSuffixes(keMatch[1].trim());
      if (!isProductOrUnitOrNumber(cand, products)) {
        customerCandidate = cand;
        cleanItemsText = text.replace(keMatch[0], ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Pattern 3: Explicit customer prefix: "গ্রাহক [নাম]" or "ক্রেতা [নাম]"
  if (!customerCandidate) {
    const prefixMatch = text.match(/^(?:গ্রাহক|ক্রেতা)\s+([^\s,।]+(?:\s+[^\s,।]+)?)\b/i);
    if (prefixMatch && prefixMatch[1]) {
      const cand = stripBengaliSuffixes(prefixMatch[1].trim());
      if (!isProductOrUnitOrNumber(cand, products)) {
        customerCandidate = cand;
        cleanItemsText = text.slice(prefixMatch[0].length).trim();
      }
    }
  }

  // If an explicit customer candidate was extracted, look it up in registered customers
  if (customerCandidate) {
    const registered = findCustomer(customers, customerCandidate);
    return {
      customer: registered,
      customerName: registered ? registered.name : customerCandidate,
      cleanItemsText,
      isExplicitDue,
    };
  }

  // Pattern 4: Sentence starts with registered customer's full multi-word name (e.g. "লক্ষণ সরকার ২ কেজি চিনি")
  for (const c of customers) {
    if (c.isActive === false) continue;
    const cNames = [c.name, (c as any).nameBn, c.nameEn].filter(Boolean) as string[];
    for (const name of cNames) {
      const normN = normalizeBengali(name);
      if (normN.includes(' ') && normN.length >= 5) {
        if (text.startsWith(normN)) {
          const remainder = text.slice(normN.length).trim();
          return {
            customer: c,
            customerName: c.name,
            cleanItemsText: remainder,
            isExplicitDue: false,
          };
        }
      }
    }
  }

  // DEFAULT: No customer mentioned in sentence -> CASH / WALK-IN sale!
  return {
    customer: null,
    customerName: null,
    cleanItemsText: text,
    isExplicitDue: false,
  };
}
