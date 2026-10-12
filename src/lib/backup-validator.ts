/**
 * Offline backup-file validator (MP-33/BACKUP drill support).
 *
 * Run BEFORE any restore: `npx tsx scripts/validate-backup.ts <file.json>`.
 * Checks structure, version, tenant consistency, referential integrity,
 * money scales and row counts — without touching any database.
 * Exit 0 = safe to attempt restore (into a disposable DB first);
 * exit 1 = problems listed.
 */
import { z } from "zod";
import Decimal from "decimal.js";

const SUPPORTED_VERSIONS = ["2.1-multi-tenant", "2.0", "1.0"];

const BackupSchema = z.object({
  timestamp: z.string().optional(),
  version: z.string(),
  business: z.object({ id: z.string(), name: z.string(), slug: z.string() }).passthrough(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export interface BackupIssue {
  severity: "error" | "warning";
  check: string;
  detail: string;
}

export function validateBackup(payload: unknown): { ok: boolean; issues: BackupIssue[]; counts: Record<string, number> } {
  const issues: BackupIssue[] = [];
  const counts: Record<string, number> = {};
  const err = (check: string, detail: string) => issues.push({ severity: "error", check, detail });
  const warn = (check: string, detail: string) => issues.push({ severity: "warning", check, detail });

  const parsed = BackupSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, issues: [{ severity: "error", check: "structure", detail: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") }], counts };
  }
  const { version, business, data } = parsed.data;
  for (const [k, rows] of Object.entries(data)) counts[k] = rows.length;

  if (!SUPPORTED_VERSIONS.includes(version)) {
    warn("version", `unknown backup version "${version}" (supported: ${SUPPORTED_VERSIONS.join(", ")}) — restore may skip fields`);
  }

  const bizId = business.id;
  const ids = (rows: Array<Record<string, unknown>> | undefined, field = "id"): Set<string> =>
    new Set((rows ?? []).map((r) => String(r[field])).filter(Boolean));

  // --- tenant consistency: every tenant-owned row must belong to backup business ---
  const tenantTables: Array<[string, string]> = [
    ["products", "businessId"], ["categories", "businessId"], ["stockHistory", "businessId"],
    ["customers", "businessId"], ["ledgerEntries", "businessId"], ["sales", "businessId"],
    ["suppliers", "businessId"], ["purchases", "businessId"], ["businessSettings", "businessId"],
    ["memberships", "businessId"], ["payments", "businessId"], ["saleReturns", "businessId"],
    ["expenses", "businessId"], ["supplierLedgerEntries", "businessId"],
    ["cashRegisterShifts", "businessId"], ["dailyManualRecords", "businessId"],
    ["productPopularity", "businessId"], ["auditLogs", "businessId"],
  ];
  for (const [table, field] of tenantTables) {
    for (const row of data[table] ?? []) {
      if (row[field] !== undefined && row[field] !== bizId) {
        err("tenant", `${table}.${String(row.id)} has ${field}=${String(row[field])} ≠ backup business ${bizId}`);
      }
    }
  }

  // --- referential integrity ---
  const need = (table: string, ref: string, field: string, target: Set<string>, targetName: string) => {
    for (const row of data[table] ?? []) {
      const v = row[field];
      if (v !== undefined && v !== null && !target.has(String(v))) {
        err("references", `${table}.${String(row.id ?? "?")} ${ref} ${String(v)} missing from ${targetName}`);
      }
    }
  };
  const productIds = ids(data.products);
  const saleIds = ids(data.sales);
  const saleItemIds = ids(data.saleItems);
  const customerIds = ids(data.customers);
  const saleReturnIds = ids(data.saleReturns);
  const purchaseIds = ids(data.purchases);
  need("saleItems", "productId", "productId", productIds, "products");
  need("saleItems", "saleId", "saleId", saleIds, "sales");
  need("payments", "saleId", "saleId", saleIds, "sales");
  need("saleReturns", "saleId", "saleId", saleIds, "sales");
  need("saleReturnItems", "saleItemId", "saleItemId", saleItemIds, "saleItems");
  need("saleReturnItems", "productId", "productId", productIds, "products");
  need("purchaseItems", "purchaseId", "purchaseId", purchaseIds, "purchases");
  need("ledgerEntries", "customerId", "customerId", customerIds, "customers");
  need("supplierLedgerEntries", "supplierId", "supplierId", ids(data.suppliers), "suppliers");

  // --- sale invariant spot-check: items sum vs sale totals (2dp tolerance) ---
  const itemsBySale = new Map<string, Decimal>();
  for (const it of data.saleItems ?? []) {
    const sid = String(it.saleId ?? "");
    try {
      itemsBySale.set(sid, (itemsBySale.get(sid) ?? new Decimal(0)).plus(new Decimal(String(it.totalPrice ?? 0))));
    } catch { err("money", `saleItems.${String(it.id)} has non-numeric totalPrice`); }
  }
  for (const s of data.sales ?? []) {
    const expect = itemsBySale.get(String(s.id));
    if (expect === undefined) { warn("reconciliation", `sale ${String(s.id)} has no items in backup`); continue; }
    try {
      const sub = new Decimal(String((s as Record<string, unknown>).subtotal ?? 0));
      if (!sub.minus(expect).abs().lte(0.01)) {
        warn("reconciliation", `sale ${String(s.id)} subtotal ${sub.toString()} ≠ Σ items ${expect.toString()}`);
      }
    } catch { err("money", `sales.${String(s.id)} has non-numeric totals`); }
  }

  // --- money scales: >2dp in money fields is float drift ---
  const moneyFields: Array<[string, string[]]> = [
    ["products", ["buyingPrice", "sellingPrice"]],
    ["sales", ["subtotal", "discount", "tax", "totalAmount", "amountPaid"]],
    ["customers", ["totalDue", "totalPaid", "prepaidBalance"]],
    ["payments", ["amount"]],
  ];
  for (const [table, fields] of moneyFields) {
    for (const row of data[table] ?? []) {
      for (const f of fields) {
        const v = row[f];
        if (v === undefined || v === null) continue;
        try {
          if (new Decimal(String(v)).decimalPlaces() > 2) {
            warn("money-scale", `${table}.${String(row.id)}.${f} = ${String(v)} has >2dp`);
          }
        } catch { err("money", `${table}.${String(row.id)}.${f} is not numeric`); }
      }
    }
  }

  // --- invoice uniqueness within tenant ---
  const inv = new Map<string, number>();
  for (const s of data.sales ?? []) {
    const k = String((s as Record<string, unknown>).invoiceNumber ?? "");
    inv.set(k, (inv.get(k) ?? 0) + 1);
  }
  for (const [k, n] of inv) {
    if (n > 1) err("uniqueness", `duplicate invoiceNumber "${k}" × ${n}`);
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues, counts };
}
