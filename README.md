<div align="center">
  <img src="https://img.icons8.com/color/96/000000/shop.png" alt="POS Logo" width="80" height="80">
  <h1>Next.js Point of Sale (POS) System</h1>
  <p>A modern, offline-first Point of Sale PWA for seamless retail operations.</p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
    <img src="https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" />
  </p>
</div>

---

## ✨ Features

- 📶 **Offline-First**: IndexedDB local cache + sync worker (`src/lib/offline/`). See [ARCHITECTURE.md](src/lib/offline/ARCHITECTURE.md).
- 🌍 **Bilingual (EN/BN)**: Full English and Bengali UI via `next-intl`. Settings-driven **app language** and separate **receipt language** (`bn` / `en` / `both`). Bengali digits and dates when UI is Bangla; currency symbol comes from Settings (never hard-coded ৳/₹).
- 📱 **Barcode Scanning**: Global keyboard-wedge scanner support on desktop. Native camera scanning on Android via Capacitor ML Kit.
- 🛒 **Cart & Checkout**: Multi-tab cart with per-tab independent checkout processing, prepaid balance, partial/due payments, change-as-prepayment, split Cash+UPI payments.
- 🧾 **Invoice & Printing**: Thermal (58mm / 80mm) and A4/A5 invoices. Desktop uses the browser print dialog; Android WebView opens the system print panel (PDF share as last resort — never raw HTML). Share always generates a **PDF** (WhatsApp / download).
- 📦 **Inventory Management**: Product CRUD, weighted average cost (WAC), bulk stock entry, stock history audit trail, cost snapshot at sale for accurate profit reports.
- 👥 **Parties**: Customer and supplier management with ledger-based due tracking, prepaid balance top-up, and prepaid cash withdrawal. Due collection UX for fast repayments.
- 📊 **Dashboard & Reports**: Real-time sales stats with cash/UPI reconciliation, category/product/customer reports, expense tracking, consistent chart labels/colors from settings.
- 🛡️ **Audit Logs**: Database-level logging of all critical actions (sales, stock changes, user modifications).
- 🔐 **Role-Based Access**: Admin / Manager / Cashier / Viewer roles via NextAuth.js with per-permission checks on every API route.
- ⚡ **Performance**: Virtualized stock management list (`react-virtuoso`) for high-performance 60fps rendering of large product catalogs. Composite DB indexes on products table (`isActive`, `category+isActive`, `name`). Sales API uses field-level `select` to minimise data transfer.

---

## 🛠️ Technology Stack

| Category | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router), React 19 |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4, shadcn/ui |
| **State Management** | Zustand |
| **Database & ORM** | Prisma 7 (PostgreSQL via Supabase) |
| **Offline Storage** | IndexedDB |
| **Authentication** | NextAuth.js |
| **Native (Android)** | Capacitor 8, ML Kit barcode, Filesystem + Share for PDF |
| **Localization** | `next-intl`, Google Input Tools API, `src/lib/receipt-i18n.ts` |
| **Arithmetic** | `decimal.js` (precise money calculations) |
| **Print / PDF** | `src/lib/printUtility.ts`, `src/lib/invoicePdf.ts` (jsPDF) |

---

## 🏁 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A PostgreSQL database (e.g. [Supabase](https://supabase.com) free tier)

### Installation

**Package manager:** npm only (`package-lock.json`). Do not commit `bun.lock`.

**1. Clone & install dependencies**
```bash
npm install
```

**2. Environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your database and secrets. Required keys are documented in `.env.example`:

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | yes | Postgres connection string |
| `DIRECT_URL` | for migrations | Direct (non-pooled) URL |
| `NEXTAUTH_SECRET` | yes | ≥ 32 chars (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | yes | e.g. `http://localhost:3000` |
| `ALLOWED_ORIGINS` | prod | Comma-separated CORS/CSRF origins |
| `SEED_ADMIN_PASSWORD` | optional | Stable password for `npm run db:seed` |

> `NEXTAUTH_SECRET` should be a strong random string, at least 32 characters long.

**3. Database setup**
```bash
npm run db:push
npm run db:generate
npm run db:seed
```

**4. Start dev server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If `SEED_ADMIN_PASSWORD` is set, the admin user will be seeded with:
- username: `admin`
- password: the value of `SEED_ADMIN_PASSWORD`

If `SEED_ADMIN_PASSWORD` is not set, the seed script generates a random one-time password and prints it during `npm run db:seed`.

---

## 🏗️ Architecture

- **Offline Sync** (`src/lib/offline/`): Action queue in IndexedDB with idempotency keys. The sync worker replays queued operations against `/api/sync` when connectivity is restored. Financial data uses ledger-based incremental updates to prevent race conditions. See [ARCHITECTURE.md](src/lib/offline/ARCHITECTURE.md) and [SUMMARY.md](src/lib/offline/SUMMARY.md).
- **Atomic Stock Updates**: Raw SQL `UNNEST` batch updates with conditional `WHERE current_stock >= quantity` prevent overselling under concurrent load.
- **Prisma Singleton** (`src/lib/db.ts`): Single `PrismaClient` instance cached in `globalThis` to prevent connection pool exhaustion during hot-reloads and serverless invocations.
- **Permission Middleware** (`src/lib/api-middleware.ts`): Every API route calls `requirePermission()` which validates session + RBAC in one pass — no duplicate session fetches.
- **Per-Tab Processing** (`src/stores/pos-store.ts`): Checkout processing state is tracked per cart tab via `processingTabIds` in UIStore, so one tab processing a sale never blocks another tab.
- **Prepayment Withdrawal** (`POST /api/prepayment/withdraw`): Customers can withdraw cash from their prepaid balance. Atomic transaction decrements balance and writes a `withdraw` ledger entry.
- **Money & locale**: `src/lib/money.ts` for decimal-safe amounts; `useNumberFormat` / `format-utils` for currency + Bengali digits; receipt copy uses Settings → **receipt language**, not only app UI language.
- **POS shell**: Main dashboard lives under `src/app/pos/` (`POSDashboard`, lazy page chunks, nav config) to keep `page.tsx` thin.

### Printing & sharing

| Surface | Print | Share |
| :--- | :--- | :--- |
| Desktop browser | Hidden iframe + `window.print()` | PDF via Web Share API, else download |
| Android (Capacitor) | WebView print → system PrintManager; optional cordova printer; PDF share only as last resort | PDF written to cache + `@capacitor/share` (never HTML) |

Key modules: `printUtility.ts`, `invoicePdf.ts`, `PrintDialog.tsx`, `PrintInvoice.tsx`, `receipt-i18n.ts`.

### Android (Capacitor)

```bash
# Keep webDir placeholder in sync (or point capacitor.config.ts server.url at your deployed app)
npx cap sync android

# Debug APK (requires JDK 21 + Android SDK)
cd android
./gradlew assembleDebug   # Windows: gradlew.bat assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

> This app is primarily a **Next.js server** (`output: 'standalone'`). The Capacitor shell should load your deployed URL (or live-reload during dev). After JS print/locale changes, redeploy the Next server **and** reinstall a freshly synced APK if native plugins changed.

### i18n checks

```bash
node scripts/find-missing-i18n.mjs   # reports missing keys in messages/en.json & bn.json
```

---

## 📜 License

Public domain — [CC0 1.0 Universal](LICENSE).
