# Release runbook (freeze-compatible operations — no new features)

## 1. Backup → validate → restore drill (প্রতি release-এ একবার)

1. Export: OWNER/ADMIN login → `GET /api/backup` → `backup-<slug>-<date>.json` সংরক্ষণ।
2. Validate (DB ছোঁয় না):
   ```bash
   npx tsx scripts/validate-backup.ts backup-<slug>-<date>.json
   ```
   `BACKUP-OK` না আসা পর্যন্ত restore নয়। ERROR = restore বন্ধ; WARNING = নোট করে এগোনো যায়।
3. Restore target: **কখনো production-এ সরাসরি নয়**। Disposable database (CI postgres service বা staging):
   ```bash
   npx prisma migrate deploy --config prisma.config.ts   # target DB-তে
   # POST /api/backup + x-restore-confirmation header (OWNER only)
   npx tsx scripts/validate-migration-readiness.ts       # 0 orphan/mismatch
   ```
4. Reconciliation: dashboard total = sales report total = ledger fold = stock fold; mismatch ≠ 0 হলে release block।
5. RPO/RTO লক্ষ্য (ব্যবসায়িক সিদ্ধান্ত, প্রথম প্রস্তাব): RPO ≤ 24h (daily export), RTO ≤ 4h. Managed-DB PITR আলাদাভাবে চালু রাখো — application export একমাত্র backup নয়।

## 2. Cron কোথায় চলে (MP-37)

| Job | Vercel (`vercel.json`) | Cloudflare (`wrangler.jsonc`) |
|---|---|---|
| update-popularity (02:00) | ✅ fires | ❌ `triggers.crons` নেই + `scheduled` handler নেই → কখনো চলে না |
| purge-sync (02:30) | ✅ fires | ❌ একই |

Production target এখনও দ্বৈত (Vercel + Cloudflare দুটোই configured)। সিদ্ধান্ত না হওয়া পর্যন্ত: cron-এর জন্য **Vercel deployment-কে authoritative** ধরো, অথবা বাইরের scheduler (cron-job.org) দিয়ে HTTPS + `Authorization: Bearer $CRON_SECRET`। Cloudflare-কে primary করলে `triggers.crons` + `scheduled` handler wiring যাচাই করে নিতে হবে (এই repo-তে অনুপস্থিত — ইচ্ছা করে যোগ করিনি, ভুল confidence এড়াতে)।

## 3. Android lifecycle acceptance (প্রতি stable candidate-এ, supported device-এ)

- [ ] Checkout modal খোলা অবস্থায় background → foreground (state অক্ষত)
- [ ] Offline queued sale → OS process kill → relaunch (queue + cart অক্ষত)
- [ ] App upgrade with pending queue (IndexedDB v3 data preserved)
- [ ] Camera permission deny / permanently-deny / restore (scanner graceful)
- [ ] Wi-Fi → mobile switch + captive portal (sync retry, duplicate sale নেই)
- [ ] Low storage / quota (checkout safety-stop + warning, silent data loss নেই)
- [ ] Share/print intent cancel (sale state অপরিবর্তিত)
- [ ] Logout → আগের tenant-এর cart/product/customer দৃশ্যমান নয়

## 4. Scanner acceptance

- [ ] Rapid duplicate scan → debounce (quantity একবার বাড়ে)
- [ ] Scanner event dialog/input focus চুরি করে quantity বাড়ায় না
- [ ] ভুল/অজানা barcode → স্পষ্ট "not found", crash নয়

## 5. Print matrix (একই sale-এর golden fixture)

| Paper | Content check |
|---|---|
| 58mm | মোট + বাংলা লাইন দৃশ্যমান, কাটা নেই |
| 80mm | alignment ঠিক |
| A4/A5 | page-break/clipping নেই |
| bn/en/both | সেটিং অনুযায়ী; long product name ভাঙে না |
| Amounts | discount/tax/due/prepaid/mixed/return/change — DB total = print total |

## 6. Deploy order (প্রতি release)

1. `npm ci` → `prisma validate` → lint → typecheck(+test) → vitest → `npm run build` → smoke (CI-তে সব gate)
2. Backup + `validate-backup.ts` → `BACKUP-OK`
3. `prisma migrate deploy` (one-shot job; app replicas migrate চালাবে না)
4. App deploy → `/api/health` ok → synthetic sale/void (dedicated test business-এ, তারপর void)
5. Ledger/stock reconciliation ≠ 0 হলে rollback (পূর্ববর্তী build + restore)
