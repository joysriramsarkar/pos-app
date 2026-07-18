/**
 * Map internal errors to safe client-facing messages.
 * Logs keep full detail; clients only get known, non-sensitive copy.
 */

const SAFE_CLIENT_PATTERNS: Array<{ match: RegExp | string; message: string; status: number }> = [
  {
    match: /Insufficient prepaid balance/i,
    message: "Insufficient prepaid balance for this sale",
    status: 400,
  },
  {
    match: /Walk-in customers must pay/i,
    message: "Walk-in customers must pay the full amount",
    status: 400,
  },
  {
    match: /Amount paid cannot exceed/i,
    message: "Amount paid cannot exceed sale total",
    status: 400,
  },
  {
    match: /Prepaid amount cannot exceed/i,
    message: "Prepaid amount cannot exceed total amount paid",
    status: 400,
  },
  {
    match: /Prepaid balance can only be used/i,
    message: "Prepaid balance can only be used with a selected customer",
    status: 400,
  },
  {
    match: /Received amount does not cover/i,
    message: "Received amount does not cover sale payment and prepaid change",
    status: 400,
  },
  {
    match: /Only completed sales/i,
    message: "Only completed sales can be cancelled or refunded",
    status: 400,
  },
  {
    match: /Cannot cancel\/refund a sale that already has returns/i,
    message: "Cannot cancel a sale that already has returns. Use the returns flow instead.",
    status: 400,
  },
  {
    match: /Sale ID is required/i,
    message: "Sale ID is required",
    status: 400,
  },
  {
    match: /Status must be Cancelled or Refunded/i,
    message: "Status must be Cancelled or Refunded",
    status: 400,
  },
  {
    match: /Sale not found/i,
    message: "Sale not found",
    status: 404,
  },
  {
    match: /Product not found/i,
    message: "One or more products were not found",
    status: 404,
  },
  {
    match: /Customer .+ not found/i,
    message: "Customer not found",
    status: 404,
  },
  {
    match: /No items/i,
    message: "Sale must include at least one item",
    status: 400,
  },
];

export function toClientError(
  error: unknown,
  fallbackMessage = "Request failed",
  fallbackStatus = 500,
): { message: string; status: number } {
  if (!(error instanceof Error)) {
    return { message: fallbackMessage, status: fallbackStatus };
  }

  const raw = error.message || fallbackMessage;

  for (const rule of SAFE_CLIENT_PATTERNS) {
    const hit =
      typeof rule.match === "string" ? raw.includes(rule.match) : rule.match.test(raw);
    if (hit) {
      return { message: rule.message, status: rule.status };
    }
  }

  // Never leak raw DB/internal messages in production responses
  if (process.env.NODE_ENV === "production") {
    return { message: fallbackMessage, status: fallbackStatus };
  }

  // Dev: still prefer generic for unknown errors
  return { message: fallbackMessage, status: fallbackStatus };
}
