/**
 * Receipt Sharing Utility
 * Generates WhatsApp-friendly formatted digital receipts and handles Web Share API.
 */

export interface ReceiptSaleItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptSale {
  id: string;
  invoiceNumber: string;
  createdAt: string | Date;
  items: ReceiptSaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: string;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
}

export interface ReceiptBusiness {
  name: string;
  phone?: string | null;
  address?: string | null;
  currency?: string;
}

/**
 * Formats a clean, readable digital receipt string for WhatsApp and SMS sharing.
 */
export function formatReceiptText(
  sale: ReceiptSale,
  business: ReceiptBusiness
): string {
  const currency = business.currency || '₹';
  const dateStr = new Date(sale.createdAt).toLocaleDateString('bn-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = new Date(sale.createdAt).toLocaleTimeString('bn-BD', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const due = Math.max(0, sale.totalAmount - sale.amountPaid);

  let text = `🧾 *ডিজিটাল রসিদ (Cash Memo)*\n`;
  text += `🏪 *${business.name}*\n`;
  if (business.address) text += `📍 ${business.address}\n`;
  if (business.phone) text += `📞 ${business.phone}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📋 চালান নং: *${sale.invoiceNumber}*\n`;
  text += `📅 তারিখ: ${dateStr}, ${timeStr}\n`;
  if (sale.customerName) text += `👤 ক্রেতা: ${sale.customerName}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;

  // Item List
  sale.items.forEach((item, index) => {
    text += `${index + 1}. *${item.productName}*\n`;
    text += `   ${item.quantity} x ${currency}${item.unitPrice} = *${currency}${item.totalPrice}*\n`;
  });

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `মোট সাবটোটাল: ${currency}${sale.subtotal}\n`;
  if (sale.discount > 0) text += `ছাড় (Discount): -${currency}${sale.discount}\n`;
  if (sale.tax > 0) text += `ট্যাক্স (Tax): +${currency}${sale.tax}\n`;
  text += `*সর্বমোট বিল: ${currency}${sale.totalAmount}*\n`;
  text += `পরিশোধিত: ${currency}${sale.amountPaid} (${sale.paymentMethod})\n`;

  if (due > 0) {
    text += `⚠️ *অবশিষ্ট বাকি: ${currency}${due}*\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `ধন্যবাদ, আবার আসবেন! 🙏\n`;

  return text;
}

/**
 * Creates a direct WhatsApp share URL with the formatted receipt.
 */
export function getWhatsAppShareUrl(
  sale: ReceiptSale,
  business: ReceiptBusiness,
  customerPhone?: string | null
): string {
  const text = formatReceiptText(sale, business);
  const encodedText = encodeURIComponent(text);

  let phoneClean = (customerPhone || sale.customerPhone || '').replace(/\D/g, '');
  if (phoneClean && phoneClean.length === 10) {
    // Default Indian 10-digit number
    phoneClean = '91' + phoneClean;
  }

  if (phoneClean) {
    return `https://wa.me/${phoneClean}?text=${encodedText}`;
  }

  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Triggers native device sharing if available, otherwise falls back to WhatsApp Web.
 */
export async function shareReceipt(
  sale: ReceiptSale,
  business: ReceiptBusiness
): Promise<boolean> {
  const text = formatReceiptText(sale, business);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: `রসিদ - ${sale.invoiceNumber}`,
        text,
      });
      return true;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const url = getWhatsAppShareUrl(sale, business);
        window.open(url, '_blank');
      }
      return false;
    }
  }

  const url = getWhatsAppShareUrl(sale, business);
  window.open(url, '_blank');
  return true;
}

/**
 * Directly opens WhatsApp with the formatted digital receipt
 */
export function openWhatsAppReceipt(
  sale: ReceiptSale,
  business: ReceiptBusiness,
  customerPhone?: string | null
): void {
  const url = getWhatsAppShareUrl(sale, business, customerPhone);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}
