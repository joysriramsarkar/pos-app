import Decimal from 'decimal.js';

/**
 * Money helpers (MP-24).
 * Rules:
 * - Money totals: 2dp HALF_UP. Unit prices / WAC: 6dp.
 * - Intermediate calculations keep full Decimal precision; round only at
 *   line-total / invoice-total / ledger boundaries.
 * - Invalid inputs (null/undefined/NaN/Infinity/empty) are REJECTED by
 *   parseMoneyStrict; legacy toMoneyDecimal coerces null/undefined → 0 only.
 */
export function toMoneyDecimal(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return new Decimal(0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Strict parser for API boundaries — throws on NaN/Infinity/empty. */
export function parseMoneyStrict(value: unknown, field = "amount"): Decimal {
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(`${field} must not be empty`);
  }
  const d = new Decimal(value as Decimal.Value);
  if (!d.isFinite()) {
    throw new Error(`${field} must be a finite number`);
  }
  return d;
}

// Keep this for backwards compatibility where numbers are absolutely required (e.g. legacy components)
export function toMoneyNumber(value: Decimal.Value | null | undefined): number {
  return toMoneyDecimal(value).toNumber();
}

export function toUnitPriceDecimal(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined || (typeof value === "string" && (value as string).trim() === "")) {
    return new Decimal(0).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

export function toUnitPriceNumber(value: Decimal.Value | null | undefined): number {
  return toUnitPriceDecimal(value).toNumber();
}

/** Sum at full precision, round once at the end (MP-24 fix). */
export function addMoney(...values: (Decimal.Value | null | undefined)[]): Decimal {
  const result = values.reduce<Decimal>(
    (sum, value) =>
      sum.plus(
        value === null || value === undefined ? new Decimal(0) : new Decimal(value)
      ),
    new Decimal(0)
  );
  return result.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function subtractMoney(value: Decimal.Value | null | undefined, ...subtractors: (Decimal.Value | null | undefined)[]): Decimal {
  const start = value === null || value === undefined ? new Decimal(0) : new Decimal(value);
  const result = subtractors.reduce<Decimal>(
    (res, subtrahend) =>
      res.minus(
        subtrahend === null || subtrahend === undefined ? new Decimal(0) : new Decimal(subtrahend)
      ),
    start
  );
  return result.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Quantity × unit-price at full precision; caller rounds the line total. */
export function multiplyMoneyRaw(left: Decimal.Value | null | undefined, right: Decimal.Value | null | undefined): Decimal {
  const l = left === null || left === undefined ? new Decimal(0) : new Decimal(left);
  const r = right === null || right === undefined ? new Decimal(0) : new Decimal(right);
  return l.times(r);
}

export function multiplyMoney(left: Decimal.Value | null | undefined, right: Decimal.Value | null | undefined): Decimal {
  return multiplyMoneyRaw(left, right).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Canonical line-total: raw = unitPrice(6dp) × qty, then 2dp HALF_UP. */
export function toLineTotal(unitPrice: Decimal.Value | null | undefined, quantity: Decimal.Value | null | undefined): Decimal {
  return toUnitPriceDecimal(unitPrice)
    .times(quantity === null || quantity === undefined ? new Decimal(0) : new Decimal(quantity))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
