/**
 * POS read-only smoke (MP-36/C1 first slice).
 * No business writes, no auth bypass: loads the login page and the public
 * health endpoint only. Full journey coverage (seeded checkout/offline/IDOR)
 * needs a disposable database + seeded tenant — tracked in MASTERPLAN Phase 5.
 */
import { test, expect } from "@playwright/test";

test.describe("POS public smoke (read-only)", () => {
  test("health endpoint answers JSON", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(typeof body.status).toBe("string");
    expect(typeof body.timestamp).toBe("string");
    // H4: detailed diagnostics must NOT leak without a header token.
    expect(body.counts).toBeUndefined();
    expect(body.routing).toBeUndefined();
  });

  test("login page renders credential fields", async ({ page }) => {
    await page.goto("/login");
    // Password tab may not be default — select it if present.
    const pwdTab = page.getByRole("tab", { name: /password|পাসওয়ার্ড/i });
    if (await pwdTab.count()) await pwdTab.first().click();
    // Production build serves prebuilt chunks; dev-server cold compile of the
    // Firebase-heavy form can stall, so E2E always targets `npm run start`.
    await expect(page.locator("#username")).toBeVisible({ timeout: 45000 });
    await expect(page.locator("#password")).toBeVisible();
  });

  test("invalid login is rejected (no session created)", async ({ page }) => {
    await page.goto("/login");
    const pwdTab = page.getByRole("tab", { name: /password|পাসওয়ার্ড/i });
    if (await pwdTab.count()) await pwdTab.first().click();
    await page.locator("#username").fill(`smoke-nonexistent-${Date.now()}`);
    await page.locator("#password").fill("wrong-password-12345");
    await page.getByRole("button", { name: /login|লগইন/i }).first().click();
    // Still on login (or shows an error) — never lands on /pos.
    await page.waitForTimeout(3000);
    expect(page.url()).not.toContain("/pos");
  });

  test("unauthenticated API returns 401 JSON (never a login redirect)", async ({ request }) => {
    // MP-28 regression: a 307→200 text/html chain once marked offline sales
    // as "saved on server". APIs must answer 401 JSON.
    const res = await request.post("/api/sync", {
      headers: { "X-Idempotency-Key": "smoke-probe-key" },
      data: { actionType: "sale:create", payload: {} },
    });
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"] ?? "").toContain("application/json");
  });
});
