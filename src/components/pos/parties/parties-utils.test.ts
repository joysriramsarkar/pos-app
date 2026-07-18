import { describe, it, expect } from "vitest";
import { getInitialsBg, normalizeAndValidatePhone } from "./parties-utils";

describe("normalizeAndValidatePhone", () => {
  it("accepts 10-digit numbers", () => {
    expect(normalizeAndValidatePhone("9876543210")).toBe("9876543210");
  });

  it("strips +91 and leading 0 prefixes", () => {
    expect(normalizeAndValidatePhone("+919876543210")).toBe("9876543210");
    expect(normalizeAndValidatePhone("09876543210")).toBe("9876543210");
    expect(normalizeAndValidatePhone("919876543210")).toBe("9876543210");
  });

  it("converts Bengali digits", () => {
    expect(normalizeAndValidatePhone("৯৮৭৬৫৪৩২১০")).toBe("9876543210");
  });

  it("returns null for invalid numbers", () => {
    expect(normalizeAndValidatePhone("12345")).toBeNull();
    expect(normalizeAndValidatePhone("")).toBeNull();
  });
});

describe("getInitialsBg", () => {
  it("returns a stable class for the same name", () => {
    expect(getInitialsBg("Ram")).toBe(getInitialsBg("Ram"));
  });
});
