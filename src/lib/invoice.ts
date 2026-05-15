import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a temporary, local invoice number for client-side use
 * Used for offline mode and temporary records before sync
 * WARNING: Not guaranteed unique across concurrent operations
 * Should be replaced by server-generated number when synced
 */
export function generateInvoiceNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const uuidFragment = uuidv4().split('-')[0].toUpperCase().substring(0, 8);
  return `INV-${dateStr}-${uuidFragment}`;
}

/**
 * Generates a unique invoice number for server-side use
 * Uses date + longer UUID fragment to minimize collision risk
 * Format: INV-YYYYMMDD-[12_CHAR_UUID_FRAGMENT]
 * Should be called only from server-side routes/actions
 */
export async function generateServerInvoiceNumber(): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const uuidFragment = uuidv4().split('-')[0].toUpperCase().substring(0, 12); // Increased from 8 to 12 chars
  
  return `INV-${dateStr}-${uuidFragment}`;
}
