/**
 * Domain Error Codes — Standardized error vocabulary for Onuron POS
 *
 * All API errors should use these codes so the frontend can map them
 * to appropriate UI (dialogs, toasts, field errors) without parsing
 * raw error messages.
 *
 * Usage:
 *   throw new DomainError(ERROR_CODES.INSUFFICIENT_STOCK, `Rice stock: ${available}`);
 *   return NextResponse.json(domainError(ERROR_CODES.PERMISSION_DENIED), { status: 403 });
 */

// ============================================================================
// ERROR CODE CONSTANTS
// ============================================================================

export const ERROR_CODES = {
  // Authentication & Authorization
  AUTH_REQUIRED:        'AUTH_REQUIRED',
  FORBIDDEN:            'FORBIDDEN',
  PERMISSION_DENIED:    'PERMISSION_DENIED',
  TENANT_MISMATCH:      'TENANT_MISMATCH',
  SESSION_EXPIRED:      'SESSION_EXPIRED',
  ACCOUNT_LOCKED:       'ACCOUNT_LOCKED',

  // Validation
  VALIDATION_ERROR:     'VALIDATION_ERROR',
  INVALID_INPUT:        'INVALID_INPUT',
  MISSING_REQUIRED:     'MISSING_REQUIRED',

  // Products & Inventory
  PRODUCT_NOT_FOUND:    'PRODUCT_NOT_FOUND',
  DUPLICATE_BARCODE:    'DUPLICATE_BARCODE',
  DUPLICATE_SKU:        'DUPLICATE_SKU',
  INSUFFICIENT_STOCK:   'INSUFFICIENT_STOCK',
  NEGATIVE_STOCK:       'NEGATIVE_STOCK',
  STOCK_LOCKED:         'STOCK_LOCKED', // Concurrent stock update conflict

  // Sales
  SALE_NOT_FOUND:       'SALE_NOT_FOUND',
  DUPLICATE_INVOICE:    'DUPLICATE_INVOICE',
  PAYMENT_MISMATCH:     'PAYMENT_MISMATCH',
  INVALID_DISCOUNT:     'INVALID_DISCOUNT',
  DISCOUNT_LIMIT:       'DISCOUNT_LIMIT', // Exceeds role-allowed discount
  APPROVAL_REQUIRED:    'APPROVAL_REQUIRED', // Needs manager/owner approval

  // Returns & Refunds
  INVALID_RETURN:       'INVALID_RETURN',
  RETURN_EXCEEDS_SALE:  'RETURN_EXCEEDS_SALE',
  RETURN_WINDOW_CLOSED: 'RETURN_WINDOW_CLOSED',

  // Customers & Ledger
  CUSTOMER_NOT_FOUND:   'CUSTOMER_NOT_FOUND',
  DUPLICATE_CUSTOMER:   'DUPLICATE_CUSTOMER',
  INSUFFICIENT_PREPAID: 'INSUFFICIENT_PREPAID',
  DUE_LIMIT_EXCEEDED:   'DUE_LIMIT_EXCEEDED',

  // Suppliers & Purchases
  SUPPLIER_NOT_FOUND:   'SUPPLIER_NOT_FOUND',
  PURCHASE_NOT_FOUND:   'PURCHASE_NOT_FOUND',
  ALREADY_RECEIVED:     'ALREADY_RECEIVED',

  // Sync & Offline
  SYNC_CONFLICT:        'SYNC_CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  OFFLINE_UNAVAILABLE:  'OFFLINE_UNAVAILABLE',

  // Cash Register / Shift
  SHIFT_NOT_OPEN:       'SHIFT_NOT_OPEN',
  SHIFT_ALREADY_OPEN:   'SHIFT_ALREADY_OPEN',
  SHIFT_ALREADY_CLOSED: 'SHIFT_ALREADY_CLOSED',

  // Business & Settings
  BUSINESS_NOT_FOUND:   'BUSINESS_NOT_FOUND',
  BUSINESS_INACTIVE:    'BUSINESS_INACTIVE',
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',

  // Generic
  NOT_FOUND:            'NOT_FOUND',
  CONFLICT:             'CONFLICT',
  INTERNAL_ERROR:       'INTERNAL_ERROR',
  RATE_LIMITED:         'RATE_LIMITED',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================================================
// ERROR RESPONSE SHAPE
// ============================================================================

export interface DomainErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | DomainErrorResponse;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a standardized domain error response object.
 * Use this to build the JSON body for NextResponse.
 */
export function domainError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): DomainErrorResponse {
  return {
    success: false,
    error: { code, message, details },
  };
}

/**
 * Create a standardized success response object.
 */
export function successResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

// ============================================================================
// DOMAIN ERROR CLASS (for throwing server-side)
// ============================================================================

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  toResponse(): DomainErrorResponse {
    return domainError(this.code, this.message, this.details);
  }
}

// ============================================================================
// HTTP STATUS MAPPINGS
// ============================================================================

