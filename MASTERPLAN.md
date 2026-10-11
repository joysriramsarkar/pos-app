# POS App — মাস্টারপ্ল্যান (পরিকল্পনা.md + stability-audit-bn.docx একত্রিত)

> উৎস: `পরিকল্পনা.md` (≈3800 লাইন, 5টি মতামত) + `pos-app-stability-audit-bn.docx` (C1–C10, H1–H15, M1–M20)।
> নীতি: **Feature freeze** — নতুন ফিচার নয়; শুধু bug/security/reliability fix + regression test।
> বেসলাইন: commit `3f68d0b`, lint 0, typecheck 0, 326 test pass, `next build` সফল — কিন্তু P0/P1 লজিক বাগ টুলে ধরা পড়ে না।

## 0. মতামত-ম্যাপ (deduplication)

| মাস্টার ID | পরিকল্পনা.md | docx | বিষয় |
|---|---|---|---|
| MP-01 | STAB-001 | — | Seed খালি password + rerun reset |
| MP-02 | STAB-002, §1.1, H9 + docx §24 | C5/H9 | Package manager npm vs pnpm, Dockerfile ভাঙা |
| MP-03 | STAB-003 | — | build.mjs Linux→Cloudflare ভুল detect |
| MP-04 | DB-001 + মতামত-৪ §5 | H-nd | Prisma singleton prod-এ leak + pool reset leak |
| MP-05 | AUTH-001 | — | Phone `contains(last10)` account takeover |
| MP-06 | AUTH-002 | — | `requiresPasswordChange` hard-coded false |
| MP-07 | AUTH-003 + §14 | H-nd | JWT 10 বছর + revocation নেই |
| MP-08 | AUTH-004 | — | Primary membership nondeterministic + inactive business |
| MP-09 | AUTH-005 | — | failedLoginAttempts race |
| MP-10 | AUTH-006 + H6 | H6/M10 | PII log + unstructured logging |
| MP-11 | SEC-001 | — | Firestore cross-tenant read/write |
| MP-12 | TEN-001 + §4.4 | — | Invalid business silent fallback |
| MP-13 | TEN-002 + H3 | C-RLS/H3 | RLS helper unwired — Path B (app-level) ঘোষণা |
| MP-14 | TEN-003 | — | Permission dual source of truth → static map authoritative |
| MP-15 | TEN-004 + মতামত-৪ §7 | — | Double `getServerSession` প্রতি request |
| MP-16 | DB-002 | §7 | Decimal precision `@db.Decimal(19,2)/(19,6)/(7,4)` |
| MP-17 | DB-003/DB-004 | §7 | Missing Business relation + composite tenant FK |
| MP-18 | DB-005 | — | One-open-shift partial unique index + shiftNumber race |
| MP-19 | DB-006 | §7 | Non-negative CHECK constraints |
| MP-20 | FIN-001 + মতামত-৪ §1 | §8 | Due/prepaid absolute update lost-update → atomic |
| MP-21 | FIN-002 + C7 | C7 | Online `/api/sales` vs offline `/api/sync` duplicate logic → `src/domain/` service |
| MP-22 | FIN-003 + M20 | M20 | Audit best-effort, tx-এর বাইরে |
| MP-23 | FIN-004 | — | Product audit `businessId` null |
| MP-24 | FIN-005 + H13 | H13 | Money early-rounding + `value \|\| 0` coercion |
| MP-25 | I18N-001..004 + H12 + M18 | H12/M18 | Receipt enum, both-unit, ₹ hardcode, timezone |
| MP-26 | OFF-001..005 + C9/H15 | C9/H15 | Dual queue, retry RMW, money Number, logout purge, parity test |
| MP-27 | মতামত-২ §1 | C-nd | `/api/sync`-এ permission check নেই (VIEWER sale পারে) — **সবচেয়ে গুরুতর** |
| MP-28 | মতামত-২ §2 | §9 matrix | Proxy 307 redirect → client "server-এ সংরক্ষিত" মিথ্যা |
| MP-29 | মতামত-২ §3/§4 | H2 | Offline product edit `currentStock` overwrite + WAC/supplier loss |
| MP-30 | মতামত-২ §5 | §9 | Sync dependency-order ভেঙে permanent dead-letter |
| MP-31 | মতামত-২ §6 | — | tx-এর ভেতরে raw-SQL fallback (dead code) + popularity try/catch |
| MP-32 | মতামত-২ §7 + মতামত-৪ §1–2 | §8 | Idempotency `in_progress` stuck + `finalize.catch(()=>{})` + 409 INPROGRESS vs CONFLICT |
| MP-33 | BACKUP-001..003 + H11 | §15 | Backup OWNER-only, Zod validation, size limit, snapshot, PITR drill |
| MP-34 | ENV-001/ENV-002 + C4 | C4/M1/M2 | env fail-fast, dummy URL, hard-coded domains |
| MP-35 | SEC-002/SEC-003 + মতামত-৪ §8–9 | C8 | CSRF wildcard, error.message leak, IP spoof, rate-limit fallback |
| MP-36 | QA-001..005 + C1–C3,C5,C6,C10 | C1–C3,C5,C6,C10 | CI build নেই, ESLint off, tests typecheck বাদ, coverage নেই, Playwright example |
| MP-37 | মতামত-২ §8 | — | Cron fail-open + Cloudflare trigger নেই |
| MP-38 | মতামত-২ §11/§12/§13 | M19 | Register open/slug/500 leak, account-deletion false-success, dead code |
| MP-39 | মতামত-৪ §4–6,10–13 + H1,H4,H5,H7,H8,H10,H14 + M-সিরিজ | H/M | Invoice race, health token/load, any-lint, Prisma pin, compose ordering, IDB docs, quota, scanner, print matrix, CSV injection |
| MP-40 | docx §3,§8–§20 | — | Invariants, golden dataset, observability, perf, Android, supply-chain, phased plan, exit criteria |

