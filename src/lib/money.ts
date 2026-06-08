import Decimal from 'decimal.js';

export function toMoneyDecimal(value: Decimal.Value | null | undefined): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// Keep this for backwards compatibility where numbers are absolutely required (e.g. legacy components)
export function toMoneyNumber(value: Decimal.Value | null | undefined): number {
  return toMoneyDecimal(value).toNumber();
}

export function addMoney(...values: (Decimal.Value | null | undefined)[]): number {
  const result = values.reduce((sum, value) => new Decimal(sum || 0).plus(value || 0), new Decimal(0));
  return toMoneyNumber(result);
}

export function subtractMoney(value: Decimal.Value | null | undefined, ...subtractors: (Decimal.Value | null | undefined)[]): number {
  const result = subtractors.reduce<Decimal>(
    (res, subtrahend) => res.minus(subtrahend || 0),
    new Decimal(value || 0)
  );
  return toMoneyNumber(result);
}

export function multiplyMoney(left: Decimal.Value | null | undefined, right: Decimal.Value | null | undefined): number {
  return toMoneyNumber(new Decimal(left || 0).times(right || 0));
}