export const ERROR_HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  [ERROR_CODES.AUTH_REQUIRED]:        401,
  [ERROR_CODES.SESSION_EXPIRED]:      401,
  [ERROR_CODES.FORBIDDEN]:            403,
  [ERROR_CODES.PERMISSION_DENIED]:    403,
  [ERROR_CODES.TENANT_MISMATCH]:      403,
  [ERROR_CODES.ACCOUNT_LOCKED]:       403,
  [ERROR_CODES.RATE_LIMITED]:         429,
  [ERROR_CODES.INTERNAL_ERROR]:       500,
  [ERROR_CODES.NOT_FOUND]:            404,
  [ERROR_CODES.PRODUCT_NOT_FOUND]:    404,
  [ERROR_CODES.SALE_NOT_FOUND]:       404,
  [ERROR_CODES.CUSTOMER_NOT_FOUND]:   404,
  [ERROR_CODES.SUPPLIER_NOT_FOUND]:   404,
  [ERROR_CODES.PURCHASE_NOT_FOUND]:   404,
  [ERROR_CODES.BUSINESS_NOT_FOUND]:   404,
  [ERROR_CODES.CONFLICT]:             409,
  [ERROR_CODES.DUPLICATE_BARCODE]:    409,
  [ERROR_CODES.DUPLICATE_INVOICE]:    409,
  [ERROR_CODES.DUPLICATE_CUSTOMER]:   409,
  [ERROR_CODES.SYNC_CONFLICT]:        409,
  [ERROR_CODES.IDEMPOTENCY_CONFLICT]: 409,
};

/**
 * Get the HTTP status code for a domain error code.
 */
export function getHttpStatus(code: ErrorCode): number {
  return ERROR_HTTP_STATUS[code] ?? 400;
}

// ============================================================================
// FRONTEND ERROR MAPPINGS (for UI handling)
// ============================================================================

/**
 * Map of error codes to user-facing Bengali messages.
 * Used by frontend to show appropriate toast/dialog.
 */
export const ERROR_MESSAGES_BN: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.INSUFFICIENT_STOCK]:   'পর্যাপ্ত স্টক নেই',
  [ERROR_CODES.DUPLICATE_BARCODE]:    'এই বারকোড আগেই আছে',
  [ERROR_CODES.DUPLICATE_INVOICE]:    'এই invoice নম্বর আগেই আছে',
  [ERROR_CODES.PAYMENT_MISMATCH]:     'পেমেন্টের পরিমাণ মিলছে না',
  [ERROR_CODES.PERMISSION_DENIED]:    'এই কাজের অনুমতি নেই',
  [ERROR_CODES.AUTH_REQUIRED]:        'লগইন প্রয়োজন',
  [ERROR_CODES.INSUFFICIENT_PREPAID]: 'প্রিপেইড ব্যালেন্স যথেষ্ট নেই',
  [ERROR_CODES.DISCOUNT_LIMIT]:       'এত বেশি ছাড় দেওয়ার অনুমতি নেই',
  [ERROR_CODES.APPROVAL_REQUIRED]:    'Manager বা Owner-এর অনুমোদন প্রয়োজন',
  [ERROR_CODES.SYNC_CONFLICT]:        'Sync conflict — ডেটা আপডেট হয়েছে',
  [ERROR_CODES.CUSTOMER_NOT_FOUND]:   'গ্রাহক পাওয়া যায়নি',
  [ERROR_CODES.PRODUCT_NOT_FOUND]:    'পণ্য পাওয়া যায়নি',
  [ERROR_CODES.SALE_NOT_FOUND]:       'বিক্রয় পাওয়া যায়নি',
  [ERROR_CODES.RATE_LIMITED]:         'অনেকবার চেষ্টা হয়েছে, একটু অপেক্ষা করুন',
};

export const ERROR_MESSAGES_EN: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.INSUFFICIENT_STOCK]:   'Insufficient stock',
  [ERROR_CODES.DUPLICATE_BARCODE]:    'Barcode already exists',
  [ERROR_CODES.DUPLICATE_INVOICE]:    'Invoice number already exists',
  [ERROR_CODES.PAYMENT_MISMATCH]:     'Payment amount mismatch',
  [ERROR_CODES.PERMISSION_DENIED]:    'You do not have permission for this action',
  [ERROR_CODES.AUTH_REQUIRED]:        'Login required',
  [ERROR_CODES.INSUFFICIENT_PREPAID]: 'Insufficient prepaid balance',
  [ERROR_CODES.DISCOUNT_LIMIT]:       'Discount exceeds your allowed limit',
  [ERROR_CODES.APPROVAL_REQUIRED]:    'Requires manager or owner approval',
  [ERROR_CODES.SYNC_CONFLICT]:        'Sync conflict detected',
  [ERROR_CODES.CUSTOMER_NOT_FOUND]:   'Customer not found',
  [ERROR_CODES.PRODUCT_NOT_FOUND]:    'Product not found',
  [ERROR_CODES.SALE_NOT_FOUND]:       'Sale not found',
  [ERROR_CODES.RATE_LIMITED]:         'Too many requests, please wait',
};