## 1. Phase 0 — Feature freeze + baseline (1–2 দিন) [MP-40]

- [x] `পরিকল্পনা.md` + docx → এই MASTERPLAN (dedupe)
- [x] `main` tag + baseline রেকর্ড (lint/typecheck/test/build ফলাফল)
- [x] Canonical package manager = **npm** (lockfile `package-lock.json` একটিই; pnpm সরাও) [MP-02]
- [x] Critical invariant owner-approved doc (§3 invariant তালিকা — docx §3)

## 2. Phase 1 — Build/config gate (P0) [MP-01..04, MP-34..36]

| # | Fix | Acceptance | Status |
|---|---|---|---|
| 1 | seed: `trim()`, min 12, rerun-এ password reset নয়, `requiresPasswordChange: !configured` | খালি password-এ throw; rerun-এ hash অপরিবর্তিত | ✅ done |
| 2 | `.env.example`: `# SEED_ADMIN_PASSWORD="..."` comment | কপি-পেস্টে খালি seed অসম্ভব | ✅ done |
| 3 | Dockerfile npm-only + `packageManager`/`engines` + README `npm ci` | `docker build` green (CI job) | ✅ done |
| 4 | build.mjs explicit `BUILD_TARGET=node\|cloudflare`, scripts `build`/`build:worker` | Linux CI ভুল Cloudflare path নেয় না | ✅ done (`npm run build` green) |
| 5 | Prisma Node singleton সব env-এ cache + reset-এ `$disconnect()` + error-code ভিত্তিক reset | 500 parallel-এ 1 client | ✅ done |
| 6 | env fail-fast: prod-এ `DATABASE_URL`, `NEXTAUTH_SECRET≥32`, `NEXTAUTH_URL`, `ALLOWED_ORIGINS`, `RESTORE_CONFIRMATION_TOKEN≥32` required; dummy URL শুধু test | ভুল config-এ boot fail | ✅ done |
| 7 | CI: build-node, docker, integration (postgres:16), E2E smoke, prisma validate, test-typecheck | `example.spec.ts` সরিয়ে POS smoke | ✅ done (pos-smoke.spec.ts, 4 tests) |
| 8 | ESLint critical rules warn→error; `tsconfig.test.json`; vitest coverage thresholds | `npm run typecheck:test` green | ✅ done (0 errors; 19 legacy test-type errors fixed) |

## 2b. Phase 1b — Database hardening (2026-10-11, production-এ applied ✅)

