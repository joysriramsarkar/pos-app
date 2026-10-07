/**
 * Server-side authorization for sale pricing.
 *
 * The client submits `unitPrice` and an order-level `discount`. Those are
 * untrusted. To prevent a cashier (10% limit) from bypassing the discount policy
 * by sending a manipulated unit price, we compute the effective discount against
 * the server-authoritative product selling price and enforce the caller's role
 * limit.
 */

import { ROLE_DISCOUNT_LIMITS, type BusinessRole } from "@/lib/permissions-helpers";

export interface PricedSaleItem {
  productId: string;
  quantity: number;
  totalPrice: number;
}

export interface PricingCheckResult {
  ok: boolean;
  message?: string;
  effectiveDiscountPercent?: number;
  maxAllowed?: number;
}

const EPSILON = 0.01;

export function checkSalePricingAuthority(
  items: PricedSaleItem[],
  orderDiscount: number,
  sellingPriceByProductId: Map<string, number>,
  role: string,
): PricingCheckResult {
  const maxAllowed = ROLE_DISCOUNT_LIMITS[role as BusinessRole] ?? 0;

  let listSubtotal = 0;
  let knownItems = 0;

  for (const item of items) {
    const listPrice = sellingPriceByProductId.get(item.productId);
    if (listPrice === undefined) continue;
    knownItems += 1;
    listSubtotal += listPrice * Number(item.quantity);
  }

  // If we could not resolve any authoritative price, let downstream validation
  // handle the sale rather than blocking legitimate untracked products.
  if (knownItems === 0 || listSubtotal <= 0) {
    return { ok: true };
  }

  const chargedSubtotal = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  const netRevenue = chargedSubtotal - Number(orderDiscount || 0);
  const discountAmount = listSubtotal - netRevenue;

  // Overcharging is not a discount exploit.
  const effectiveDiscountPercent = discountAmount <= 0 ? 0 : (discountAmount / listSubtotal) * 100;

  if (effectiveDiscountPercent > maxAllowed + EPSILON) {
    return {
      ok: false,
      message:
        `সর্বোচ্চ অনুমোদিত ছাড় ${maxAllowed}%, কিন্তু এই বিক্রয়ে কার্যকর ছাড় ` +
        `${effectiveDiscountPercent.toFixed(2)}% (আপনার ভূমিকা: ${role})। ` +
        `অতিরিক্ত ছাড়ের জন্য অনুমোদিত ভূমিকা প্রয়োজন।`,
      effectiveDiscountPercent: Number(effectiveDiscountPercent.toFixed(2)),
      maxAllowed,
    };
  }

  return {
    ok: true,
    effectiveDiscountPercent: Number(Math.max(0, effectiveDiscountPercent).toFixed(2)),
    maxAllowed,
  };
}
