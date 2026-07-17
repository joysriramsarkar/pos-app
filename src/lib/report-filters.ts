/**
 * Shared report filters so Dashboard / Reports / detailed report pages
 * count the same sales universe.
 */

/** Sales that still count toward revenue (not cancelled / fully refunded void) */
export const REPORT_SALE_STATUSES = ["Completed", "PartialReturn"] as const;

export type ReportSaleStatus = (typeof REPORT_SALE_STATUSES)[number];

/** Prisma `in` filter */
export const reportSaleStatusFilter = {
  in: [...REPORT_SALE_STATUSES],
};

/** Client-side: keep rows that should appear in reports */
export function isReportableSaleStatus(status: string | null | undefined): boolean {
  return status === "Completed" || status === "PartialReturn";
}

/** Canonical payment method colors (matches CSS --chart-*) */
export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  Cash: "var(--chart-2)",
  UPI: "var(--chart-1)",
  Mixed: "var(--chart-5)",
  Due: "var(--chart-4)",
  Prepaid: "var(--chart-3)",
  Card: "var(--chart-3)", // legacy / unused
  Others: "var(--chart-5)",
  Other: "var(--chart-5)",
};

/** Display labels (BN) for payment methods stored in English */
export function paymentMethodLabelBn(method: string): string {
  switch (method) {
    case "Cash":
      return "নগদ";
    case "UPI":
      return "ইউপিআই";
    case "Mixed":
      return "মিশ্র";
    case "Due":
      return "বাকি";
    case "Prepaid":
      return "প্রিপেইড";
    case "Card":
      return "কার্ড";
    case "Others":
    case "Other":
      return "অন্যান্য";
    default:
      return method || "অন্যান্য";
  }
}

export function paymentMethodLabelEn(method: string): string {
  switch (method) {
    case "Cash":
      return "Cash";
    case "UPI":
      return "UPI";
    case "Mixed":
      return "Mixed";
    case "Due":
      return "Due";
    case "Prepaid":
      return "Prepaid";
    default:
      return method || "Other";
  }
}
