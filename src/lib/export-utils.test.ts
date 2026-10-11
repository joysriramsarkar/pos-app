import { describe, expect, it } from "vitest";
import { buildCSV, escapeCSVField } from "@/lib/export-utils";

describe("M19 CSV formula-injection sanitizer", () => {
  it.each(["=1+1", "+123", "-2+3", "@evil", "\tcmd", "\rcmd"])(
    "neutralises %p",
    (v) => {
      // prefixed with ' (possibly inside CSV quotes for tab/CR cases)
      expect(escapeCSVField(v)).toContain("'" + v[0]);
    }
  );

  it("preserves plain numbers (incl. negatives) and normal text", () => {
    expect(escapeCSVField("-42")).toBe("-42");
    expect(escapeCSVField("12.50")).toBe("12.50");
    expect(escapeCSVField("লক্ষ্মণ ভাণ্ডার")).toBe("লক্ষ্মণ ভাণ্ডার");
    expect(escapeCSVField(null)).toBe("");
  });

  it("quotes cells containing commas/quotes/newlines", () => {
    expect(escapeCSVField('a"b')).toBe('"a""b"');
    expect(escapeCSVField("a,b")).toBe('"a,b"');
  });

  it("builds a BOM CSV with every cell sanitised", () => {
    const csv = buildCSV([["name", "note"], ["x", "=HYPERLINK(\"http://evil\")"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
  });
});
