/**
 * CSV Export Utilities for লক্ষ্মণ ভাণ্ডার POS Application
 * Handles UTF-8 BOM for proper Bengali text display in Excel
 */

/**
 * Escapes a field value for CSV format.
 * Quotes the field if it contains commas, quotes, or newlines.
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Converts a value to a string, handling null/undefined, numbers, and Bengali text.
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return String(value);
}

/**
 * Export data as a CSV file with proper UTF-8 BOM encoding for Bengali text.
 *
 * @param data - Array of objects to export
 * @param filename - The filename for the downloaded CSV (without extension)
 * @param headers - Optional custom headers with key (matching data keys) and label (column header)
 *                  If not provided, object keys are used as headers
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  headers?: { key: string; label: string }[]
): void {
  if (!data || data.length === 0) return;

  // Determine headers
  const csvHeaders = headers || Object.keys(data[0]).map((key) => ({ key, label: key }));

  // Build CSV rows
  const headerRow = csvHeaders.map((h) => escapeCSVField(h.label)).join(',');
  const dataRows = data.map((row) =>
    csvHeaders.map((h) => escapeCSVField(valueToString(row[h.key]))).join(',')
  );

  // Add UTF-8 BOM for proper Bengali text display in Excel
  const BOM = '\uFEFF';
  const csvContent = BOM + headerRow + '\n' + dataRows.join('\n');

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get today's date formatted as YYYY-MM-DD for filenames.
 */
export function getExportDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