- [x] Read-only pre-validation (`scripts/validate-migration-readiness.ts`): 0 orphan/mismatch, 1 legacy negative-due row, 133 float-noise prices, 0 dup open shifts
- [x] `prisma/migrations/20261011_hardening/`: 55-column precision (19,2/19,6/7,4), `session_version`, FK (Payment/TaxCategory/SaleReturnItem→Product), 28 CHECK, partial open-shift index, sync composite index — dry-run ROLLBACK-এ live-data verified, তারপর `migrate deploy` applied, `migrate status` = up to date
- [x] `20260913_enable_rls` একইসাথে applied (app role `bypassrls=true` বলে app-এ প্রভাব নেই; Path B: app-level isolation authoritative)
- [x] Prisma trio exact `7.10.0` pin (package.json + lockfile)

## 3. Phase 2 — Auth/tenant/security (P0) [MP-05..15, MP-27,28,32,35] — ✅ code done

- Phone E.164 normalize + exact `findUnique`, `contains` নিষিদ্ধ; legacy migration + unique index [MP-05]
- `requiresPasswordChange` DB→JWT→session propagate; change-এ false [MP-06]
- JWT maxAge 7d; sensitive ops-এ re-auth; `sessionVersion` যোগ করে logout-all/password-change-এ increment [MP-07]
- Membership `orderBy createdAt asc` + `business.isActive` filter; last-active-business preference [MP-08]
- `failedLoginAttempts: {increment:1}` atomic + threshold tx-এ [MP-09]
- Prod log-এ identifier SHA256/12 fingerprint [MP-10]
- Firestore: অব্যবহৃত হলে deny-all; ব্যবহৃত হলে `members/{uid}` check [MP-11]
- `requireBusinessContext(session?)`: session-BusinessId mismatch → 403 (fallback নয়); double-fetch সরাও [MP-12,15]
- RLS: **Path B** — app-level isolation authoritative; README "database-level isolation" দাবি সরাও; unscoped `findMany` architecture test [MP-13]
- Permission: static `ROLE_PERMISSIONS` authoritative; DB tables seed-only/deprecate [MP-14]
- `/api/sync` ACTION_PERMISSION map + `checkPermission` tx-এর আগে; `PUT markSynced` → `sales.create` [MP-27]
- Proxy: `/api/*` 401 JSON (redirect নয়); client `content-type: application/json + body.success` guard; single worker codepath [MP-28]
- CSRF exact allow-list; prod-এ localhost/capacitor-wildcard নয়; IP `cf-connecting-ip` → rightmost-trusted; `/api/sync` rate-limit; error contract `{code,message,requestId}` [MP-35]
- Idempotency tx-এর ভেতরে INSERT; `X-Idempotency-Key: uuid` mandatory; 409 `INPROGRESS(Retry-After)` vs `CONFLICT` [MP-32] — ✅ in-tx done (withdraw/due-collect/prepay-add/supplier-pay); key এখনও optional (UI key পাঠায় না — mandatory করলে UI ভাঙবে; follow-up)
- `sessionVersion` ✅ wired (login→JWT→session→requireBusinessContext 401; change-password-এ increment)

## 4. Phase 3 — Financial core (P0/P1) [MP-16..24, MP-29,30,31,39] — ✅ done

- [x] Decimal precision + CHECK + shift index + FK (Phase 1b migration)
- [x] `src/domain/sales/sale-totals.ts`: online + sync একই core (subtotal/discount/tax/payment-status/MIXED/walk-in); parity tests golden-147 সহ
- [x] Sync walk-in full-pay parity (dead-letter + device rollback পথ আগে থেকেই আছে)
- [x] In-tx idempotency: withdraw / due-collect / prepay-add / supplier-pay (claim+finalize atomic; stuck-claim অসম্ভব; INPROGRESS=409+Retry-After)
- [x] Invoice P2002 bounded retry (online); shiftNumber P2002 → 409 friendly (DB unique + partial index backstop)
- [x] Audit `logAudit(tx)`; product audit top-level `businessId`
- [x] Money: unit 6dp + single-rounding + `parseMoneyStrict`; schema `z.coerce` string-সহনশীল (OFF-003 forward-compat)
- [x] Sync: stock/cost overwrite বন্ধ, popularity post-commit, dependency note (full conformance suite = follow-up)
- [x] 20 route-এ `toClientError` sweep (P2002→409, P2025→404); coded business errors untouched

