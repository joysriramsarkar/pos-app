/**
 * Architecture guard (MP-13/MP-27/MP-35).
 * Every API route must either enforce server-side auth/tenancy or be an
 * explicitly allowlisted public/secret-guarded endpoint. Adding a new route
 * without a guard fails this test instead of shipping an open endpoint.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.join(__dirname, "..", "app", "api");

// Public or secret-guarded routes that legitimately skip session auth.
// NOTE: cron/* is fail-closed via CRON_SECRET (MP-37), not session auth.
const ALLOWLIST = new Set([
  "auth/register/route.ts",
  "auth/[...nextauth]/route.ts",
  "account-deletion-request/route.ts",
  "health/route.ts",
  "cron/update-popularity/route.ts",
  "cron/purge-sync/route.ts",
]);

const GUARD_IMPORTS = [
  "requireBusinessContext",
  "withBusinessContext",
  "requireAuth",
  "withAuthMiddleware",
  "requirePermission",
  "requireRole",
  "getServerSession",
];

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...routeFiles(full));
    else if (/^route\.test\.|^route\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(full);
  }
  return out;
}

describe("API route guards", () => {
  const files = routeFiles(API_ROOT);
  expect(files.length).toBeGreaterThan(10);

  for (const f of files) {
    const rel = path.relative(API_ROOT, f).replace(/\\/g, "/");
    if (ALLOWLIST.has(rel)) continue;
    const src = fs.readFileSync(f, "utf-8");
    const guarded = GUARD_IMPORTS.some((g) => src.includes(g));
    it(`guards ${rel}`, () => {
      expect(guarded).toBe(true);
    });
  }

  it("documents every allowlisted exception", () => {
    for (const rel of ALLOWLIST) {
      expect(fs.existsSync(path.join(API_ROOT, rel))).toBe(true);
    }
  });
});
