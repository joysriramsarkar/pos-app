import { v4 as uuidv4 } from 'uuid';

/**
 * Format a Date as YYYYMMDD using local time (not UTC).
 * This ensures invoice dates match the business calendar in IST (UTC+5:30)
 * — toISOString() is UTC and can show yesterday's date between 00:00-05:30 IST.
 */
function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Generates a temporary, local invoice number for client-side use.
 * Used for offline mode and temporary records before sync.
 * WARNING: Not guaranteed unique across concurrent operations.
 * Should be replaced by server-generated number when synced.
 */
export function generateInvoiceNumber(): string {
  const dateStr = localDateString(new Date());
  const uuidFragment = uuidv4().split('-')[0].toUpperCase().substring(0, 8);
  return `INV-${dateStr}-${uuidFragment}`;
}

/**
 * Generates a unique invoice number for server-side use.
 * Uses local date (not UTC) + longer UUID fragment to minimize collision risk.
 * Format: INV-YYYYMMDD-[12_CHAR_UUID_FRAGMENT]
 * Should be called only from server-side routes/actions.
 */
export async function generateServerInvoiceNumber(): Promise<string> {
  const dateStr = localDateString(new Date());
  const uuidFragment = uuidv4().split('-')[0].toUpperCase().substring(0, 12);
  return `INV-${dateStr}-${uuidFragment}`;
}

