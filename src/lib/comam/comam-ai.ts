/**
 * Meta Spark AI Model integration for Comam Bengali Voice Billing.
 * Leverages muse-spark-1.3 with graceful fallback to deterministic parsing.
 */
import type { Product, Customer } from '@/types/pos';
import type { ComamDraft, DraftItem, UnknownItem, Ambiguity, CommandKind, ReportType } from './comam-engine';
import { parseComamCommand } from './comam-engine';
import { formatBnNumber, formatBnTaka } from './bn-parser';
import { findCustomer, searchProducts } from './comam-matcher';

interface AIModelResponse {
  kind: 'sale' | 'due_query' | 'report' | 'due_payment' | 'undo' | 'unknown';
  customer_name?: string | null;
  payment_type?: 'Cash' | 'Due' | 'UPI';
  items?: Array<{
    product_query: string;
    quantity: number;
    unit?: string;
    stated_price?: number | null;
  }>;
  report_type?: ReportType | null;
  target_product?: string | null;
  due_payment_amount?: number | null;
  summary_bn?: string | null;
}

export async function understandWithMetaSpark(
  command: string,
  products: Product[],
  customers: Customer[]
): Promise<ComamDraft | null> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.MODEL_BASE_URL || 'https://api.meta.ai/v1';
  const modelName = process.env.MODEL_NAME || 'muse-spark-1.3';

  // Build compact catalog reference for the AI
  const catalogSample = products
    .filter((p) => p.isActive !== false)
    .slice(0, 80)
    .map((p) => `${p.nameBn || p.name} (৳${p.sellingPrice}/${p.unit})`)
    .join(', ');

  const customerSample = customers
    .filter((c) => c.isActive !== false)
    .slice(0, 40)
    .map((c) => (c as any).nameBn || c.name)
    .join(', ');

  const systemPrompt = `You are Comam AI, an expert Bengali natural language parser for retail grocery and kirana shops.
Your job is to parse spoken Bengali shopkeeper/customer commands into structured JSON.

Command Kinds:
1. "sale": Customer buying products (e.g. "১:১০ টাকা দামের ব্রিটানিয়া মেরী বিস্কুট এবং এক কেজি খোলা চিনি", "আধা কেজি চিনি খোলা এক কেজি খোলা ময়দা এবং হল ৳10 দামের দুটো হলুদের প্যাকেট", "৳40 দামের কোকাকোলা দুইটা একটা ৳100 দামের স্প্রাইট")
2. "due_query": Customer asking for unpaid debt/due (e.g. "কার কত বাকি?", "লক্ষণ সরকারের বাকি কত?")
3. "report": Asking sales or inventory reports (e.g. "আজকের মোট বিক্রি কত?", "আমুল শক্তি কয়টা বিক্রি হয়েছে?", "কোন মাল শেষ হয়ে আসছে?")
4. "due_payment": Customer paying back old debt (e.g. "রহিমদা ৫০০ টাকা জমা দিলেন")
5. "undo": Cancel last sale (e.g. "শেষ বিক্রিটা বাতিল করো")

Rules:
- NO Random Customer Guessing: If no customer is mentioned in the sale, "customer_name" MUST BE null! Only extract customer_name if explicitly mentioned with "নামে", "খাতায়", "কে", or start of sentence.
- Bengali Traditional Units: "পোয়া" / "পোয়া" = 0.25 kg. "আধা" / "আধ" = 0.5. "দেড়" = 1.5. "আড়াই" = 2.5.
- Piece words: "দুইটা" / "দুটো" = 2, "একটা" = 1, "তিনটা" = 3 piece.
- Punctuation words like "কমা", "দাঁড়ি", "ফুলস্টপ" are speech recognition artifacts, NEVER product names.
- Extract stated prices if mentioned (e.g. "৳১০ দামের", "10 টাকা দামের", "৳40 দামের").

Available Store Products Sample: ${catalogSample}
Available Customers Sample: ${customerSample}

Respond ONLY in strict JSON schema:
{
  "kind": "sale" | "due_query" | "report" | "due_payment" | "undo" | "unknown",
  "customer_name": string | null,
  "payment_type": "Cash" | "Due" | "UPI",
  "items": [
    {
      "product_query": string,
      "quantity": number,
      "unit": "piece" | "kg" | "litre",
      "stated_price": number | null
    }
  ],
  "report_type": "sales_summary" | "low_stock" | "top_products" | "week_compare" | "product_sales" | null,
  "target_product": string | null,
  "due_payment_amount": number | null
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s network timeout

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: command },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[comam-ai] Meta API returned ${res.status}: ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed: AIModelResponse = JSON.parse(content);
    return buildDraftFromAI(parsed, command, products, customers);
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('[comam-ai] AI inference bypassed, using deterministic engine:', err?.message || err);
    return null;
  }
}

function buildDraftFromAI(
  ai: AIModelResponse,
  raw: string,
  products: Product[],
  customers: Customer[]
): ComamDraft {
  // If AI classified as report, due query, due payment, or undo
  if (ai.kind === 'due_query' || ai.kind === 'report' || ai.kind === 'due_payment' || ai.kind === 'undo') {
    // Let deterministic parser refine the DB linkages for non-sales commands
    return parseComamCommand(raw, products, customers);
  }

  // Handle Customer Matching
  let customer: Customer | null = null;
  let customerName: string | null = null;
  let hasUnknownCustomer = false;

  if (ai.customer_name && ai.customer_name.trim()) {
    customerName = ai.customer_name.trim();
    customer = findCustomer(customers, customerName);
    if (!customer) {
      hasUnknownCustomer = true;
    }
  }

  const paymentType: 'Cash' | 'Due' | 'UPI' = ai.payment_type || (customer ? 'Due' : 'Cash');

  // Handle Items
  const items: DraftItem[] = [];
  const unknownItems: UnknownItem[] = [];
  const ambiguities: Ambiguity[] = [];

  if (Array.isArray(ai.items) && ai.items.length > 0) {
    for (const rawIt of ai.items) {
      const q = (rawIt.product_query || '').trim();
      if (!q || q.length < 2) continue;

      const qty = typeof rawIt.quantity === 'number' && rawIt.quantity > 0 ? rawIt.quantity : 1;
      const statedPrice = typeof rawIt.stated_price === 'number' ? rawIt.stated_price : null;

      const { matches, isAmbiguous } = searchProducts(products, q);

      if (matches.length === 0) {
        unknownItems.push({
          text: q,
          qty,
          statedPrice,
        });
        continue;
      }

      // If stated price specified, match variant
      let chosenProduct = matches[0].product;
      if (statedPrice !== null) {
        const priceHit = matches.find((m) => Math.abs(m.product.sellingPrice - statedPrice) < 0.01);
        if (priceHit) {
          chosenProduct = priceHit.product;
        }
      }

      const unitPrice = chosenProduct.sellingPrice > 0 ? chosenProduct.sellingPrice : (statedPrice || 0);
      const lineTotal = Math.round(unitPrice * qty * 100) / 100;

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
        ambiguities.push({
          text: q,
          productId: chosenProduct.id,
          options,
        });
      }

      items.push({
        product: chosenProduct,
        productId: chosenProduct.id,
        name: chosenProduct.name,
        nameBn: chosenProduct.nameBn || chosenProduct.name,
        qty,
        unit: rawIt.unit || chosenProduct.unit,
        unitPrice,
        lineTotal,
        ambiguous: isAmbiguous,
        options,
      });
    }
  }

  // If AI returned 0 items, fallback to deterministic parser
  if (items.length === 0 && unknownItems.length === 0) {
    return parseComamCommand(raw, products, customers);
  }

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // Bengali Summary Readback
  let summaryBn = '';
  if (items.length > 0) {
    const itemSummaries = items.map(
      (it) => `${it.nameBn || it.name} (${formatBnNumber(it.qty)} ${it.unit})`
    );
    summaryBn = `${itemSummaries.join(', ')} — মোট ${formatBnTaka(total)}`;
    const custName = customer?.name || customerName;
    if (custName) {
      summaryBn += ` (${custName}-এর নামে ${paymentType === 'Due' ? 'বাকি' : paymentType === 'UPI' ? 'ইউপিআই' : 'বিল'})`;
      if (hasUnknownCustomer) {
        summaryBn += ` — সতর্কতা: "${customerName}" গ্রাহক তালিকায় নেই, নতুন তৈরি করতে পারেন।`;
      }
    } else {
      summaryBn += ` (${paymentType === 'Due' ? 'বাকি' : paymentType === 'UPI' ? 'ইউপিআই' : 'নগদ'})`;
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
    customerName: customer ? ((customer as any).nameBn || customerName || customer.name) : customerName,
    hasUnknownCustomer,
    paymentType,
    total: Math.round(total * 100) / 100,
    summaryBn,
    needsClarification: ambiguities.length > 0,
  };
}

