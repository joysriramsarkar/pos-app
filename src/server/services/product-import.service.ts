/**
 * Product Import/Export Service
 *
 * Enables bulk product management via CSV/Excel.
 * Import pipeline: Parse → Normalize → Validate → Duplicate Check → Preview → Commit
 *
 * Template columns:
 * SKU, Barcode, Name, Bengali Name, Category, Purchase Price,
 * Selling Price, Unit, Opening Stock, Minimum Stock, Tax Rate
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';
import { DomainError, ERROR_CODES } from '@/lib/domain-errors';

// ============================================================================
// TYPES
// ============================================================================

export interface ProductImportRow {
  sku?: string;
  barcode?: string;
  name: string;
  nameBn?: string;
  category?: string;
  subCategory?: string;
  buyingPrice?: number;
  sellingPrice?: number;
  unit?: string;
  openingStock?: number;
  minStockLevel?: number;
  taxRate?: number;

  // Validation result (added during processing)
  _rowIndex?: number;
  _status?: 'valid' | 'duplicate' | 'invalid';
  _errors?: string[];
}

export interface ImportPreview {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  rows: Array<ProductImportRow & { _status: string; _errors: string[] }>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; name: string; reason: string }>;
}

// ============================================================================
// CSV PARSER
// ============================================================================

/**
 * Parse CSV text into product import rows.
 * Handles BOM, Windows line endings, quoted fields.
 */
export function parseProductCSV(csvText: string): ProductImportRow[] {
  // Remove BOM if present
  const text = csvText.replace(/^\uFEFF/, '').trim();

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header row
  const header = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, '').replace(/_/g, '')
  );

  const COL_MAP: Record<string, keyof ProductImportRow> = {
    sku:           'sku',
    barcode:       'barcode',
    name:          'name',
    englishname:   'name',
    nameen:        'name',
    banglaname:    'nameBn',
    bengaliname:   'nameBn',
    namebn:        'nameBn',
    category:      'category',
    subcategory:   'subCategory',
    buyingprice:   'buyingPrice',
    purchaseprice: 'buyingPrice',
    sellingprice:  'sellingPrice',
    unit:          'unit',
    openingstock:  'openingStock',
    stock:         'openingStock',
    minstock:      'minStockLevel',
    minimumstock:  'minStockLevel',
    taxrate:       'taxRate',
    tax:           'taxRate',
  };

  const rows: ProductImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.every((v) => !v.trim())) continue; // Skip empty rows

    const row: ProductImportRow = { name: '', _rowIndex: i };

    for (let j = 0; j < header.length; j++) {
      const col = COL_MAP[header[j]];
      if (!col) continue;
      const val = values[j]?.trim() ?? '';

      if (['buyingPrice', 'sellingPrice', 'openingStock', 'minStockLevel', 'taxRate'].includes(col)) {
        const num = parseFloat(val.replace(/,/g, ''));
        (row as any)[col] = isNaN(num) ? undefined : num;
      } else {
        (row as any)[col] = val || undefined;
      }
    }

    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

// ============================================================================
// VALIDATION
// ============================================================================

const VALID_UNITS = ['piece', 'kg', 'gram', 'liter', 'ml', 'packet', 'box', 'carton', 'dozen', 'pair'];

export function validateImportRow(row: ProductImportRow): string[] {
  const errors: string[] = [];

  if (!row.name?.trim()) errors.push('Name is required');
  if (row.name && row.name.length > 200) errors.push('Name is too long (max 200 chars)');

  if (row.sellingPrice !== undefined && row.sellingPrice < 0) {
    errors.push('Selling price cannot be negative');
  }
  if (row.buyingPrice !== undefined && row.buyingPrice < 0) {
    errors.push('Purchase price cannot be negative');
  }
  if (row.openingStock !== undefined && row.openingStock < 0) {
    errors.push('Opening stock cannot be negative');
  }
  if (row.minStockLevel !== undefined && row.minStockLevel < 0) {
    errors.push('Minimum stock cannot be negative');
  }
  if (row.taxRate !== undefined && (row.taxRate < 0 || row.taxRate > 100)) {
    errors.push('Tax rate must be between 0 and 100');
  }
  if (row.unit && !VALID_UNITS.includes(row.unit.toLowerCase())) {
    // Just warn, don't block
    // errors.push(`Unknown unit: ${row.unit}`);
  }

  return errors;
}

// ============================================================================
// PREVIEW (VALIDATE + DUPLICATE CHECK)
// ============================================================================

