import Decimal from 'decimal.js';

export function toMoneyDecimal(value: Decimal.Value | null | undefined): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// Keep this for backwards compatibility where numbers are absolutely required (e.g. legacy components)
export function toMoneyNumber(value: Decimal.Value | null | undefined): number {
  return toMoneyDecimal(value).toNumber();
}

export function toUnitPriceDecimal(value: Decimal.Value | null | undefined): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

export function toUnitPriceNumber(value: Decimal.Value | null | undefined): number {
  return toUnitPriceDecimal(value).toNumber();
}

export function addMoney(...values: (Decimal.Value | null | undefined)[]): Decimal {
  const result = values.reduce<Decimal>((sum, value) => sum.plus(toMoneyDecimal(value)), new Decimal(0));
  return toMoneyDecimal(result);
}

export function subtractMoney(value: Decimal.Value | null | undefined, ...subtractors: (Decimal.Value | null | undefined)[]): Decimal {
  const result = subtractors.reduce<Decimal>(
    (res, subtrahend) => res.minus(toMoneyDecimal(subtrahend)),
    toMoneyDecimal(value)
  );
  return toMoneyDecimal(result);
}

export function multiplyMoney(left: Decimal.Value | null | undefined, right: Decimal.Value | null | undefined): Decimal {
  const result = new Decimal(left || 0).times(new Decimal(right || 0));
  return toMoneyDecimal(result);
}