- Decimal: money `(19,2)`, qty `(19,6)`, tax `(7,4)`; CHECK ≥0; shift partial-unique; composite tenant FK [MP-16..19]
- Due/prepaid atomic `increment/decrement + where gte` বা `FOR UPDATE`; ledger-fold reconciliation test [MP-20]
- `src/domain/sales|customers|inventory|prepayment/` service; `/api/sales` + `/api/sync` একই `createSale()` [MP-21]
- Audit `logAudit(tx,…)` tx-এর ভেতরে; product audit top-level `businessId` required [MP-22,23]
- Money: unit 6dp, intermediate full precision, line/invoice 2dp; `value\|\|0` → strict reject NaN/Infinity/empty [MP-24]
- Sync: product-update-এ `currentStock/buyingPrice` ignore (ডেল্টা-only); stock-update → stock-entry service (WAC/ledger) [MP-29]
- Dependency-order: fail-এ same-ID পরের items skip (dead-letter নয়); financial-এ LWW নিষিদ্ধ [MP-30]
- Raw-SQL fallback মুছো; popularity commit-এর পরে best-effort [MP-31]
- Invoice DB-sequence/row-lock + P2002 bounded retry; shortage auto-adjust auditable + UI warning [MP-39/H1,H2]

## 5. Phase 4 — Offline/i18n/backup (P1) [MP-25,26,33,37,38] — ✅ code done

- [x] `canClaimLease` + atomic `claimLease`/`releaseLease` (Web Locks already in worker); lease decision unit tests
- [x] `business-time.ts` (UTC storage + business-tz display/day-range) + receipt wiring + DST/midnight tests
- [x] Health: header-only token + timingSafeEqual + leak-free errors
- [x] Backup size-limit/Zod/generic errors; cron fail-closed; register slug/409; deletion 503
- [ ] Seeded checkout/offline/IDOR journey E2E (disposable DB দরকার — follow-up); read-only smoke ✅ 4/4 chromium

- Canonical `OfflineAction` queue (status/lease/attempts/nextRetryAt); migration v2→v3 test; lease `status=processing + owner + expiresAt`; single-tx get+put [MP-26]
- Payload money **string**; server Decimal parse [MP-26]
- Logout dialog "offline data মুছুন" + default purge (shared POS) [MP-26]
- Online/offline parity test (total/stock/due/prepaid/payments/audit) [MP-26]
- Receipt: পূর্ণ `PAYMENT_METHOD_LABELS`, `both → bn / en`, currency explicit (₹ fallback নয়), business-timezone সব query/receipt-এ [MP-25]
- Backup: export OWNER/ADMIN, restore OWNER(+overwrite-এ recent-password); strict Zod + size-limit + version; dry-run summary; snapshot + serializable tx + audit [MP-33]
- Cron fail-closed (secret না থাকলে 500) + Cloudflare `triggers.crons`/`scheduled` বা target নির্ধারণ [MP-37]
- Register: rate-limit, Bengali slug fallback `shop-xxxx`, 409 unique, generic error; account-deletion 503+limits; dead `customer:/prepayment:` sync actions সরাও; `GET /api/backup` pagination/stream [MP-38]

## 6. Phase 5 — QA/release hardening (P1/P2) [MP-36,39,40] — ✅ code done

- [x] Route-guard architecture test (~50 routes; allowlist: register/nextauth/deletion/health/cron)
- [x] `pos-smoke.spec.ts` (health/login/invalid-login/401-JSON); `example.spec.ts` removed; webServer=`npm run start`; CI chromium job with build
- [x] Proxy 401-JSON live-proven (smoke ধরেছিল 307 bug → `authorized:()=>true` fix → 4/4 green)
- [ ] Backup-restore drill, concurrency integration (disposable PG), Android/print matrix — manual/scheduled follow-ups (Relations: RLS Path B documented; no doc claims to fix)