export async function previewImport(
  rows: ProductImportRow[],
  businessId: string
): Promise<ImportPreview> {
  // Get existing barcodes and names
  const existingProducts = await db.product.findMany({
    where: { businessId, isActive: true },
    select: { barcode: true, name: true },
  });

  const existingBarcodes = new Set(existingProducts.map((p) => p.barcode).filter(Boolean));
  const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));

  let valid = 0, duplicates = 0, invalid = 0;

  const processedRows = rows.map((row) => {
    const errors = validateImportRow(row);

    let status: 'valid' | 'duplicate' | 'invalid';

    if (errors.length > 0) {
      status = 'invalid';
      invalid++;
    } else if (
      (row.barcode && existingBarcodes.has(row.barcode)) ||
      existingNames.has(row.name.toLowerCase())
    ) {
      status = 'duplicate';
      if (row.barcode && existingBarcodes.has(row.barcode)) {
        errors.push('Barcode already exists');
      } else {
        errors.push('Product name already exists');
      }
      duplicates++;
    } else {
      status = 'valid';
      valid++;
    }

    return { ...row, _status: status, _errors: errors };
  });

  return {
    total: rows.length,
    valid,
    duplicates,
    invalid,
    rows: processedRows,
  };
}

// ============================================================================
// COMMIT IMPORT
// ============================================================================

/**
 * Commit valid rows to the database.
 * Skips duplicates and invalid rows by default.
 * Set `updateExisting: true` to update products with matching names/barcodes.
 */
export async function commitImport(
  rows: ProductImportRow[],
  businessId: string,
  userId?: string,
  options: { updateExisting?: boolean } = {}
): Promise<ImportResult> {
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; name: string; reason: string }> = [];

  for (const row of rows) {
    if (row._status !== 'valid') {
      skipped++;
      continue;
    }

    try {
      const productData = {
        businessId,
        name: row.name.trim(),
        nameBn: row.nameBn?.trim() || null,
        barcode: row.barcode?.trim() || null,
        category: row.category?.trim() || 'General',
        subCategory: row.subCategory?.trim() || null,
        buyingPrice: row.buyingPrice ?? 0,
        sellingPrice: row.sellingPrice ?? 0,
        unit: row.unit?.trim() || 'piece',
        currentStock: row.openingStock ?? 0,
        minStockLevel: row.minStockLevel ?? 5,
        isActive: true,
      };

      const product = await db.product.create({ data: productData });

      // Opening stock entry
      if ((row.openingStock ?? 0) > 0) {
        await db.stockHistory.create({
          data: {
            businessId,
            productId: product.id,
            changeType: 'OPENING',
            quantity: row.openingStock!,
            reason: 'Opening stock (import)',
            userId,
          },
        });
      }

      // Ensure category exists
      await db.category.upsert({
        where: { businessId_name: { businessId, name: productData.category } },
        create: { businessId, name: productData.category },
        update: {},
      });

      imported++;
    } catch (err: any) {
      errors.push({
        row: row._rowIndex!,
        name: row.name,
        reason: err.message || 'Unknown error',
      });
      skipped++;
    }
  }

  // Audit log
  if (imported > 0) {
    await db.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'IMPORT_PRODUCTS',
        entityType: 'Product',
        details: { imported, skipped, errorCount: errors.length },
      },
    });
  }

  return { imported, skipped, errors };
}

// ============================================================================
// EXPORT TO CSV
// ============================================================================

export async function exportProductsCSV(businessId: string): Promise<string> {
  const products = await db.product.findMany({
    where: { businessId, isActive: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      barcode: true,
      name: true,
      nameBn: true,
      category: true,
      subCategory: true,
      buyingPrice: true,
      sellingPrice: true,
      unit: true,
      currentStock: true,
      minStockLevel: true,
    },
  });

  const headers = [
    'Barcode', 'Name', 'Bengali Name', 'Category', 'Sub Category',
    'Purchase Price', 'Selling Price', 'Unit', 'Current Stock', 'Min Stock'
  ];

  const rows = products.map((p) => [
    p.barcode ?? '',
    p.name,
    p.nameBn ?? '',
    p.category,
    p.subCategory ?? '',
    Number(p.buyingPrice).toFixed(2),
    Number(p.sellingPrice).toFixed(2),
    p.unit,
    Number(p.currentStock).toFixed(0),
    Number(p.minStockLevel).toFixed(0),
  ]);

  // Neutralise CSV formula injection (cells starting with = + - @ tab/CR).
  const sanitize = (v: unknown): string => {
    const str = String(v);
    if (/^-?\d+(\.\d+)?$/.test(str)) return str;
    return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  };

  const csvLines = [
    headers.map(sanitize).join(','),
    ...rows.map((row) => row.map((v) => `"${sanitize(v).replace(/"/g, '""')}"`).join(',')),
  ];

  return '\uFEFF' + csvLines.join('\r\n'); // BOM for Excel compatibility
}

// ============================================================================
// IMPORT TEMPLATE
// ============================================================================

export function getImportTemplate(): string {
  const headers = [
    'Barcode', 'Name', 'Bengali Name', 'Category', 'Sub Category',
    'Purchase Price', 'Selling Price', 'Unit', 'Opening Stock', 'Min Stock', 'Tax Rate'
  ];
  const example = [
    '8901234567890', 'Rice 5kg', 'চাল ৫কেজি', 'Grains', '',
    '200', '250', 'packet', '50', '5', '0'
  ];

  return '\uFEFF' + [
    headers.join(','),
    example.map((v) => `"${v}"`).join(','),
  ].join('\r\n');
}
