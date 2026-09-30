import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function takeScreenshots() {
  const screenshotsDir = path.resolve('public/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    // 1. Login page (Bangla)
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    // Ensure Bangla is active on login
    const bnLangBtn = page.locator('#login-lang-bn');
    if (await bnLangBtn.isVisible()) {
      await bnLangBtn.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'login-bn.png') });
    console.log('Saved login-bn.png');

    // 2. Login page (English)
    const enLangBtn = page.locator('#login-lang-en');
    if (await enLangBtn.isVisible()) {
      await enLangBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, 'login-en.png') });
      console.log('Saved login-en.png');
    }

    // 3. Log in with admin credentials
    console.log('Logging in as admin...');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('echo123');
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to main page /
    console.log('Waiting for login redirect to / ...');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 25000 });
    console.log('Successfully redirected to:', page.url());

    // Wait for sidebar navigation to be visible
    await page.waitForSelector('aside', { timeout: 15000 });
    console.log('Sidebar loaded.');

    // 4. Billing Screen (Add an item to cart)
    console.log('Waiting for products to load in Billing...');
    const loadingProducts = page.locator('text="Loading products..."');
    if (await loadingProducts.isVisible()) {
      await loadingProducts.waitFor({ state: 'detached', timeout: 25000 }).catch(() => {});
    }
    await page.waitForTimeout(2000);

    // Click on the first product card to populate the cart panel
    const firstProduct = page.locator('[role="button"]').filter({ hasText: /₹|৳/ }).first();
    if (await firstProduct.isVisible()) {
      console.log('Adding product to cart...');
      await firstProduct.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'billing.png') });
    console.log('Saved billing.png');

    // 5. Dashboard screen
    console.log('Navigating to Dashboard...');
    const dashBtn = page.locator('aside button').filter({ hasText: /dashboard|ড্যাশবোর্ড/i }).first();
    if (await dashBtn.isVisible()) {
      const statsPromise = page.waitForResponse(
        (res) => res.url().includes('/api/stats') && res.status() === 200,
        { timeout: 30000 }
      ).catch(() => null);
      
      await dashBtn.click();
      await statsPromise;
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, 'dashboard.png') });
      console.log('Saved dashboard.png');
    }

    // 6. Stock / Inventory Management screen
    console.log('Navigating to Stock / Inventory...');
    const stockBtn = page.locator('aside button').filter({ hasText: /inventory|stock|স্টক/i }).first();
    if (await stockBtn.isVisible()) {
      await stockBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, 'stock-management.png') });
      console.log('Saved stock-management.png');
    }

    // 7. Transaction History screen
    console.log('Navigating to Transactions...');
    const transBtn = page.locator('aside button').filter({ hasText: /transaction|লেনদেন/i }).first();
    if (await transBtn.isVisible()) {
      const salesPromise = page.waitForResponse(
        (res) => res.url().includes('/api/sales') && res.status() === 200,
        { timeout: 30000 }
      ).catch(() => null);
      
      await transBtn.click();
      await salesPromise;
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(screenshotsDir, 'transactions.png') });
      console.log('Saved transactions.png');
    }

    // 8. Reports screen
    console.log('Navigating to Reports...');
    const reportsBtn = page.locator('aside button').filter({ hasText: /report|রিপোর্ট/i }).first();
    if (await reportsBtn.isVisible()) {
      await reportsBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, 'reports.png') });
      console.log('Saved reports.png');
    }

    // 9. Settings screen
    console.log('Navigating to Settings...');
    const settingsBtn = page.locator('aside button').filter({ hasText: /setting|সেটিংস/i }).first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, 'settings.png') });
      console.log('Saved settings.png');
    }

    // 10. Mobile Responsive View (Billing on Mobile)
    console.log('Capturing mobile view...');
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.waitForTimeout(1000);
    const mobileBillBtn = page.locator('nav button').filter({ hasText: /bill|বিলিং/i }).first();
    if (await mobileBillBtn.isVisible()) {
      await mobileBillBtn.click();
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-pos.png') });
    console.log('Saved mobile-pos.png');

    console.log('All screenshots completed successfully!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