- C1: `tests/example.spec.ts` → seeded E2E (cash/due/prepaid/mixed, stock-shortage, dup-submit, two-tab, offline/reconnect, dead-letter, return/cancel, due-collect, supplier-pay, IDOR, role-deny, switch-isolation, backup-restore)
- C2/C3: test-typecheck + coverage (money/sale 100%, stock/ledger/sync 95%+, tenant 90%+)
- C6/C10: empty-DB + snapshot-upgrade migration rehearsal; postgres:16 integration (double-sale, dup-key, withdraw-race, PO-race, rollback-injection)
- Observability: requestId, error codes (`VALIDATION_FAILED, PERMISSION_DENIED, STOCK_SHORTAGE, VERSION_CONFLICT, DUPLICATE_IN_PROGRESS, SESSION_EXPIRED, RATE_LIMITED, INTERNAL_ERROR`), PII-free logs, Sentry, golden signals + alerts
- Perf: 10k product/50k sale dataset, composite indexes, cursor pagination, pool sizing, receipt-PDF commit থেকে decouple
- Android/scanner/print: lifecycle matrix, 58/80/A4/A5 golden fixtures (bn+en, long names, decimal qty), camera-permission, quota/private-mode paths
- Supply-chain: exact pins, Prisma trio same version, Dependabot grouped, SHA-pinned actions, SBOM, `db push` dev-only (`migrate deploy` prod)
- Architecture lint: no `db` import in client, no floating money (`Number/parseFloat/Math.round`), no raw Date-range (tz-helper only), no `console` (logger only), no `db:push` in prod docs

## 7. Follow-ups (সচেতনভাবে বাকি — উপরের exit gate-এর বাইরে নয়, নিচে দেখো)

- [x] SyncQueue retention: `purgeOldSyncedQueue` (90d, synced-only) + fail-closed cron + vercel schedule + unit test
- [x] RLS remaining 4 tables (migration `20261011_rls_remaining`, dry-run + deploy verified)
- [x] Client idempotency keys: 5 money-POST sites (due×2, prepay-add, withdraw, supplier-pay) + helper + tests
- [x] Live-DB proof `scripts/stab-proof.ts`: 8/8 (concurrent stock, key race, CHECK live-fire, partial index live-fire, cross-tenant invisibility, session_version, cleanup)
- [x] `multi-tenant.md` git-recovered (2877 lines); audit: core migration ~85% DONE
- [ ] SaaS features (NEW scope — freeze-বহির্ভূত, সিদ্ধান্ত দরকার): OTP/OtpCode, Subscription/billing, /admin portal, Device registry, Branch, tenant cache/search, full journey E2E, restore drill, Android/print matrix
- [x] `Setting` legacy: production-এ 19 global rows সক্রিয় (Lakhan defaults) — model-এ DEPRECATED চিহ্নিত; `purchase-orders` GST note tenant-first (৳ দোকানে ₹ বাগ ফিক্স); settings-merge আচরণ অপরিবর্তিত
- [x] Backup validator: `src/lib/backup-validator.ts` + CLI + 4 unit tests (tenant/refs/uniqueness/money-scale) — CLI exit-code proven
- [x] `docs/release-runbook.md`: restore drill, cron-target সিদ্ধান্ত (Vercel authoritative; Cloudflare triggers অনুপস্থিত), Android/scanner/print matrices, deploy order
- [x] Config leftovers: next.config dead origins + hardcoded LAN IP → `DEV_ORIGINS` env (M1/M2); wrangler prod origins থেকে localhost বাদ; deprecated `worker.js` deleted; `.env.example`-এ `DEV_ORIGINS` documented
- [x] Client hardening: `syncErrors` cap 50 + test; IDB `onversionchange`/`onblocked` handlers; ARCHITECTURE.md DB-name drift fixed (H14)
- [x] M19 CSV formula-injection regression tests (sanitizer আগে থেকেই ছিল)
- [x] MP-30 dependency-skip: failed item-এর entity ছোঁয়া পরের batch hold (pending থাকে, dead-letter নয়)

## 8. Exit criteria (সব ✅ না হলে stable tag নয়)

`npm ci` · `prisma validate` · fresh+upgrade migration · ESLint 0 · typecheck (app+test) 0 · unit/integration green · Playwright critical green · node+docker+cloudflare build green · cross-tenant green · concurrent stock/ledger green · offline idempotency green · backup-restore drill green · Firestore test/disabled · P0/P1 0 · secret 0 · error-leak 0
