/**
 * Expense payment-method values.
 *
 * The database enum stores upper-case members, while the expense forms use
 * display labels ("Cash" / "UPI" / "Mixed"). Keeping both conversions in one
 * place stops the API from writing labels such as "Mixed" into a Prisma enum
 * (that is what made mixed payments fail with a validation error).
 */

export const EXPENSE_PAYMENT_METHODS = [
  'CASH',
  'UPI',
  'MIXED',
  'BANK',
  'CARD',
  'CHEQUE',
  'OTHER',
] as const;

export type ExpensePaymentMethodValue = (typeof EXPENSE_PAYMENT_METHODS)[number];

/** Any incoming value → a valid `ExpensePaymentMethod` enum member. */
export function toExpensePaymentMethod(
  raw?: string | null,
): ExpensePaymentMethodValue {
  const value = (raw ?? '').trim().toUpperCase();
  return (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(value)
    ? (value as ExpensePaymentMethodValue)
    : 'OTHER';
}

export type ExpensePaymentMethodUi =
  | 'Cash'
  | 'UPI'
  | 'Mixed'
  | 'Bank'
  | 'Card'
  | 'Cheque'
  | 'Other';

/** Enum member (or legacy label) → the value used by the expense forms. */
export function toExpensePaymentUi(raw?: string | null): ExpensePaymentMethodUi {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'UPI':
      return 'UPI';
    case 'MIXED':
      return 'Mixed';
    case 'BANK':
      return 'Bank';
    case 'CARD':
      return 'Card';
    case 'CHEQUE':
      return 'Cheque';
    case 'OTHER':
      return 'Other';
    case 'CASH':
      return 'Cash';
    default:
      // Legacy rows may have no method at all; the database default is CASH.
      return 'Cash';
  }
}
