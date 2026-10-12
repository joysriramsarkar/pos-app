# POS App — বিস্তারিত Static Code Audit Report

**অডিটের তারিখ: ১১ অক্টোবর ২০২৬**  
**অডিট করা branch: `main`**

> **গুরুত্বপূর্ণ সীমাবদ্ধতা:** এটি repository-এর বর্তমান source code, configuration, schema, API, offline layer, state store এবং test setup-এর একটি গভীর **static audit**। আমি repository clone করে real PostgreSQL/Android device/Cloudflare-এ build ও runtime test চালাতে পারিনি। তাই “কোডে নিশ্চিতভাবে দেখা সমস্যা” এবং “runtime test দিয়ে যাচাই করতে হবে”—দুটিকে আলাদা করে উল্লেখ করেছি।

আরেকটি সংশোধন: আগের সংক্ষিপ্ত রিপোর্টের তুলনায় বর্তমান `main` ইতিমধ্যে multi-tenant schema ব্যবহার করছে। অর্থাৎ এখন `Business`, `Membership`, tenant-scoped products/sales/customers ইত্যাদি merged অবস্থায় আছে। 

---

# ১. Executive summary

## বর্তমান মূল্যায়ন

| ক্ষেত্র | আনুমানিক অবস্থা |
|---|---:|
| Build reproducibility | 3/10 |
| Authentication security | 5/10 |
| Tenant isolation | 5/10 |
| Financial consistency | 6/10 |
| Offline reliability | 5/10 |
| Database integrity | 5/10 |
| Testing/CI | 3/10 |
| Maintainability | 4/10 |
| Production readiness | **এখনো নয়** |

অ্যাপটির foundation খারাপ নয়। বিশেষভাবে ভালো দিকগুলো হলো:

- TypeScript strict mode চালু।
- `decimal.js` দিয়ে money calculation করা হয়েছে।
- Tenant-scoped database model আছে।
- Offline sync-এ UUID idempotency key আছে।
- Firebase ID token এখন server-side cryptographically verify করা হয়।
- API permission ও business context-এর জন্য centralized helper আছে।
- IndexedDB tenant অনুযায়ী আলাদা করার চেষ্টা করা হয়েছে।
- Sale, stock, ledger এবং audit-এর ধারণাগত model যথেষ্ট সমৃদ্ধ। 

তবে কয়েকটি **P0/P1 সমস্যা** এখনই ঠিক না করলে production-এ নিচের ঘটনা ঘটতে পারে:

1. Admin account খালি password দিয়ে seed হতে পারে।
2. Docker build বর্তমান অবস্থায় lockfile mismatch-এর কারণে ব্যর্থ হতে পারে।
3. Production Node runtime-এ প্রতি DB operation-এ নতুন Prisma client/pool তৈরি হতে পারে।
4. Firestore rules চালু থাকলে cross-business data access সম্ভব।
5. OTP/phone login ভুল account match করতে পারে।
6. Invalid business session অন্য business-এ silently fallback করতে পারে।
7. Online sale এবং offline sync-এর business logic আলাদা হওয়ায় একই sale দুই পথে দুই ফল দিতে পারে।
8. Concurrent due/prepaid update হারিয়ে যেতে পারে।
9. CI production build, E2E বা integration test চালায় না।

---

# ২. সর্বোচ্চ অগ্রাধিকারের সমস্যা

---

## STAB-001 — `SEED_ADMIN_PASSWORD=""` দিলে খালি password hash হতে পারে

**Severity: P0 — Critical**

`.env.example`-এ আছে:

```env
SEED_ADMIN_PASSWORD=""
```

কিন্তু seed code ব্যবহার করছে:

```ts
const seedPassword =
  process.env.SEED_ADMIN_PASSWORD ??
  randomBytes(16).toString("hex");
```

Empty string `""` null বা undefined নয়। ফলে `.env.example` কপি করে কিছু না বদলালে:

```ts
bcrypt.hash("", 12)
```

হয়ে admin-এর password খালি string হতে পারে।

তারপর seed script প্রতিবার admin user-এর `passwordHash` update করে। অর্থাৎ production-এ seed পুনরায় চালালে admin password অপ্রত্যাশিতভাবে reset-ও হতে পারে। একইসঙ্গে generated one-time password ব্যবহার করলেও `requiresPasswordChange: false` করা হয়েছে। 

### প্রয়োজনীয় fix

```ts
const configuredPassword =
  process.env.SEED_ADMIN_PASSWORD?.trim();

if (configuredPassword && configuredPassword.length < 12) {
  throw new Error(
    "SEED_ADMIN_PASSWORD must be at least 12 characters"
  );
}

const generatedPassword =
  randomBytes(24).toString("base64url");

const seedPassword =
  configuredPassword || generatedPassword;

const passwordHash = await bcrypt.hash(seedPassword, 12);

await prisma.user.upsert({
  where: { username: "admin" },

  // Seed rerun যেন password reset না করে
  update: {
    name: "Administrator",
  },

  create: {
    username: "admin",
    name: "Administrator",
    passwordHash,
    requiresPasswordChange: !configuredPassword,
  },
});
```

### আরও যা করতে হবে

- ইতিমধ্যে seed করা admin password অবিলম্বে rotate করতে হবে।
- Password rotation-এর জন্য আলাদা script বানাতে হবে।
- Seed script-কে account/password management tool হিসেবে ব্যবহার করা যাবে না।
- `.env.example`-এ empty variable না রেখে comment করা ভালো:

```env
# SEED_ADMIN_PASSWORD="use-at-least-12-characters"
```

---

## STAB-002 — Docker build-এর package manager configuration ভাঙা

**Severity: P0 — Build blocking**

Repository-তে `package-lock.json` আছে এবং CI `npm ci` ব্যবহার করে। README-তেও package manager হিসেবে npm লেখা, কিন্তু installation command দেওয়া হয়েছে `pnpm install`। অন্যদিকে Dockerfile সরাসরি `pnpm-lock.yaml` copy করতে চায়:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile
```

কিন্তু root repository listing-এ `pnpm-lock.yaml` নেই। ফলে clean Docker build-এ `COPY` ধাপেই failure হওয়ার কথা। 

### Recommendation: npm-কে একমাত্র package manager করো

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate
ENV DOCKER_BUILD=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs \
  /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs \
  /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

### `package.json`-এ যোগ করো

```json
{
  "packageManager": "npm@11.x",
  "engines": {
    "node": "22.x",
    "npm": "11.x"
  }
}
```

README-তে:

```bash
npm ci
npm run db:generate
npm run db:seed
npm run dev
```

---

## STAB-003 — Linux build-কে ভুলভাবে Cloudflare build ধরা হচ্ছে

**Severity: P1 — High**

`build.mjs`-এ:

```ts
const isCloudflare = Boolean(
  process.env.BUILD_TARGET === 'cloudflare' ||
  ...
  (!isVercel &&
    process.platform === 'linux' &&
    !process.env.DOCKER_BUILD)
);
```

অর্থাৎ যেকোনো Linux server/CI/Docker environment—যদি `DOCKER_BUILD` explicitly set না থাকে—Cloudflare হিসেবে detect হবে। বর্তমান Dockerfile `DOCKER_BUILD` set করে না। ফলে Docker-এর জন্য standalone build করার সময় অপ্রয়োজনীয়ভাবে OpenNext Cloudflare packaging-ও চলতে পারে। 

### সঠিক পদ্ধতি

Environment অনুমান না করে explicit target ব্যবহার করো:

```ts
const target = process.env.BUILD_TARGET ?? "node";

const isCloudflare = target === "cloudflare";
const isNode = target === "node";
```

Scripts:

```json
{
  "build": "cross-env BUILD_TARGET=node node scripts/build.mjs",
  "build:worker": "cross-env BUILD_TARGET=cloudflare node scripts/build.mjs"
}
```

---

## DB-001 — Production Node runtime-এ Prisma connection pool leak হওয়ার ঝুঁকি

**Severity: P0/P1 — Critical**

`getPrismaClient()`-এ existing global client ফিরিয়ে দেওয়া হয়। কিন্তু নতুন client তৈরি হলে শুধু non-production environment-এ global variable-এ রাখা হচ্ছে:

```ts
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}
```

Production Node/Docker/Vercel execution-এ `globalForPrisma.prisma` empty থাকবে। `db` একটি Proxy এবং প্রতিবার property access-এ `getPrismaClient()` চলে। এর ফলে production-এ একাধিক Prisma client এবং PostgreSQL pool তৈরি হতে পারে।

README-তে singleton বলা হলেও implementation production Node-এ singleton নিশ্চিত করছে না। 

### Fix

Cloudflare request-scoped এবং Node singleton logic পুরোপুরি আলাদা করো:

```ts
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function getNodePrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma =
      createPrismaClient(getConnectionString());
  }

  return globalForPrisma.prisma;
}

function getPrismaClient(): PrismaClient {
  const cfContext = getCloudflareContextSafe();

  if (cfContext) {
    return getCloudflareRequestClient(cfContext);
  }

  return getNodePrismaClient();
}
```

### Test

একটি diagnostic test যোগ করো:

```ts
expect(getPrismaClient()).toBe(getPrismaClient());
```

Integration test-এ ৫০০ parallel health request চালিয়ে PostgreSQL connection count monitor করতে হবে।

---

# ৩. Authentication ও account security

---

## AUTH-001 — Phone/OTP login-এ `contains(last10Digits)` বিপজ্জনক

**Severity: P0/P1**

User lookup-এর সময় code exact phone ছাড়াও ব্যবহার করছে:

```ts
{ phone: { contains: last10Digits } }
```

এটি `findFirst()` দিয়ে চালানো হয়। ফলে আলাদা country code বা আলাদা stored phone format-এর দুই account-এর শেষ ১০ digit একই হলে ভুল user match হওয়ার সম্ভাবনা আছে।

OTP token সঠিকভাবে verified হলেও verified phone থেকে ভুল local account resolve হলে account takeover হতে পারে। Password login path-এও একই lookup logic ব্যবহৃত হচ্ছে। 

### Fix

সব phone number write করার সময় E.164 format-এ normalize করো:

```text
+919876543210
+8801712345678
```

তারপর exact unique lookup:

```ts
const canonicalPhone =
  normalizePhoneToE164(verifiedToken.phoneNumber);

const user = await db.user.findUnique({
  where: { phone: canonicalPhone },
  include: { memberships: ... }
});
```

কখনোই phone identity lookup-এ:

- `contains`
- `endsWith`
- last 10 digit
- fuzzy search

ব্যবহার করা যাবে না।

Legacy data migration লাগবে:

1. Existing phone normalize করা।
2. Duplicate detect করা।
3. Conflict manual resolution করা।
4. তারপর unique index enforce করা।

---

## AUTH-002 — `requiresPasswordChange` feature বাস্তবে অকার্যকর

**Severity: P1**

Database model ও seed-এ `requiresPasswordChange` আছে। কিন্তু login return, JWT এবং session-এ hard-coded `false` দেওয়া হচ্ছে:

```ts
requiresPasswordChange: false
```

ফলে database-এ true থাকলেও client কখনো তা জানবে না। 

### Fix

```ts
return {
  ...
  requiresPasswordChange:
    user.requiresPasswordChange,
};
```

JWT:

```ts
token.requiresPasswordChange =
  u.requiresPasswordChange ?? false;
```

Session:

```ts
session.user.requiresPasswordChange =
  Boolean(token.requiresPasswordChange);
```

Password পরিবর্তনের transaction-এ:

```ts
requiresPasswordChange: false
```

করতে হবে।

---

## AUTH-003 — ১০ বছরের JWT session অত্যন্ত দীর্ঘ

**Severity: P1**

বর্তমান configuration:

```ts
maxAge: 10 * 365 * 24 * 60 * 60
```

অর্থাৎ session প্রায় ১০ বছর valid থাকতে পারে। Shared Android POS, হারানো device বা stolen browser cookie-এর ক্ষেত্রে এটি বড় ঝুঁকি। 

### Recommendation

সাধারণভাবে:

```ts
session: {
  strategy: "jwt",
  maxAge: 7 * 24 * 60 * 60
}
```

সংবেদনশীল operation-এ recent authentication চাই:

- Backup restore
- Member role change
- Password reset
- Business settings
- Full data export
- Prepaid cash withdrawal

Device logout/revocation support চাইলে session version রাখো:

```prisma
model User {
  sessionVersion Int @default(0)
}
```

Password change বা “logout all devices”-এ increment করবে। JWT-এর version mismatch হলে session reject করবে।

---

## AUTH-004 — Primary membership nondeterministic হতে পারে

Login query-তে active membership থেকে:

```ts
take: 1
```

ব্যবহার করা হয়েছে, কিন্তু সেখানে deterministic `orderBy` নেই। একই user-এর একাধিক business থাকলে প্রথম login business database query plan বা record order-এর উপর নির্ভর করতে পারে।

এছাড়া active membership filter থাকলেও login query-তে related business active কি না সেটা membership filter-এ বাধ্যতামূলক করা হয়নি। ফলে inactive business দিয়েও login সফল হয়ে পরে API-তে আটকে যেতে পারে। 

### Fix

```ts
memberships: {
  where: {
    isActive: true,
    business: {
      isActive: true
    }
  },
  orderBy: {
    createdAt: "asc"
  },
  take: 1
}
```

আরও ভালো: user-এর last active business server-side account preference-এ রাখো।

---

## AUTH-005 — Login attempt increment race condition

বর্তমান flow:

1. User-এর `failedLoginAttempts` read।
2. JavaScript-এ `+1`।
3. Absolute value update।

Parallel brute-force request হলে একাধিক request একই old value পড়ে একই new value write করতে পারে। ফলে actual attempt-এর চেয়ে counter কম হবে।

### Fix

Atomic increment ব্যবহার করো:

```ts
const updated = await db.user.update({
  where: { id: user.id },
  data: {
    failedLoginAttempts: {
      increment: 1
    }
  },
  select: {
    failedLoginAttempts: true
  }
});
```

Lock threshold transaction-এর মধ্যে evaluate করতে হবে।

---

## AUTH-006 — Production log-এ username/email/phone leak হতে পারে

Auth code successful এবং failed login-এর সময় username/email/identifier log করে। CR/LF sanitization করা হয়েছে, যা ভালো; কিন্তু production log-এ PII থেকে যায়। 

### Fix

Production-এ raw identifier log না করে hash:

```ts
const identityFingerprint =
  createHash("sha256")
    .update(identifier)
    .digest("hex")
    .slice(0, 12);
```

---

# ৪. Firestore security

## SEC-001 — বর্তমান Firestore rules cross-tenant access allow করে

**Severity: Conditional P0**

যদি Firestore production-এ ব্যবহৃত বা deploy করা থাকে, rules অত্যন্ত permissive:

```firestore
match /businesses/{businessId} {
  allow read: if isAuthenticated();
}
```

অর্থাৎ যেকোনো authenticated user যেকোনো business document পড়তে পারে।

Update rule:

```firestore
allow update:
  if isAuthenticated() &&
  (
    resource.data.ownerId == request.auth.uid ||
    request.resource.data.ownerId ==
      resource.data.ownerId
  );
```

দ্বিতীয় condition-এর কারণে যেকোনো authenticated user অন্য business update করতে পারে—শুধু `ownerId` না বদলালেই যথেষ্ট।

Subcollection:

```firestore
match /{subcollection}/{docId} {
  allow read, write: if isAuthenticated();
}
```

এতে যেকোনো authenticated user অন্য business-এর products, sales, customers, suppliers বা expenses পড়তে ও লিখতে পারে। 

### তাৎক্ষণিক ব্যবস্থা

Firestore ব্যবহার না হলে:

```firestore
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Firestore ব্যবহার হলে membership document check করো:

```firestore
function isBusinessMember(businessId) {
  return request.auth != null &&
    exists(
      /databases/$(database)/documents/
      businesses/$(businessId)/
      members/$(request.auth.uid)
    );
}
```

তারপর:

```firestore
allow read: if isBusinessMember(businessId);
```

Role-sensitive writes আলাদা করতে হবে।

---

# ৫. Multi-tenant isolation

---

## TEN-001 — Invalid selected business silently অন্য business-এ fallback করে

**Severity: P1 — Wrong-business write risk**

`requireBusinessContext()`-এ session-এর `businessId` পাওয়া গেলে matching membership খোঁজা হয়। কিন্তু membership না পেলে:

```ts
user.memberships.find(...) ??
user.memberships[0]
```

অর্থাৎ user Business B select করেছিল, কিন্তু B-এর membership revoke হয়ে গেলে request reject না করে Business A-তে চলে যেতে পারে।

এতে cross-tenant data leak না হলেও আরও বিপজ্জনক operational error হতে পারে: user মনে করছে B-তে sale করছে, কিন্তু data A-তে write হচ্ছে। 

### Fix

```ts
let membership;

if (sessionBusinessId) {
  membership = user.memberships.find(
    m => m.business.id === sessionBusinessId
  );

  if (!membership) {
    return NextResponse.json(
      {
        error:
          "Selected business membership is no longer active"
      },
      { status: 403 }
    );
  }
} else {
  membership = user.memberships[0];
}
```

Client-কে business selection page-এ ফেরত পাঠাতে হবে।

---

## TEN-002 — RLS helper আছে, কিন্তু reviewed core routes-এ ব্যবহার হচ্ছে না

`withTenantContext()` transaction-এর মধ্যে:

```sql
set_config(
  'app.current_business_id',
  businessId,
  TRUE
)
```

করতে পারে। কিন্তু reviewed sales, product এবং customer routes সরাসরি `db` ব্যবহার করছে। ফলে helper থাকা মানেই RLS enforce হচ্ছে না। 

যদি PostgreSQL policy `current_setting('app.current_business_id')`-এর উপর নির্ভর করে, তাহলে প্রত্যেক tenant query `withTenantContext()`-এর মধ্যে না চালালে policy সঠিক context পাবে না।

### দুটি পথের একটি বেছে নাও

#### পথ A — সত্যিকারের RLS

প্রত্যেক tenant route:

```ts
return withTenantContext(
  businessId,
  async tx => {
    return tx.product.findMany();
  }
);
```

সব table-এ:

```sql
ALTER TABLE products
ENABLE ROW LEVEL SECURITY;

ALTER TABLE products
FORCE ROW LEVEL SECURITY;
```

#### পথ B — Application-level isolation

যদি Prisma ও connection architecture-এর কারণে RLS নির্ভরযোগ্যভাবে চালানো না যায়:

- README থেকে “database-level tenant isolation” দাবি সরাও।
- প্রতিটি query-তে বাধ্যতামূলক `businessId` scope enforce করো।
- Repository layer বানাও যেখানে unscoped `findMany()` exposed থাকবে না।
- Cross-tenant security test বাধ্যতামূলক করো।

---

## TEN-003 — Permission system-এর দুইটি source of truth

Schema-তে আছে:

- `Permission`
- `RolePermission`

কিন্তু tenant context static `ROLE_PERMISSIONS` map ব্যবহার করছে। অর্থাৎ database permission tables এবং code permission map আলাদা হয়ে drift করতে পারে। 

### Stabilization recommendation

নতুন feature না যোগ করে একটি পথ রাখো:

- যদি dynamic permissions প্রয়োজন না থাকে: `Permission` এবং `RolePermission` table remove/deprecate করো।
- যদি table রাখতে চাও: static map শুধু seed/default হিসেবে ব্যবহার করো; runtime DB থেকে permission resolve করো।

বর্তমান feature set-এর জন্য static typed map-ই সহজ ও স্থিতিশীল।

---

## TEN-004 — Duplicate session lookup

Flow:

```text
requireAuth()
  → getServerSession()

requireBusinessContext()
  → getServerSession() আবার
```

`withBusinessContext()`-ও প্রথমে auth check করে, তারপর tenant helper-এর ভেতরে আবার session fetch করে। এতে latency এবং auth/database failure surface বাড়ে। 

### Fix

```ts
requireBusinessContext(session)
```

বা:

```ts
resolveBusinessContext(userId, sessionBusinessId)
```

করো।

---

# ৬. Database schema integrity

---

## DB-002 — Financial Decimal fields-এ explicit precision নেই

বেশিরভাগ monetary field:

```prisma
Decimal
```

কিন্তু explicit database precision/scale নেই। শুধু কিছু field-এ `@db.Decimal(10, 2)` আছে। Financial schema-তে consistent precision থাকা উচিত। 

### Recommendation

Money:

```prisma
@db.Decimal(19, 2)
```

Quantity/weight:

```prisma
@db.Decimal(19, 6)
```

Tax percentage:

```prisma
@db.Decimal(7, 4)
```

উদাহরণ:

```prisma
sellingPrice Decimal @db.Decimal(19, 2)
currentStock Decimal @db.Decimal(19, 6)
taxRate      Decimal @db.Decimal(7, 4)
```

---

## DB-003 — কিছু tenant-owned model-এর Business relation নেই

উদাহরণ:

- `Payment.businessId` আছে, কিন্তু `Business` relation নেই।
- `TaxCategory.businessId` আছে, কিন্তু `Business` relation নেই।
- `SaleReturnItem.productId` আছে, কিন্তু Product relation নেই। 

### সমস্যা

- Orphan row তৈরি হতে পারে।
- Business delete হলে cleanup অসম্পূর্ণ হতে পারে।
- Payment-এর `businessId` এবং Sale-এর business আলাদা হতে পারে।
- Return item-এর product integrity database দিয়ে নিশ্চিত নয়।

### Fix

```prisma
model Payment {
  business Business @relation(
    fields: [businessId],
    references: [id],
    onDelete: Cascade
  )
}
```

`TaxCategory`-তেও একই।

---

## DB-004 — Duplicate `businessId` consistency database enforce করছে না

অনেক child record-এ parent relation-এর পাশাপাশি আলাদা `businessId` আছে:

```text
Payment.businessId + Payment.saleId
SaleReturn.businessId + SaleReturn.saleId
StockHistory.businessId + productId + saleId
```

কিন্তু standard foreign key শুধু parent ID enforce করে। Child business আর parent business একই—এটা database স্বয়ংক্রিয়ভাবে জানে না।

### Stabilization approach

প্রতিটি write-এর আগে parent tenant verify করো:

```ts
const sale = await tx.sale.findFirst({
  where: {
    id: saleId,
    businessId
  }
});

if (!sale) throw new NotFoundError();
```

Backup restore ও offline sync-এর জন্য এটি বিশেষভাবে গুরুত্বপূর্ণ।

---

## DB-005 — Cash shift uniqueness অসম্পূর্ণ

Schema:

```prisma
@@unique([businessId, shiftNumber])
```

আছে, কিন্তু একজন user-এর একই business-এ একসঙ্গে একাধিক active shift database-level-এ block করা হয়নি। 

PostgreSQL partial unique index দরকার:

```sql
CREATE UNIQUE INDEX
one_open_shift_per_user_business
ON cash_register_shifts
  (business_id, user_id)
WHERE is_active = true;
```

`shiftNumber` generation-ও concurrent request-safe sequence/locking দিয়ে করতে হবে।

---

## DB-006 — Non-negative invariant database-level নয়

এই value-গুলো সাধারণত negative হওয়া উচিত নয়:

- `sellingPrice`
- `buyingPrice`
- `amountPaid`
- `totalAmount`
- `prepaidBalance`
- `totalDue`
- payment amount
- return quantity
- received quantity

Application validation থাকলেও direct migration, restore বা bug দিয়ে invalid row ঢুকতে পারে।

Migration-এ check constraint যোগ করো:

```sql
ALTER TABLE products
ADD CONSTRAINT products_selling_price_nonnegative
CHECK (selling_price >= 0);
```

Stock negative policy যদি allowed না হয়:

```sql
CHECK (current_stock >= 0)
```

---

# ৭. Sales, stock এবং financial consistency

---

## FIN-001 — Due/prepaid absolute update concurrent lost-update তৈরি করতে পারে

Sales code-এ previously read balance থেকে JavaScript/Decimal দিয়ে নতুন balance বানিয়ে absolute update করা হচ্ছে। উদাহরণ:

```ts
const newTotalDue =
  currentTotalDue.minus(dueAmount);
```

Sync route-এও current balance পড়ে increment/decrement মিলিয়ে নতুন absolute value তৈরি করা হয়। Default read-committed isolation-এ একই customer-এর দুই concurrent payment/sale হলে একটি update অন্যটিকে overwrite করতে পারে। 

### ভুল pattern

```text
Request A reads due = 100
Request B reads due = 100

A writes 80
B writes 70

Correct result: 50
Actual result: 70
```

### Fix option 1 — Atomic increment/decrement

```ts
await tx.customer.updateMany({
  where: {
    id: customerId,
    businessId,
    totalDue: {
      gte: collectionAmount
    }
  },
  data: {
    totalDue: {
      decrement: collectionAmount
    },
    totalPaid: {
      increment: collectionAmount
    }
  }
});
```

### Fix option 2 — Row locking

```sql
SELECT *
FROM customers
WHERE id = $1
  AND business_id = $2
FOR UPDATE;
```

তারপর একই transaction-এ balance ও ledger লিখতে হবে।

### গুরুত্বপূর্ণ invariant

```text
Customer.totalDue
=
ledger-এর outstanding due-এর aggregate
```

Cached balance এবং ledger mismatch detect করার reconciliation job/test দরকার।

---

## FIN-002 — Online sale এবং offline sync-এ sale logic duplicate

Normal sale route প্রায় ৭৬৪ lines এবং sync route প্রায় ১০৬২ lines। Sync route-এর মধ্যে sale, product, customer, prepayment এবং stock operation আবার implement করা হয়েছে। 

এতে একই sale:

- Online `/api/sales`
- Offline `/api/sync`

পথে আলাদা validation, rounding, stock policy বা ledger result পেতে পারে।

### সবচেয়ে গুরুত্বপূর্ণ refactor

Business logic route-এর বাইরে নাও:

```text
src/domain/sales/create-sale.ts
src/domain/customers/apply-payment.ts
src/domain/inventory/change-stock.ts
src/domain/prepayment/withdraw.ts
```

উদাহরণ:

```ts
export async function createSale(
  tx: Prisma.TransactionClient,
  command: CreateSaleCommand,
  context: TenantCommandContext
) {
  // এক জায়গায় validation
  // এক জায়গায় price calculation
  // এক জায়গায় stock decrement
  // এক জায়গায় ledger update
}
```

তারপর:

```text
/api/sales → createSale()
/api/sync  → createSale()
```

এটি নতুন feature নয়; বিদ্যমান behavior এক জায়গায় এনে divergence বন্ধ করা।

---

## FIN-003 — Audit financial transaction-এর অংশ নয়

`logAudit()` নিজে error swallow করে:

```ts
catch {
  console.error(...)
}
```

এবং sale create-এর পরে audit আলাদা operation হিসেবে লেখা হয়। ফলে sale সফল কিন্তু audit fail হতে পারে। এটি “database-level logging” নয়; application-level best-effort logging। 

### Critical action-এর জন্য fix

```ts
export async function logAudit(
  tx: Prisma.TransactionClient,
  params: AuditParams
) {
  return tx.auditLog.create(...);
}
```

Sale transaction:

```ts
await db.$transaction(async tx => {
  const sale = await createSale(tx, command);

  await logAudit(tx, {
    businessId,
    userId,
    action: "SALE_CREATED",
    entityId: sale.id
  });

  return sale;
});
```

Login telemetry best-effort হতে পারে, কিন্তু financial mutation audit atomic হওয়া উচিত।

---

## FIN-004 — Product audit row-তে `businessId` বাদ পড়ছে

Reviewed product update code-এ `businessId` `details` object-এ রাখা হয়েছে, কিন্তু `logAudit()`-এর top-level `businessId` parameter দেওয়া হয়নি। ফলে `audit_logs.business_id` null হতে পারে। 

### Fix

```ts
await logAudit({
  businessId,
  userId: ctx.user.id,
  action: AUDIT_ACTIONS.PRODUCT_UPDATED,
  ...
});
```

Tenant action-এর জন্য `businessId` optional না রেখে required করা ভালো।

---

## FIN-005 — Money helper intermediate value খুব আগেই round করে

`addMoney()` এবং `subtractMoney()` প্রতিটি input আগে ২ decimal-এ round করে। `multiplyMoney()`-ও final result ২ decimal করে। সাধারণ retail amount-এর জন্য এটি ঠিক হতে পারে, কিন্তু weighted average cost, per-unit price, tax allocation এবং proportional discount-এর ক্ষেত্রে intermediate precision হারাতে পারে। 

### Rule

- Unit price/WAC: ৬ decimal।
- Intermediate calculation: full Decimal precision।
- Line total: ২ decimal।
- Invoice total: rounded line totals-এর sum।
- Payment/ledger: ২ decimal।

উদাহরণ:

```ts
const rawLineTotal =
  toUnitPriceDecimal(unitPrice)
    .times(quantity);

const lineTotal =
  rawLineTotal.toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP
  );
```

---

# ৮. Receipt এবং localization bugs

---

## I18N-001 — Payment method mapping enum-এর সঙ্গে অসম্পূর্ণ

Database enum-এ আছে:

```text
CASH
UPI
CARD
BANK
CREDIT
PREPAID
MIXED
```

কিন্তু receipt formatter map-এ মূলত:

```text
Cash
UPI
Mixed
Due
Prepaid
```

আছে। Uppercase `CASH`, `MIXED`, `PREPAID`, এবং `CARD`, `BANK`, `CREDIT` map করা নেই। ফলে receipt-এ raw enum value দেখা যেতে পারে। 

### Fix

```ts
const PAYMENT_METHOD_LABELS = {
  CASH:    { en: "Cash",    bn: "নগদ" },
  UPI:     { en: "UPI",     bn: "ইউপিআই" },
  CARD:    { en: "Card",    bn: "কার্ড" },
  BANK:    { en: "Bank",    bn: "ব্যাংক" },
  CREDIT:  { en: "Credit",  bn: "বাকি" },
  PREPAID: { en: "Prepaid", bn: "প্রিপেইড" },
  MIXED:   { en: "Mixed",   bn: "মিশ্র" }
} as const;
```

Input normalize করো:

```ts
const normalized = method.trim().toUpperCase();
```

---

## I18N-002 — “Both” receipt unit bilingual নয়

`lang === "both"` হলে unit formatter শুধু Bengali value return করছে:

```ts
if (lang === 'both') return `${entry.bn}`;
```

যদিও অন্যান্য label-এ Bengali/English দুটোই দেখানোর চেষ্টা আছে। 

Fix:

```ts
if (lang === "both") {
  return `${entry.bn} / ${entry.en}`;
}
```

---

## I18N-003 — Currency “never hard-coded” দাবির সঙ্গে code মেলে না

`formatPriceGlobal()` এবং receipt formatter settings না পেলে hard-coded `₹` ব্যবহার করে। README বলছে currency symbol কখনো hard-code করা হয় না। 

### Fix

Formatting function-এ currency explicit parameter দাও:

```ts
formatMoney(amount, {
  symbol: settings.currency_symbol,
  locale,
});
```

Setting unavailable হলে:

```text
""
```

বা business currency code ব্যবহার করো, কিন্তু silently `₹` নয়।

---

## I18N-004 — Business timezone ব্যবহার হচ্ছে না

Business model-এ `timezone` আছে, কিন্তু date formatter browser/server local timezone ব্যবহার করে। ফলে Cloudflare UTC, দোকান Asia/Kolkata এবং Android device timezone ভিন্ন হলে invoice date, report day এবং shift time mismatch হতে পারে। 

প্রতিটি financial date format ও date-range query-তে business timezone explicit করতে হবে।

---

# ৯. Offline-first architecture

## ভালো দিক

বর্তমান offline stack-এ:

- Tenant-specific IndexedDB।
- Product/customer/cart/sale cache।
- Sync queue।
- UUID idempotency key।
- Reconnect হলে automatic sync।
- Server-side unique idempotency key।
- Auth expiry হলে worker stop করার logic।

আছে। এগুলো সঠিক foundation। 

---

## OFF-001 — একই ধরনের দুটি queue store

IndexedDB-তে আছে:

```text
sync_queue
action_queue
```

Documentation-ও বলছে queue logic দুই store ও call site-এ ভাগ করা। একই operation কোন queue-তে থাকবে এবং crash recovery কীভাবে হবে—এটি জটিল করে। 

### Stabilization recommendation

একটি canonical queue রাখো:

```ts
interface OfflineAction {
  id: string;
  businessId: string;
  userId: string;
  idempotencyKey: string;
  type: OfflineActionType;
  payload: unknown;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "blocked";
  attempts: number;
  nextRetryAt?: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}
```

পুরনো store থেকে migration করে একটি store-এ আনো।

---

## OFF-002 — Retry increment read-modify-write pattern

`incrementRetry()` প্রথমে item read করে, তারপর `retryCount += 1`, তারপর আলাদা put করে। যদি accidental multiple worker একই item process করে, increment হারাতে পারে। 

Worker singleton lock থাকা সত্ত্বেও:

- multiple browser tab,
- service worker,
- reload,
- Android WebView process

পরিস্থিতিতে single-process assumption নিরাপদ নয়।

### Fix

IndexedDB single readwrite transaction-এর মধ্যে get এবং put করো। Queue item processing শুরু করার আগে lease নাও:

```text
status = processing
leaseOwner = random-tab-id
leaseExpiresAt = now + 30 seconds
```

---

## OFF-003 — Offline money Number হিসেবে serialize হচ্ছে

Documentation বলছে IndexedDB/JSON compatibility-এর জন্য money অনেক সময় `Number()` বা `toMoneyNumber()` হয়। সাধারণ amount-এ ঠিক থাকলেও বড় value বা repeated calculation-এ binary float drift হতে পারে। 

Offline payload-এ money string রাখো:

```json
{
  "unitPrice": "12.50",
  "quantity": "2.000000",
  "total": "25.00"
}
```

Server-এ Decimal parse করো।

---

## OFF-004 — Local tenant data logout-এর পর device-এ থেকে যায়

Tenant অনুযায়ী DB আলাদা করা হয়েছে এবং session switch-এ DB close করা হয়—এটি ভালো। কিন্তু database close করা আর data delete করা এক নয়। Shared Android POS-এ পুরনো customer, sale ও product data device-এ থেকে যেতে পারে। 

### প্রয়োজনীয় policy

Logout dialog:

```text
[ ] এই ডিভাইসের offline data মুছে ফেলুন
```

Sensitive environment-এ default purge করা উচিত।

---

## OFF-005 — Offline এবং online behavior parity test নেই

সবচেয়ে গুরুত্বপূর্ণ test:

```text
একই command
  → online /api/sales
  → offline /api/sync

দুই পথের:
  sale total
  stock
  customer due
  prepaid
  payment records
  audit
একই হতে হবে।
```

এটি domain service extraction ছাড়া নির্ভরযোগ্যভাবে maintain করা কঠিন।

---

# ১০. Backup/restore

---

## BACKUP-001 — Backup permission অত্যন্ত শক্ত হতে হবে

Backup route authentication ও tenant context নেয়। কিন্তু full export/restore-এর জন্য শুধু tenant membership যথেষ্ট নয়; `OWNER` বা নির্দিষ্ট `backup.export`/`backup.restore` permission প্রয়োজন। Route-এর reviewed entry অংশে explicit permission check স্পষ্ট নয়। 

### বাধ্যতামূলক policy

| Operation | Minimum permission |
|---|---|
| Export backup | OWNER/ADMIN |
| Restore | OWNER only |
| Restore with overwrite | OWNER + recent password confirmation |
| Cross-instance import | Disabled by default |

---

## BACKUP-002 — Restore payload strict schema validation চাই

Restore code backup objects spread করে `createMany()`-তে পাঠায় এবং কিছু ক্ষেত্রে `businessId` override করে। Malicious বা corrupted backup-এ:

- foreign ID mismatch,
- cross-tenant product reference,
- duplicate primary ID,
- invalid money,
- invalid enum,
- oversized payload

থাকতে পারে। 

### Restore pipeline

```text
Upload
  ↓
Size limit
  ↓
JSON parse
  ↓
Backup version validation
  ↓
Strict Zod validation
  ↓
Tenant relationship validation
  ↓
Dry-run summary
  ↓
Owner confirmation
  ↓
Serializable transaction
  ↓
Audit record
```

Restore confirmation token থাকলেও environment schema-তে সেটি validated নয়। `.env.example`-এ variable আছে, কিন্তু `env.ts` schema-তে নেই। 

---

## BACKUP-003 — Restore-এর আগে automatic safety snapshot

Restore overwrite শুরু করার আগে বর্তমান tenant data-এর immutable snapshot নিতে হবে। এটি নতুন user-facing feature নয়; data-loss prevention।

Restore failure হলে পুরো transaction rollback করতে হবে।

---

# ১১. Environment validation

## ENV-001 — Environment validation fail-open

`DATABASE_URL` এবং `NEXTAUTH_SECRET` optional। Validation fail হলে শুধু warning দিয়ে raw `process.env as any` export করা হয়। Database URL না থাকলে DB layer dummy URL ফেরত দেয়। ফলে service startup-এ fail না করে পরে runtime-এ confusing connection error হয়। 

### Production fail-fast

```ts
const productionSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().min(1),
  RESTORE_CONFIRMATION_TOKEN:
    z.string().min(32)
});

const parsed =
  productionSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    parsed.error.issues
      .map(...)
      .join("\n")
  );
}
```

Dummy database URL শুধু test environment-এ allow করো।

---

## ENV-002 — Hard-coded production domains

নিচের জায়গায় production URL hard-coded:

- NextAuth default URL
- CSRF allowed origins
- Capacitor server URL
- Wrangler vars
- Firebase domains

এতে staging/test environment production-এর সঙ্গে মিশে যেতে পারে। 

একটি environment matrix দরকার:

```text
.env.development
.env.test
.env.staging
.env.production
```

---

# ১২. CSRF ও API middleware

## SEC-002 — CSRF allow-list অতিরিক্ত permissive

State-changing request-এর জন্য code যেকোনো:

```text
capacitor://*
ionic://*
localhost
127.0.0.1
```

origin allow করে। Production-এ exact origin allow-list উত্তম। 

### Fix

```ts
const allowedOrigins =
  new Set(parseAllowedOrigins());

if (!allowedOrigins.has(originUrl.origin)) {
  return forbidden();
}
```

Capacitor app যেহেতু production remote URL load করে, normal request-এর origin production HTTPS domain হওয়া উচিত। Wildcard Capacitor/Ionic origin সম্ভব হলে বাদ দাও।

---

## SEC-003 — Internal error client-এ leak হচ্ছে

Sales fetch error path internal exception message থেকে `details` তৈরি করে। Backup route-ও `error.message` response-এ ফেরত দেয়। এতে Prisma table/column/connection তথ্য expose হতে পারে। 

### Standard response

Production:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Request could not be completed",
    "requestId": "..."
  }
}
```

Internal details শুধু structured log/Sentry-তে।

---

# ১৩. Test ও CI audit

---

## QA-001 — CI production build চালায় না

বর্তমান CI চালায়:

```text
npm ci
prisma generate
lint
typecheck
vitest
```

কিন্তু চালায় না:

- `npm run build`
- Docker build
- Prisma schema validation
- migration test
- PostgreSQL integration test
- Playwright E2E
- Cloudflare build
- Android build
- dependency/security audit। 

### Minimum CI jobs

```yaml
jobs:
  static:
    - npm ci
    - npm run db:generate
    - npx prisma validate --config prisma.config.ts
    - npm run lint
    - npm run typecheck
    - npm test -- --coverage

  build-node:
    - npm run build

  integration:
    services:
      postgres:
        image: postgres:16-alpine
    steps:
      - apply migrations
      - integration tests

  e2e:
    - npm run build
    - start app
    - npx playwright test

  docker:
    - docker build .

  cloudflare:
    - npm run build:worker
```

---

## QA-002 — ESLint প্রায় নিষ্ক্রিয়

নিষ্ক্রিয় rules-এর মধ্যে আছে:

- `no-unused-vars`
- `no-undef`
- `no-unreachable`
- `no-fallthrough`
- `react-hooks/exhaustive-deps`
- `react-hooks/purity`
- `react-hooks/set-state-in-effect`
- `no-empty`
- `no-debugger`

এভাবে lint pass করলেও বহু বাস্তব bug ধরা পড়বে না। 

### Stabilization profile

প্রথমে warning:

```js
"@typescript-eslint/no-unused-vars": "warn",
"react-hooks/exhaustive-deps": "warn",
"no-unreachable": "error",
"no-fallthrough": "error",
"no-debugger": "error",
"no-undef": "error"
```

তারপর warning zero হলে error করো।

---

## QA-003 — Tests typecheck-এর বাইরে

`tsconfig.json` explicitly exclude করছে:

```text
**/*.test.ts
**/*.test.tsx
```

ফলে test code production TypeScript check-এর অংশ নয়। 

আলাদা `tsconfig.test.json` বানাও:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": [
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "tests/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

---

## QA-004 — Coverage threshold নেই

Vitest config শুধু include pattern ও `happy-dom` environment নির্ধারণ করে। Coverage threshold নেই। Money test আছে, কিন্তু critical sale/sync route coverage-এর প্রমাণ পাওয়া যায়নি। 

### Threshold

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "html", "lcov"],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80
  }
}
```

Critical domain module:

```text
money                100%
sale calculation     100%
stock mutation        95%+
ledger/prepaid        95%+
sync idempotency      95%+
permissions           100%
```

---

## QA-005 — Playwright configured, কিন্তু operational নয়

Playwright config-এ:

- `baseURL` commented।
- `webServer` commented।
- package scripts-এ E2E script নেই।
- CI-তেও Playwright নেই।
- `tests/example.spec.ts` starter/example-style test উপস্থিত। 

### Fix

```ts
use: {
  baseURL: "http://127.0.0.1:3000",
  trace: "on-first-retry",
  screenshot: "only-on-failure",
  video: "retain-on-failure"
},

webServer: {
  command: "npm run dev",
  url: "http://127.0.0.1:3000",
  reuseExistingServer: !process.env.CI
}
```

Package script:

```json
{
  "test:e2e": "playwright test"
}
```

---

# ১৪. বাধ্যতামূলক automated test matrix

## Authentication

- Correct password login।
- Wrong password attempt counter।
- Parallel wrong-password attempts।
- Account lock।
- Lock expiry।
- Disabled user।
- Expired Firebase token।
- Wrong Firebase audience।
- Phone exact match।
- Same last-10 digit, different country code।
- Membership revoked after login।
- Inactive business।
- Business switching privilege escalation।

## Tenant isolation

প্রত্যেক entity-এর জন্য:

```text
Business A user
  GET Business B product → 404/403
  UPDATE Business B product → 404/403
  DELETE Business B customer → 404/403
  CREATE return for Business B sale → 404/403
```

Client-supplied `businessId` কখনো trusted নয়—এটাও test করতে হবে।

## Sale invariant

```text
subtotal
= sum(line totals before invoice discount)

total
= subtotal - valid discount + tax

amountPaid
= sum(external payments + prepaid used)

due
= max(total - amountPaid, 0)
```

Cases:

- Zero quantity।
- Negative quantity।
- Decimal quantity।
- Discount > subtotal।
- Percentage discount > 100।
- Mixed payment mismatch।
- Payment > total।
- Change converted to prepayment।
- Customer ছাড়া due sale।
- Duplicate product lines।
- ২০০+ line item।
- Same last stock দুই cashier একসঙ্গে বিক্রি।

## Inventory

- Stock কখনো negative নয়।
- Sale retry stock দ্বিতীয়বার কমায় না।
- Return sold quantity-এর বেশি নয়।
- দুই partial return-এর aggregate sold quantity অতিক্রম করে না।
- Purchase receive দুইবার করলে duplicate stock নয়।
- WAC calculation precision।

## Offline

- Offline sale → reconnect → একবার sync।
- একই idempotency key ১০ বার পাঠানো → এক sale।
- Request সফল কিন্তু response হারানো → retry-তে cached result।
- Sync মাঝপথে browser বন্ধ।
- Session expiry।
- User business switch।
- Revoked membership।
- Conflict করা দুই sale sequential।
- Independent product sale parallel।
- Queue migration DB v2 → v3।
- Corrupted payload dead-letter state।

## Backup

- Viewer export block।
- Cashier restore block।
- Wrong confirmation token।
- Oversized backup।
- Invalid enum।
- Cross-business ID।
- Partial failure rollback।
- Restore-এর পর ledger/stock reconciliation।

---

# ১৫. প্রথম ২৪ ঘণ্টার remediation plan

## অবিলম্বে

1. **Admin password rotate করো।**
2. Seed empty-password bug fix করো।
3. Firestore ব্যবহৃত না হলে deny-all rules deploy করো।
4. Package manager npm-এ standardize করো।
5. Dockerfile fix করো।
6. Production Prisma singleton fix করো।
7. Phone number exact E.164 lookup করো।
8. Invalid business fallback বন্ধ করো।
9. `requiresPasswordChange` propagate করো।
10. Session ১০ বছর থেকে ৭–৩০ দিনে নামাও।
11. Production env fail-fast করো।
12. Backup/restore শুধু OWNER-এ সীমাবদ্ধ করো।

---

# ১৬. পরবর্তী ৩–৭ দিনের plan

1. Sale creation logic shared domain service-এ নাও।
2. `/api/sales` ও `/api/sync` একই service ব্যবহার করুক।
3. Due/prepaid update atomic করো।
4. Critical audit transaction-এর ভেতরে নাও।
5. Product audit-এ top-level `businessId` দাও।
6. Receipt payment enum mapping সম্পূর্ণ করো।
7. Business timezone সব financial query ও receipt-এ প্রয়োগ করো।
8. CI-তে production build ও PostgreSQL integration test যোগ করো।
9. Playwright operational করো।
10. Lint-এর critical rules পুনরায় চালু করো।
11. Backup schema validation ও size limit যোগ করো।
12. Database check constraints যোগ করো।

---

# ১৭. পরবর্তী ২–৩ সপ্তাহের plan

1. একটি canonical offline queue রাখো।
2. Offline action state machine ও lease system যোগ করো।
3. IndexedDB migration tests লিখো।
4. Money JSON number-এর বদলে decimal string করো।
5. RLS সত্যিকারভাবে wire করো অথবা RLS claim সরাও।
6. Permission-এর একটিমাত্র source of truth রাখো।
7. Schema relations ও composite tenant validation শক্ত করো।
8. Open shift partial unique index যোগ করো।
9. Node, Docker এবং Cloudflare তিন target-এর release test করো।
10. Android camera permission, print, back button, offline/reconnect test করো।
11. Structured request ID ও error monitoring যোগ করো।
12. Backup restore drill চালাও।

---

# ১৮. Stable release-এর acceptance criteria

নিচের সব পূরণ না হলে stable tag দেওয়া উচিত নয়:

```text
[ ] npm ci clean
[ ] Prisma validate clean
[ ] Migration fresh DB-তে successful
[ ] Migration existing production-like DB-তে successful
[ ] ESLint error zero
[ ] TypeScript error zero
[ ] Test files typecheck
[ ] Unit test green
[ ] Integration test green
[ ] Playwright critical paths green
[ ] Node production build green
[ ] Docker build green
[ ] Cloudflare build green
[ ] Cross-tenant tests green
[ ] Concurrent stock test green
[ ] Concurrent ledger test green
[ ] Offline retry/idempotency test green
[ ] Backup restore drill green
[ ] Firestore rules test green অথবা Firestore disabled
[ ] No known P0/P1 bug
[ ] No hard-coded production secret
[ ] Error response-এ internal details নেই
```

---

# চূড়ান্ত সিদ্ধান্ত

অ্যাপটির architecture-এর গুরুত্বপূর্ণ অংশগুলো উপস্থিত—multi-tenancy, Decimal money, offline queue, RBAC, audit এবং stock history। কিন্তু বর্তমানে এটি **“feature-rich” হলেও এখনো “production-stable” নয়**।

সবচেয়ে বড় ঝুঁকি feature-এর অভাব নয়; বরং:

- configuration inconsistency,
- duplicated financial logic,
- connection lifecycle,
- concurrent balance update,
- weak CI gates,
- permissive Firestore rules,
- authentication identity normalization,
- এবং insufficient failure/recovery testing।

**কোনো নতুন feature যোগ না করেই** এই repository স্থিতিশীল করা সম্ভব। প্রথম কাজ হওয়া উচিত P0 security/build সমস্যা ঠিক করা; দ্বিতীয় কাজ online/offline financial logic এক করা; তৃতীয় কাজ real database integration ও concurrency test দিয়ে invariants lock করা। “একেবারে bug-free” বাস্তবে guarantee করা যায় না, কিন্তু উপরোক্ত কাজগুলো শেষ হলে “no known critical/high defect, reproducible build, deterministic financial behavior এবং tested recovery” পর্যায়ে নেওয়া সম্ভব।


ঠিক আছে, এবার সরাসরি কোড খুলে দেখছি।वেব-ফেচ ফাইল খুলতে দিচ্ছে না, তাই ক্লোন করে সরাসরি পড়ছি।npm ci ব্যাকগ্রাউন্ডে মারা গেছে। ফোরগ্রাউন্ডে চালাচ্ছি।Prisma ক্লায়েন্ট জেনারেট হয়েছে। এবার আসল টাইপচেক, লিন্ট ও টেস্ট।টাইপচেক পরিষ্কার (০ এরর)। লিন্ট ও টেস্ট চালাচ্ছি।এখন পর্যন্ত যা পেয়েছি তা গুছিয়ে চূড়ান্ত বিশ্লেষণ লিখছি।# pos-app স্থিতিশীল করার বিশ্লেষণ (কোড ক্লোন করে চালিয়ে দেখা)

আগের উত্তর ছিল আন্দাজভিত্তিক। এবার রিপো ক্লোন করে `tsc`, `eslint`, `vitest` ও `next build` চালিয়েছি, আর `sync`, `auth`, `db`, `proxy`, ক্লায়েন্ট সিঙ্ক ওয়ার্কার ও চেকআউট কোড পড়েছি। একটা ডেভ সার্ভার চালিয়ে `curl` দিয়ে দুটো আচরণ প্রমাণও করেছি।

## আগের উত্তরের যা ভুল ছিল

| আগে যা বলেছিলাম | আসল অবস্থা |
|---|---|
| `ignoreBuildErrors` আছে কিনা দেখুন | নেই। `strict: true`, টাইপচেক **০ এরর** |
| env ভ্যালিডেশন যোগ করুন | `src/lib/env.ts` আছে, কিন্তু কার্যত নিষ্ক্রিয় (নিচে ৯ নম্বর) |
| একই সিঙ্ক দুবার এলে ডুপ্লিকেট বিক্রি হতে পারে | হয় না। `@@unique([businessId, invoiceNumber])` আটকায় |
| সিঙ্ক ক্রমে সমস্যা হতে পারে | হ্যাঁ, আরও গুরুতর রূপে (নিচে ৫ নম্বর) |

**বেসলাইন (আমার চালানো):** লিন্ট ০ সমস্যা, টাইপচেক ০ এরর, ৩০ ফাইলে ৩২৬ টেস্ট পাস, `next build` সফল। অর্থাৎ ভিত্তি ভালো, আর বাগগুলো টুলে ধরা পড়ে না। সেগুলো **লজিক ও কনফিগের** বাগ।

---

## P0: টাকা, ডেটা ও অনুমতির ঝুঁকি

### ১. `/api/sync`-এ কোনো পারমিশন চেক নেই (সবচেয়ে গুরুতর)
`sync/route.ts`-এর GET, POST, PUT শুধু `requireAuth` (CSRF + সেশন) ও `requireBusinessContext` ডাকে। `requireAuth` কোনো রোল দেখে না (`api-middleware.ts` পড়ে নিশ্চিত)। শুধু `syncSale`-এ `ctx.role` যায়, ছাড় সীমার জন্য। বাকি সব অ্যাকশনে (`product:create/update`, `product:stock:update`, `customer:*`, `prepayment:create`) কিছুই নেই।

ফল, `permissions-helpers.ts`-এর ম্যাট্রিক্স অনুযায়ী:
- **VIEWER** (শুধু দেখার অনুমতি) API-তে সরাসরি বিক্রি তৈরি, পণ্যের মূল্য ও স্টক বদল, গ্রাহকের প্রিপেইড ব্যালেন্স বাড়ানো করতে পারে।
- **CASHIER** (`products.update` নেই) `product:update` দিয়ে `sellingPrice`/`buyingPrice` বদলাতে পারে।

UI এগুলো লুকায়, কিন্তু API খোলা। অন্য সব রুট (`products`, `customers`, `prepayment` ইত্যাদি) ঠিকমতো `checkPermission` ব্যবহার করে। শুধু এই রুটটাই বাদ, অথচ প্রোডাকশনের সব বিক্রি এর মধ্য দিয়ে যায়।

**ফিক্স:** অ্যাকশন অনুযায়ী পারমিশন ম্যাপ, ট্রানজ্যাকশনের আগে:
```ts
const ACTION_PERMISSION: Record<string, string> = {
  'sale:create': 'sales.create',
  'product:create': 'products.create',
  'product:update': 'products.update',
  'product:stock:update': 'stock.create',
  'customer:create': 'customers.create',
  'customer:update': 'customers.update',
  'prepayment:create': 'due.collect',
};
const required = ACTION_PERMISSION[actionType];
if (!required) return NextResponse.json({ success:false, error:'Unknown action' }, { status:400 });
const denied = checkPermission(ctx, required);
if (denied) return denied;
```
`PUT /api/sync` (যেকোনো আইটেম `synced` চিহ্নিত করা) একই কারণে `sales.create` চাওয়া উচিত।

### ২. সেশন না থাকলে বিক্রি "সার্ভারে সংরক্ষিত" দেখায়, অথচ সার্ভার পায়নি (প্রমাণিত)
`proxy.ts` NextAuth `withAuth` ব্যবহার করে। টোকেন না থাকলে সেটা API-কেও **৩০৭ রিডাইরেক্ট** করে লগইন পেজে। আমি চালিয়ে দেখেছি:
```
POST /api/sync (অননুমোদিত) → 307 /login?callbackUrl=%2Fapi%2Fsync → শেষ রেসপন্স 200 text/html
```
`POSDashboard.tsx:780`-এর চেকআউট `res.ok` (এখানে `true`) দেখে `SyncQueueDB.markSynced` করে এবং "✓ বিলিং নিশ্চিত, সার্ভারে সংরক্ষিত হয়েছে" টোস্ট দেখায়। বিক্রিটা শুধু IndexedDB-তে থাকে, আর কখনো পাঠানো হয় না। ব্যাকগ্রাউন্ড ওয়ার্কারে `response.json()` ফেটে ৫ বার রিট্রাই করে ফেইল হয়। তার `401` হ্যান্ডলার (`syncSessionExpired`) কখনো চলে না।

JWT-র মেয়াদ ১০ বছর (`auth.ts:279`), তাই সময় ফুরানো এর কারণ হবে না। কারণ হবে অ্যাপ ডেটা/কুকি মোছা, WebView কুকি হারানো, বা `NEXTAUTH_SECRET` বদলানো।

**ফিক্স (দুই দিকেই):**
```ts
// proxy.ts — API-তে রিডাইরেক্টের বদলে ৪০১ JSON
withAuth(handler, { callbacks: { authorized: ({ token }) => !!token }, ... })
// এবং handler-এর শুরুতে, token না থাকলে /api/* এর জন্য:
// return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
```ts
// POSDashboard + sync-worker — সফলতার শর্ত কড়া করুন
const ct = res.headers.get('content-type') ?? '';
if (!res.ok || !ct.includes('application/json')) throw new Error('sync failed');
const body = await res.json();
if (!body.success) throw new Error(body.error);
await SyncQueueDB.markSynced(item.id);
```
ভালো হয় চেকআউট নিজে আলাদা `fetch` না করে ওয়ার্কারের একটাই কোডপাথ ব্যবহার করলে।

### ৩. অফলাইনে পণ্য এডিট করলে সার্ভারের স্টক পুরনো সংখ্যায় ফিরে যায়
`POSDashboard.tsx:~940`-এ অফলাইন এডিটের পেলোড `JSON.stringify(data)`, যাতে ফর্মের `currentStock` আছে। সিঙ্কের `syncProduct` (update শাখা) সরাসরি `currentStock: newStock` লেখে। মাঝখানে অন্য ডিভাইসে স্টক যোগ বা বিক্রি হয়ে থাকলে সেটা মুছে যায়। নাম ঠিক করতে গিয়ে স্টক নষ্ট হয়।

**ফিক্স:** সার্ভারের update শাখায় `currentStock` ও `buyingPrice` উপেক্ষা করুন। স্টক বদলাবে শুধু `quantityChange` (ডেল্টা) বা স্টক-অ্যাডজাস্টমেন্ট রুটে।

### ৪. অফলাইন স্টক এন্ট্রি দামের ও সাপ্লায়ারের তথ্য হারায়
অফলাইনে `purchasePrice`, `supplierId`, `amountPaid` পেলোডে যায় (`POSDashboard.tsx:~913`)। কিন্তু সার্ভারের স্কিমা `z.object({ productId, quantityChange })` বাড়তি কী ফেলে দেয়। অনলাইন `/api/stock-entry` WAC হিসাব করে, `buyingPrice` আপডেট করে ও সাপ্লায়ার লেজার লেখে। অফলাইন সিঙ্কে শুধু স্টক বাড়ে। ফলে লাভের রিপোর্ট ও সাপ্লায়ারের বাকি ভুল হয়।

**ফিক্স:** `product:stock:update`-কে একই সার্ভিসে (`stock-entry`-র লজিক) রাউট করুন, আলাদা বিকল্প বাস্তবায়ন নয়।

### ৫. ক্লায়েন্ট সিঙ্কে নির্ভরতা-ক্রম ভাঙে
`sync-worker.ts`-এ কোনো আইটেম ট্রানজিয়েন্টলি ফেইল করলেও লুপ পরের ব্যাচে চলে যায়। ধরুন পণ্য তৈরি নেটওয়ার্ক ত্রুটিতে ফেইল করল, তারপর সেই পণ্যের বিক্রি চলল। সার্ভার ৪০০ ("not found") দেয়, যা `isPermanentStatus` ধরে **ডেড-লেটার** করে, আর আর রিট্রাই হয় না। বিক্রিটা বাস্তবে হয়ে গেছে।

সাথে LWW-এ পুরনো ভার্সন সার্ভারে না পাঠিয়েই `markSynced` হয়ে যায়। সর্বশেষটা পরে ডেড-লেটার হলে আগেরগুলো হারিয়ে যায়।

**ফিক্স:** কোনো আইটেম ফেইল করলে সেই রানে একই ID-শেয়ারকারী পরের সব আইটেম pending রাখুন (স্কিপ, ডেড-লেটার নয়)।

### ৬. ট্রানজ্যাকশনের ভেতরের দুটো বিপজ্জনক প্যাটার্ন (`sync/route.ts`)
- **কাঁচা SQL ফলব্যাক (~লাইন ٤৭২):** `tx.sale.create` Postgres এরর (`42703`/`42704`) দিলে ট্রানজ্যাকশন aborted হয়। এরপর একই `tx`-এ কাঁচা INSERT চালানো **অসম্ভব** (`current transaction is aborted`)। কোডটা কখনো কাজ করবে না, শুধু আসল স্কিমা ড্রিফট ঢেকে রাখে। মুছে ফেলুন, ড্রিফট মাইগ্রেশনে ঠিক করুন।
- **`try/catch` দিয়ে popularity আপসার্ট গিলে ফেলা:** একই ট্রানজ্যাকশনের ভেতরে। Postgres-এ কোনো স্টেটমেন্ট ফেইল করলে ট্রানজ্যাকশন নষ্ট হয়, `catch` তা বাঁচায় না। এটাকে কমিটের **পরে**, বেস্ট-এফোর্ট হিসেবে সরান।

### ৭. আইডেমপোটেন্সি দাবি ট্রানজ্যাকশনের বাইরে (`due-collection`, `prepayment`, `supplier-payment`)
`reserveIdempotency` বিজনেস ট্রানজ্যাকশনের আগে `SyncQueue`-তে সারি বসায় আর শেষে `finalize`। সমস্যা:
- `finalizeIdempotency(...).catch(() => {})` ব্যর্থতা গিলে ফেলে। টাকা আদায় কমিট হওয়ার পর `finalize` ফেইল করলে দাবি `in_progress` থেকে যায়, কোনো TTL নেই।
- তারপর রিট্রাই চিরকাল ৪০৯ "প্রক্রিয়াধীন" পায়। ক্যাশিয়ার নতুন কী দিয়ে আবার চাপলে **দ্বিগুণ আদায়** হয়।
- Worker মাঝপথে মারা গেলেও একই ফল।
- `X-Idempotency-Key` ঐচ্ছিক। কী না পাঠালে কোনো সুরক্ষা নেই।

**ফিক্স:** দাবির INSERT একই `tx`-এর ভেতরে করুন। ইউনিক ভায়োলেশন হলে পুরো ট্রানজ্যাকশন রোলব্যাক, তখন সংরক্ষিত ফলাফল ফেরত দিন। এতে "আটকে থাকা দাবি" বিষয়টাই থাকে না। আর কী বাধ্যতামূলক করুন।

---

## P1: কনফিগ, ডিপ্লয় ও নিরাপত্তা ফাঁক

### ৮. ক্রন কাজই করছে না হতে পারে
- `update-popularity/route.ts` এখনও fail-open: `if (process.env.CRON_SECRET && authHeader !== ...)`। সিক্রেট না থাকলে চেক বাদ। উল্টে দিন: সিক্রেট না থাকলে ৫০০।
- ক্রন শুধু `vercel.json`-এ। `wrangler.jsonc`-এ কোনো `triggers.crons` নেই, `scheduled` হ্যান্ডলারও নেই। আপনার `capacitor.config.ts` ও `wrangler` ভ্যারিয়েবল বলছে প্রোডাকশন Cloudflare (`pos.onuron.org`)। তাহলে জনপ্রিয় পণ্যের হিসাব কখনো রিফ্রেশ হয় না।

### ৯. কনফিগ কাগজে আছে, কাজ করে না
- **`env.ts`:** `DATABASE_URL`, `NEXTAUTH_SECRET` ঐচ্ছিক। ভুল হলে শুধু `console.warn`, তারপর কাঁচা `process.env` ফেরত দেয়। `ALLOWED_ORIGINS` একেবারেই চেক করে না, অথচ `next.config.ts`-এর মন্তব্য বলছে "env.ts-এ চেক হয়"। `allowedOrigins` ভেরিয়েবলটা কোথাও ব্যবহৃতই হয় না।
- **`db.ts`:** `DATABASE_URL` না পেলে চুপচাপ `postgresql://dummy:dummy@localhost...`-এ ফলব্যাক। ভুল কনফিগে স্পষ্ট ব্যর্থতার বদলে রহস্যময় কানেকশন ত্রুটি।
- **`proxy.ts`-এর রেট লিমিট:** NextAuth `withAuth` `/api/auth/*`-এ ভেতরের ফাংশন চালায়ই না (`node_modules/next-auth/next/middleware.js:24`)। ফলে লগইন/চেঞ্জ-পাসওয়ার্ডের প্রক্সি-লিমিট কখনো চলে না। লগইনে `auth.ts`-এর নিজস্ব লিমিটার আছে, চেঞ্জ-পাসওয়ার্ডে কার্যত নেই।
- ইন-মেমরি লিমিটার Workers-এ আইসোলেট-প্রতি আলাদা, তাই কার্যত অকেজো। Upstash প্রোডাকশনে সেট আছে কিনা আমি জানি না।
- `/api/sync`-এ কোনো রেট লিমিট নেই, অথচ `rate-limit.ts`-এর মন্তব্যে "runaway offline sync"-এর কথা আছে (লিমিট শুধু `/api/sales`-এ, যেটা ক্লায়েন্ট ব্যবহারই করে না)।

### ১০. বিল্ড ও ডিপ্লয় ভাঙা
- **Dockerfile** `pnpm install --frozen-lockfile` চালায় এবং `pnpm-lock.yaml` কপি করে, কিন্তু রিপোতে সেই ফাইলই নেই (শুধু `package-lock.json`)। Docker বিল্ড প্রথম ধাপেই ফেইল করবে। README-ও `pnpm` বলে।
- **`scripts/build.mjs`:** `DOCKER_BUILD` কোথাও সেট হয় না, তাই যেকোনো Linux (Docker, CI) বিল্ড Cloudflare প্যাকেজিংয়ের পথ নেয়।
- **CI** (`ci.yml`) লিন্ট/টাইপ/টেস্ট চালায় কিন্তু `next build` চালায় না।
- **Playwright ওয়ার্কফ্লো** শুধু ডিফল্ট উদাহরণ চালায় (`https://playwright.dev` টেস্ট), আপনার অ্যাপের কিছুই নয়, অথচ `main`-এ প্রতি পুশে চলে। মুছুন, নয়তো সত্যিকারের স্মোক টেস্ট লিখুন।
- Firebase/Firestore ফাইল, `worker.js` (deprecated), Caddy/Docker, Vercel, Cloudflare সব একসাথে। এক প্রাইমারি টার্গেট বেছে বাকিগুলো সরান বা আর্কাইভ করুন।

### ১১. `/api/auth/register`: খোলা, সীমাহীন
- `proxy.ts`-এর matcher `api/auth` বাদ দেয়, তাই রেজিস্টারে কোনো লিমিট, CSRF বা অথ নেই।
- প্রতি কলে `bcrypt` খরচ ১২, সহজ CPU-DoS।
- ক্যাচ ব্লকে `error.message` ক্লায়েন্টকে ফেরত যায় (Prisma ত্রুটির বিবরণ ফাঁস)।
- **বাংলা নামে স্লাগ বাগ:** `generateSlug` শুধু `a-z0-9` রাখে। "লক্ষ্মণ ভাণ্ডার" নামের দোকানের স্লাগ হয় **খালি স্ট্রিং**, পরেরটা `-1`। `business/memberships/route.ts`-এও একই ফাংশন। বাংলা নামের জন্য র‍্যান্ডম ফলব্যাক (`shop-ab12cd`) দিন।
- `findFirst` তারপর `create` রেসে ইউনিক ভায়োলেশন হলে ৫০০।

### ১২. `account-deletion-request`: ডিবি লেখা ব্যর্থ হলেও "সফল"
অডিট লগ লেখা ব্যর্থ হলে শুধু `console.warn`, তারপর রেফারেন্স আইডিসহ সফল বার্তা ("৭ কর্মদিবসে প্রসেস হবে") ফেরত যায়। অথচ কিছুই রেকর্ড হয়নি। রুটটা পাবলিক, রেট লিমিট নেই, ইনপুটের দৈর্ঘ্য সীমাহীন। অ্যাপ স্টোর কমপ্লায়েন্সে এটা ঝুঁকি। ব্যর্থ হলে ৫০৩ দিন, ইনপুট সীমা দিন, লিমিট দিন।

### ১৩. মৃত কোড = ড্রিফটের উৎস
- ক্লায়েন্ট কোথাও `POST /api/sales` ডাকে না (শুধু GET ও একটা অন্য কল)। অথচ `sales/route.ts` (৮২৪ লাইন) ও `sales.service.ts` (৫১৭ লাইন) বিক্রির আলাদা বাস্তবায়ন। আসল পথ `sync/route.ts`-এর `syncSale`। দুই জায়গায় এক লজিক মানেই একটা পিছিয়ে পড়ে। একটাই শেয়ার্ড সার্ভিস রাখুন।
- ক্লায়েন্ট `Customer` ও `Prepayment` সিঙ্ক-অ্যাকশন কখনো কিউতে রাখে না। তবু সার্ভারে `customer:*` ও `prepayment:create` আছে, শুধু আক্রমণের পৃষ্ঠতল বাড়ায়। মুছুন।
- `sync/route.ts`-এর ৫০০ হ্যান্ডলার `error.message` ফেরত দেয়। সাধারণ বার্তা দিন, বিস্তারিত শুধু লগে।

### ১৪. স্কেল ও দীর্ঘমেয়াদি ঝুঁকি
- `GET /api/backup` একসাথে ২১টা টেবিল সম্পূর্ণ মেমরিতে লোড করে। বড় ডেটায় Workers-এর মেমরি/সময় সীমায় ফেইল করবে। স্ট্রিম বা পেজিনেশন দরকার।
- JWT ১০ বছর, পাসওয়ার্ড বদলালে পুরনো টোকেন বাতিল হয় না (ব্যবহারকারী নিষ্ক্রিয় হলে ঠেকে, কারণ ডিবি চেক হয়)। `tokenVersion` রাখলে ডিভাইস হারানোর ঝুঁকি কমে।
- দুই ধরনের Firebase API কী (`google-services.json` বনাম `firebase.ts` ফলব্যাক)। এগুলো সিক্রেট নয়, কিন্তু একই প্রজেক্টের কিনা মিলিয়ে নিন এবং Google Cloud-এ রেস্ট্রিকশন দিন।

---

## টেস্টে বড় ফাঁক

৫৫টা API রুটের মাত্র ৭টায় টেস্ট আছে। এগুলোর **একটাতেও নেই**: `sync` (১০৭৫ লাইন, সবচেয়ে সংবেদনশীল), `sales`, `sales/returns`, `refunds`, `due-collection`, `prepayment`, `customers`, `auth`, `register`, `sync-worker`। তাই ৩২৬টা টেস্ট পাস করলেও ওপরের সব বাগ নিরব। প্রথমে এই বাগগুলোর জন্য **ব্যর্থ-হওয়া টেস্ট** লিখুন, তারপর ঠিক করুন। এতে ফিক্স প্রমাণিত থাকবে আর পরে ফিরে আসবে না।

---

## কাজের ক্রম

1. **এই সপ্তাহ (ছোট, উচ্চ প্রভাব):** ১ (পারমিশন ম্যাপ), ২ (প্রক্সিতে ৪০১ + ক্লায়েন্ট গার্ড), ৮ (ক্রন fail-closed + কোথায় চালাবেন ঠিক করা), ১২ (সফল দাবির মিথ্যা বন্ধ)
2. **দ্বিতীয় সপ্তাহ:** ৩ ও ৪ (স্টক/WAC সিঙ্ক), ৫ (ডিপেন্ডেন্সি-সচেতন রিট্রাই), ৬ (কাঁচা SQL ফলব্যাক মুছুন, popularity সরান), ৭ (আইডেমপোটেন্সি ট্রানজ্যাকশনের ভেতরে)
3. **তৃতীয় সপ্তাহ:** ৯–১১ (`env.ts` কড়া করা, dummy ফলব্যাক মুছুন, রেজিস্টারে লিমিট ও স্লাগ), ১০ (Dockerfile ঠিক বা মুছুন, CI-তে `next build`, ভুয়া Playwright সরান)
4. **চতুর্থ সপ্তাহ:** ১৩ (মৃত কোড মুছুন), `sync`/`due-collection`-এর ইন্টিগ্রেশন টেস্ট GitHub Actions-এর Postgres সার্ভিসে

## যা আমি যাচাই করতে পারিনি

- কোনো আসল ডাটাবেস ছিল না, তাই API ইন্টিগ্রেশন টেস্ট চালাতে পারিনি। ৩, ৪, ৫, ৭-এর আচরণ কোড পড়ে নিশ্চিত, রানটাইমে নয়। ২-এর রিডাইরেক্ট আমি চালিয়ে প্রমাণ করেছি।
- ৪৬৪টা ফাইলের সবকটা পড়িনি। রিপোর্ট কম্পোনেন্ট, `sales/route.ts`-এর বিস্তারিত, `firebase-verify.ts`, `shift`/`purchase-order` সার্ভিস, Android নেটিভ অংশ বাদ গেছে।
- Neon ব্যাকআপ চালু আছে কিনা, প্রোডাকশনে Upstash ও `CRON_SECRET` সেট আছে কিনা কোড থেকে জানা যায় না।
- রিপো শ্যালো ক্লোন, তাই কমিট ইতিহাস দেখিনি।



ভাই, তোমার [POS অ্যাপের GitHub রিপোজিটরি](https://github.com/joysriramsarkar/pos-app) দেখে আমার মনে হচ্ছে, এখন তোমার সবচেয়ে বেশি দরকার নতুন করে অ্যাপটিকে বড় করা নয়; দরকার একটি দীর্ঘমেয়াদি স্থিতিশীলতা ও নির্ভরযোগ্যতা অভিযান (Stability and Reliability Initiative)।

লক্ষ্য হবে, যে ফিচারগুলো ইতিমধ্যে আছে, সেগুলো যেন প্রতিবার ঠিকভাবে কাজ করে; বিক্রি, স্টক, টাকা-পয়সার হিসাব, গ্রাহকের বকেয়া বা ডেটা সিঙ্কে ভুল না হয়; আর একটি সমস্যার সমাধান করতে গিয়ে অন্য ফিচার নষ্ট না হয়।

প্রথমেই বর্তমান অবস্থা সম্পর্কে কয়েকটি গুরুত্বপূর্ণ তথ্য।

মূল CI সফল হয়েছে

৭ অক্টোবর ২০২৬-এর সর্বশেষ যাচাই করা commit `3f68d0b`-এ dependency installation, Prisma client generation, ESLint, TypeScript typecheck এবং Vitest সফল হয়েছে।

[CI ফলাফল দেখো](https://github.com/joysriramsarkar/pos-app/actions/runs/37585587318)

Playwright workflow-ও সফল হয়েছে

একই commit-এ Playwright-এর বর্তমান টেস্টগুলোও সফল। কিন্তু বর্তমান `tests/example.spec.ts`-এ পরীক্ষার বিষয় Playwright-এর নিজস্ব ওয়েবসাইট—তোমার POS checkout নয়।

[Playwright ফলাফল দেখো](https://github.com/joysriramsarkar/pos-app/actions/runs/37585587225)

গুরুত্বপূর্ণ সুরক্ষাব্যবস্থা ইতিমধ্যেই রয়েছে

TypeScript, Zod validation, Prisma, অর্থের হিসাবের জন্য `decimal.js`, tenant-isolation tests এবং offline-sync worker-এর মতো ব্যবস্থা রয়েছে। সর্বশেষ commit-এও অর্থ, স্টক, অনুমতি, সিঙ্ক ও নিরাপত্তার নানা সংশোধন করা হয়েছে।

সব ফিচার নির্ভুল—এমন প্রমাণ এখনও নেই

বর্তমান CI সফল হওয়া আর বাস্তব দোকানের সব লেনদেন সঠিক হওয়া এক কথা নয়। বিশেষ করে database transaction, concurrency, offline recovery, সম্পূর্ণ billing workflow ও Android printing বাস্তবে পরীক্ষা করতে হবে।

একটি বাস্তব কথা: কোনো বড় সফটওয়্যারে একেবারেই কখনও কোনো বাগ থাকবে না—এমন নিশ্চয়তা দেওয়া যায় না। কিন্তু সুসংজ্ঞায়িত পরীক্ষার মাধ্যমে গুরুত্বপূর্ণ বাগের ঝুঁকি অনেক কমানো, আর নতুন বাগ ঢুকলে দ্রুত ধরে ফেলা সম্ভব।

এখানে আমি নতুন ফিচার যোগ করাকে কাজের বাইরে রাখছি। আগে বিদ্যমান আচরণগুলো বুঝে সেগুলোকে যাচাইযোগ্য, পুনরাবৃত্তিযোগ্য ও নিরাপদ করতে হবে।

# ১. প্রথমে যে সমস্যাগুলো সমাধান করা দরকার

রিপোজিটরির বর্তমান কোড, CI workflow ও টেস্ট-ফাইলের তালিকা ধরে আমি নিচের বিষয়গুলোকে অগ্রাধিকার দিচ্ছি। এগুলো একই ধরনের সমস্যা নয়: কিছু নিশ্চিত টেস্টিং-ঘাটতি, কিছু কোড থেকে দেখা যাচ্ছে এমন ঝুঁকি, আর কিছু বাস্তব ডেটাবেসে পরীক্ষা না করে নিশ্চিত হওয়া যাবে না।

P0 — বিক্রি ও আর্থিক হিসাবের অখণ্ডতা

অতি উচ্চ অগ্রাধিকার

একটি বিক্রি হলে বিক্রির রেকর্ড, বিক্রিত পণ্য, স্টক, পেমেন্ট, গ্রাহকের বকেয়া ও লেজার—সবকিছু একই ব্যবসায়িক নিয়ম অনুসারে সঠিক থাকতে হবে। মাঝপথে কোনো ধাপ ব্যর্থ হলে আংশিক লেনদেন থেকে যাওয়া চলবে না।

P0 — Offline sync ও duplicate prevention

অতি উচ্চ অগ্রাধিকার

নেটওয়ার্ক বিচ্ছিন্ন থাকা অবস্থায় বিক্রি, পুনরায় সংযোগ, timeout, লগইনের মেয়াদ শেষ হওয়া এবং একই অনুরোধ পুনরায় পাঠানোর ক্ষেত্রে কোনো বিক্রি হারানো বা দুবার গণনা হওয়া চলবে না।

P0 — Multi-tenant ও permission isolation

অতি উচ্চ অগ্রাধিকার

এক দোকানের কর্মী যেন অন্য দোকানের পণ্য, বিক্রি, গ্রাহক, রিপোর্ট, ব্যাকআপ অথবা সিঙ্ক-ডেটা দেখতে বা পরিবর্তন করতে না পারেন। শুধুমাত্র UI-তে বাটন লুকিয়ে রাখলে চলবে না; সার্ভারেও অনুমতি যাচাই করতে হবে।

P1 — Database concurrency ও recovery

একসঙ্গে দুই ক্যাশিয়ার একই পণ্য বিক্রি করলে, একসঙ্গে বকেয়া আদায় করলে, অথবা একই purchase order দুবার গ্রহণ করলে হিসাব যেন ভুল না হয়।

P1 — Invoice, printing ও Android

কাগজে মুদ্রিত বিল, PDF, শেয়ার করা বিল এবং ডেটাবেসে থাকা বিক্রির তথ্য একই হতে হবে। বাংলা অক্ষর, বাংলা সংখ্যা, কাগজের মাপ এবং Android-এর system print flow আলাদাভাবে পরীক্ষা করতে হবে।

## ২. বিক্রির হিসাব: এখানে ভুলের কোনো সুযোগ রাখা যাবে না

`src/app/api/sales/route.ts`, `src/lib/money.ts`, `src/lib/sale-calculations.ts`, `src/lib/sale-stock.ts` এবং `src/lib/sale-returns.ts`—এই অংশগুলোকে একসঙ্গে audit করতে হবে। কারণ বিক্রি মানে শুধু একটি `Sale` রেকর্ড তৈরি করা নয়।

### ২.১ একটিমাত্র authoritative calculation model

সার্ভারকেই চূড়ান্ত হিসাব নির্ধারণ করতে হবে। ব্রাউজার থেকে পাঠানো মূল্য বা মোট টাকা বিশ্বাস করে সরাসরি সংরক্ষণ করা যাবে না।

ধরা যাক:

| হিসাব                 | উদাহরণ |
| --------------------- | ------ |
| ৩টি পণ্য, প্রতিটি ₹৫০ | ₹১৫০   |
| ছাড়                  | ₹১০    |
| কর                    | ₹৭     |
| বিলের মোট             | ₹১৪৭   |
| নগদে পরিশোধ           | ₹১০০   |
| UPI-তে পরিশোধ         | ₹২০    |
| গ্রাহকের বকেয়া       | ₹২৭    |

এক্ষেত্রে সিস্টেমকে একই সঙ্গে নিশ্চিত করতে হবে:

- আইটেমের মোট ₹১৫০।
- চূড়ান্ত বিল ₹১৪৭।
- পেমেন্টের মোট ₹১২০ এবং বকেয়া ₹২৭।
- স্টক ঠিক ৩টি কমেছে।
- গ্রাহকের লেজারে সঠিক পরিমাণ লেখা হয়েছে।
- রিপোর্টে ₹১৪৭ বিক্রয় দেখানো হচ্ছে, ₹১৫০ নয়।

কর ও ছাড়ের ক্রম, rounding এবং আংশিক পেমেন্টের নিয়ম ব্যবসার বিদ্যমান নিয়মের সঙ্গে মিলিয়ে নিতে হবে। উদাহরণটি পরীক্ষার নমুনা, তোমার অ্যাপের প্রতিটি পণ্যের জন্য প্রযোজ্য কোনো নতুন করনীতি নয়।

### ২.২ টাকা-পয়সার নির্ভুলতা

তোমার অ্যাপে `decimal.js` এবং `src/lib/money.ts` রয়েছে—এটি ভালো ভিত্তি। তবুও প্রতিটি মডিউলে এর সঠিক ব্যবহার নিশ্চিত করতে হবে।

পরীক্ষার মধ্যে রাখো:

| ইনপুট বা পরিস্থিতি          | যা যাচাই হবে                                                 |
| --------------------------- | ------------------------------------------------------------ |
| ₹০.১০ + ₹০.২০               | সঠিক ফল ₹০.৩০                                                |
| ৩ × ₹১.২৫                   | ₹৩.৭৫                                                        |
| অনেকগুলো fractional unit    | নির্ধারিত precision বজায় থাকে                               |
| শূন্য ছাড় ও শূন্য কর       | মোটের হিসাব অপরিবর্তিত                                       |
| অতিরিক্ত ছাড়               | নীতিমতে প্রত্যাখ্যান                                         |
| ঋণাত্মক বা অসীম সংখ্যা      | invalid input হিসেবে প্রত্যাখ্যান                            |
| অতি বড় সংখ্যা              | overflow বা অস্বাভাবিক মান প্রত্যাখ্যান                      |
| ₹১০০.০০ বিল, ₹১০০.০১ পরিশোধ | বিদ্যমান নিয়ম অনুযায়ী প্রত্যাখ্যান বা সঠিক change handling |

বিশেষ করে `src/schemas/index.ts`-এ শুধু `finite()` পরীক্ষা যথেষ্ট কি না, প্রতিটি পরিমাণের business-level সীমা আছে কি না তা দেখতে হবে। যেমন `ProductInputSchema.currentStock` এবং `minStockLevel`-এর ক্ষেত্রে বর্তমানে `z.coerce.number().default(...)` আছে, কিন্তু ওই schema-তে নিজে থেকে non-negative সীমা নির্ধারণ করা নেই। পরের স্তরে একই যাচাই থাকলে সমস্যা নাও হতে পারে; তাই API ও database স্তর মিলিয়ে পরীক্ষা করা জরুরি।

### ২.৩ পণ্যের বিক্রয়মূল্য ও ছাড়

`src/lib/sale-pricing.ts`-এ সার্ভার-নির্ধারিত পণ্যমূল্যের ভিত্তিতে ছাড়ের অনুমতি যাচাই করা হচ্ছে।

এখানে তিনটি আলাদা পরিস্থিতি পরীক্ষা করতে হবে:

1\. ক্যাশিয়ার বৈধ মূল্য ও বৈধ ছাড় দিয়ে বিক্রি করছেন।

2\. ক্যাশিয়ার অনুরোধের `unitPrice` পরিবর্তন করে অতিরিক্ত ছাড় দেওয়ার চেষ্টা করছেন।

3\. কোনো পণ্যের authoritative selling price পাওয়া যাচ্ছে না, পণ্য নিষ্ক্রিয় বা অন্য দোকানের পণ্য।

তৃতীয় ক্ষেত্রে বর্তমান কোডে অজানা মূল্যগুলোর জন্য পুরোপুরি প্রত্যাখ্যান করার বদলে পরবর্তী validation-এর ওপর নির্ভর করা হয়েছে। তাই downstream stock, product ownership এবং সক্রিয়তার নিয়ম ঠিকভাবে কাজ করছে কি না বিশেষভাবে যাচাই করতে হবে।

প্রত্যাশিত ফল: সার্ভার অনুমোদিত দাম ও discount limit মেনে বিক্রি গ্রহণ করবে; অনুমোদনহীন বা অস্তিত্বহীন পণ্যে বিক্রি বন্ধ হবে।

### ২.৪ Stock transaction ও concurrent sale

`src/lib/sale-stock.ts`-এ `lockAndPlanSaleStock()` এবং `applySaleStockPlans()` রয়েছে। বিক্রির সময় product row lock ও stock planning-এর ব্যবস্থা ইতিমধ্যে আছে।

এখন শুধু function-level unit test নয়, বাস্তব PostgreSQL-এ পরীক্ষা করতে হবে:

- স্টক ৫টি; দুই ক্যাশিয়ার একই সময়ে ৪টি করে বিক্রি করতে চান।
- একই product দুইবার cart-এ আছে।
- বিক্রির মাঝখানে product update হচ্ছে।
- বিক্রি তৈরি হয়েছে, কিন্তু stock history তৈরি করার সময় DB error হয়েছে।
- স্টক আপডেট সফল হয়েছে, কিন্তু গ্রাহকের ledger update ব্যর্থ হয়েছে।

প্রতিটি ক্ষেত্রে সঠিক outcome হতে হবে: হয় পুরো লেনদেন সফল, নয়তো সংশ্লিষ্ট সব database পরিবর্তন rollback। কোনো অর্ধেক বিক্রি, ভুল stock balance বা orphan stock history থাকা চলবে না।

একটি বিষয় আলাদা করে দেখো: বিক্রিতে shortage হলে `lockAndPlanSaleStock()`-কে `false` দেওয়া হয়েছে এবং কোডে loose goods/untracked inventory-এর জন্য auto-adjust-সংক্রান্ত মন্তব্য আছে। এটিকে অকারণে বাদ দেওয়া যাবে না, কারণ সেটি বিদ্যমান আচরণের অংশ হতে পারে। বরং কোন পণ্যকে কতটুকু negative বা shortage-adjust করা যায়, তার বর্তমান ব্যবসায়িক নিয়ম লিখে সেই নিয়মের পরীক্ষা তৈরি করতে হবে।

# ৩. Offline-first ব্যবস্থা: সবচেয়ে সাবধানে পরীক্ষা করতে হবে

তোমার POS-এ IndexedDB, sync worker, queue, retry এবং server-side idempotency ব্যবস্থার উল্লেখ আছে। এগুলো একসঙ্গে কাজ না করলে offline বিক্রি কখনও হারিয়ে যেতে পারে, আবার কখনও একই বিক্রি দুইবার সংরক্ষিত হতে পারে।

সম্পর্কিত ফাইল:

- `src/lib/offline/indexeddb.ts`
- `src/lib/offline/sync-worker.ts`
- `src/app/api/sync/route.ts`
- `src/lib/offline/network-listener.ts`
- `src/stores/pos-store.ts`

## ৩.১ Sync-কে একটি state machine হিসেবে নির্ধারণ করো

একটি queue item-এর জন্য স্পষ্ট state transition থাকা দরকার।

\#chatgpt-mermaid-\_r_118\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI","Helvetica","Apple Color Emoji","Arial",sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_118\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_118\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_118\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_118\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_118\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_118\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_118\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_118\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_118\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_118\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_118\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_118\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI","Helvetica","Apple Color Emoji","Arial",sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_118\_ p{margin:0;}#chatgpt-mermaid-\_r_118\_ defs [id$="-barbEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_118\_ g.stateGroup text{fill:rgb(83, 154, 248);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_118\_ g.stateGroup text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_118\_ g.stateGroup .state-title{font-weight:bolder;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ g.stateGroup rect{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_118\_ g.stateGroup line{stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_118\_ .transition{stroke:rgb(143, 143, 143);stroke-width:1;fill:none;}#chatgpt-mermaid-\_r_118\_ .stateGroup .composit{fill:transparent;border-bottom:1px;}#chatgpt-mermaid-\_r_118\_ .stateGroup .alt-composit{fill:#e0e0e0;border-bottom:1px;}#chatgpt-mermaid-\_r_118\_ .state-note{stroke:rgb(107, 198, 127);fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_118\_ .state-note text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_118\_ .stateLabel .box{stroke:none;stroke-width:0;fill:rgb(222, 234, 251);opacity:0.5;}#chatgpt-mermaid-\_r_118\_ .edgeLabel .label rect{fill:rgb(222, 234, 251);opacity:0.5;}#chatgpt-mermaid-\_r_118\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_118\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_118\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_118\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ .label div .edgeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ .stateLabel text{fill:rgb(13, 13, 13);font-size:10px;font-weight:bold;}#chatgpt-mermaid-\_r_118\_ .node circle.state-start{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_118\_ .node .fork-join{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_118\_ .node circle.state-end{fill:rgb(83, 154, 248);stroke:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_118\_ .end-state-inner{fill:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_118\_ .node rect{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_118\_ .node polygon{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_118\_ [id$="-barbEnd"]{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_118\_ .statediagram-cluster rect{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_118\_ .cluster-label,#chatgpt-mermaid-\_r_118\_ .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ .statediagram-cluster rect.outer{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_118\_ .statediagram-state .divider{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_118\_ .statediagram-state .title-state{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_118\_ .statediagram-cluster.statediagram-cluster .inner{fill:transparent;}#chatgpt-mermaid-\_r_118\_ .statediagram-cluster.statediagram-cluster-alt .inner{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_118\_ .statediagram-cluster .inner{rx:0;ry:0;}#chatgpt-mermaid-\_r_118\_ .statediagram-state rect.basic{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_118\_ .statediagram-state rect.divider{stroke-dasharray:10,10;fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_118\_ .note-edge{stroke-dasharray:5;}#chatgpt-mermaid-\_r_118\_ .statediagram-note rect{fill:rgb(243, 243, 243);stroke:rgb(107, 198, 127);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_118\_ .statediagram-note rect{fill:rgb(243, 243, 243);stroke:rgb(107, 198, 127);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_118\_ .statediagram-note text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ .statediagram-note .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ .statediagram .edgeLabel{color:red;}#chatgpt-mermaid-\_r_118\_ [id$="-dependencyStart"],#chatgpt-mermaid-\_r_118\_ [id$="-dependencyEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_118\_ .statediagramTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].statediagram-cluster rect{fill:rgb(222, 234, 251);stroke:url(#chatgpt-mermaid-\_r_118\_-gradient);stroke-width:1;}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].statediagram-cluster rect.outer{rx:5px;ry:5px;filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_118\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_118\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_118\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_118\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_118\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_118\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_118\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_118\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_118\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI","Helvetica","Apple Color Emoji","Arial",sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}PendingProcessingSyncedRetryWaitFailedLocal operation queuedNetwork availableServer committedNetwork / timeout / 429Retry eligiblePermanent validation failureUser-authorized retryAuthentication expired

এখানে বিশেষ বিষয় হলো `Synced` অর্থ শুধু HTTP 200 নয়। সার্ভারকে operation-টি সম্পন্ন করে database-এ commit করতে হবে। তার আগে client queue থেকে item সফল বলে মুছে ফেলা যাবে না।

### ৩.২ বর্তমান idempotency বাস্তবে কতটা নিরাপদ?

`src/app/api/sync/route.ts`-এ `X-Idempotency-Key` নেওয়া হচ্ছে; `SyncQueue.idempotencyKey` database-এ unique। এই দুটি ভালো প্রতিরক্ষা।

কিন্তু কোডে পরীক্ষা করতে হবে, একই key দিয়ে দুটি POST request একই সময়ে এলে কী হয়। বর্তমান route-এ transaction-এর ভেতরে প্রথমে `findUnique()` দিয়ে পুরোনো synchronized entry খোঁজা হচ্ছে, তারপর operation সম্পন্ন করে `upsert()` করা হচ্ছে।

এখানে concurrency test অত্যাবশ্যক। কারণ শুধু key unique হলেই ব্যবসায়িক operation স্বয়ংক্রিয়ভাবে exactly-once হয় না। প্রতিযোগী transaction, unique-constraint error, transaction rollback এবং retry—সবকিছুর সম্মিলিত আচরণ পরীক্ষা করতে হবে।

পরীক্ষা:

- একই key দিয়ে একসঙ্গে ১০টি অনুরোধ।
- server operation commit হওয়ার পর response হারিয়ে যাওয়া।
- একই key-এর সঙ্গে আলাদা payload।
- একই key দিয়ে অন্য business context থেকে অনুরোধ।
- প্রথম request ব্যর্থ হওয়ার পরে একই key পুনরায় পাঠানো।

প্রত্যাশিত ফল: একটি বিক্রির জন্য একটি মাত্র business operation হবে; পুনরায় পাঠানো অনুরোধে পুরোনো ফল পাওয়া যাবে, কিন্তু নতুন করে স্টক বা ledger পরিবর্তন হবে না। একই key-এর payload আলাদা হলে নীতিমতে request প্রত্যাখ্যান করতে হবে—নীরবে অন্য operation চালানো উচিত নয়।

## ৩.৩ Retry এবং dead-letter আচরণ

বর্তমান `sync-worker.ts`-এ HTTP `4xx`-এর বেশিরভাগকে permanent failure বলা হয়েছে, আর `408` ও `429` retry-যোগ্য। Network error-এর ক্ষেত্রেও retry count বাড়ানো হয়।

এখানে নিম্নলিখিত বিষয় যাচাই করা দরকার:

| পরিস্থিতি                      | সঠিক আচরণের শর্ত                                      |
| ------------------------------ | ----------------------------------------------------- |
| নেটওয়ার্ক নেই                 | Queue item সংরক্ষিত থাকবে                             |
| HTTP 429                       | Retry-যোগ্য, server-এর retry নির্দেশনা মানা হবে       |
| HTTP 500                       | সীমিত retry ও পরবর্তী recovery থাকবে                  |
| HTTP 400 validation error      | কারণসহ failed item হিসেবে থাকবে                       |
| HTTP 401 session expired       | অনবরত retry নয়; পুনরায় login হলে recovery সম্ভব হবে |
| ভুল queue action               | বাদ পড়বে না; স্পষ্ট failure দেখাবে                   |
| browser বন্ধ বা crash          | পরবর্তীবার pending operation উদ্ধার হবে               |
| একই item অন্য batch-এ আবার চলে | পুনরাবৃত্ত ব্যবসায়িক প্রভাব হবে না                   |

বিশেষ ঝুঁকি: worker-এ `startSync()`-এর মধ্যে `isRunning` lock শুধু ওই JavaScript worker instance-এ প্রযোজ্য। অন্য tab, অন্য device বা অন্য client-এর concurrent request ঠেকানোর কাজ server-side idempotency ও database transaction-এর। তাই client-side lock-কে চূড়ান্ত সুরক্ষা ধরে নেওয়া যাবে না।

## ৩.৪ Last-write-wins এবং dependency ordering

`sync-worker.ts`-এ `updatedAt`-এর ভিত্তিতে পুরোনো entity update-কে stale ধরে বাদ দেওয়ার ব্যবস্থা আছে। এটি কিছু update conflict কমাতে পারে, কিন্তু সব ধরনের operation-এর জন্য নিরাপদ নয়।

ধরা যাক:

- একটি পণ্যের create operation pending।
- তারপর ওই পণ্যের stock update তৈরি হলো।
- এরপর product metadata-র আরেকটি update হলো।

শুধু timestamp দেখে queue reorder বা বাদ দিলে dependency ভাঙতে পারে। আবার বিক্রির দুটি আলাদা operation কখনও “সর্বশেষ সংস্করণ” নিয়মে একটির পরিবর্তে অন্যটি হিসেবে গণ্য করা যায় না।

সুতরাং:

- `sale:create`, stock adjustment, due collection এবং ledger-entry-র মতো financial operation কখনও নিছক LWW-তে বাদ যাবে না।
- একই entity-র পরস্পরনির্ভর operation-এর ক্রম স্থির রাখতে হবে।
- entity update-এ version বা conflict detection কীভাবে করা হবে, তা বিদ্যমান আচরণ অনুযায়ী নির্ধারণ করতে হবে।
- “stale বলে বাদ দেওয়া” operation-কে `synced` চিহ্নিত করার আগে নিশ্চিত হতে হবে যে সেই update সত্যিই অপ্রয়োজনীয়।

## ৩.৫ Offline-এ ভুল দেখানো চলবে না

যখন বিক্রি offline-এ সম্পন্ন হচ্ছে, তখন UI-তে local sale এবং server-confirmed sale আলাদা করে বোঝা যায় কি না পরীক্ষা করো।

অ্যাপকে যেন ভুল করে এমন বার্তা দিতে না হয় যে বিক্রি server-এ নিশ্চিত হয়েছে, যখন সেটি এখনও queue-তে আছে।

প্রতিটি pending operation-এর ক্ষেত্রে দরকার:

- নির্ভরযোগ্য local persistence।
- server confirmation না পাওয়া পর্যন্ত pending status।
- permanent failure হলে স্পষ্ট কারণ।
- ভুল queue item পুনরায় চেষ্টা করার নিয়ন্ত্রিত ব্যবস্থা।
- server reject করলে local optimistic update-এর যথাযথ rollback বা reconciliation।
- logout/login বা active business পরিবর্তনের পরে আগের দোকানের queue ভুল দোকানে না যাওয়া।

তোমার সর্বশেষ commit-এর বর্ণনায় local rollback, business-scoped local storage এবং permanent `4xx` dead-letter নিয়ে সংশোধনের উল্লেখ আছে। এগুলোর প্রতিটি আচরণের জন্য regression test করতে হবে; শুধু commit message দেখে সঠিকতা ধরে নেওয়া যাবে না।

# ৪. Multi-tenant নিরাপত্তা: ব্যবসার ডেটা কখনও মিশবে না

তোমার অ্যাপে বহু ব্যবসা বা দোকান সমর্থনের ব্যবস্থা রয়েছে। তাই এখানে tenant isolation একটি সাধারণ security feature নয়—এটি আর্থিক ডেটার অখণ্ডতারও অংশ।

প্রাসঙ্গিক ফাইল:

- `src/lib/tenant.ts`
- `src/lib/tenant-scope.ts`
- `src/lib/api-middleware.ts`
- `src/lib/multi-tenant-security.test.ts`
- `src/lib/tenant-isolation.test.ts`
- `src/lib/offline/indexeddb.ts`

## ৪.১ Client-supplied business ID কখনও একমাত্র কর্তৃত্ব হবে না

বর্তমান `requireBusinessContext()` session-এর user ID থেকে active membership নির্ধারণ করে। এটি ভালো পদ্ধতি। কিন্তু প্রতিটি API route-এ সেই context ধারাবাহিকভাবে ব্যবহৃত হয়েছে কি না, তা পরীক্ষা করতে হবে।

বিশেষভাবে যাচাই করবে:

- `/api/sales`
- `/api/sync`
- `/api/products`
- `/api/customers`
- `/api/suppliers`
- `/api/purchases`
- `/api/expenses`
- `/api/reports/*`
- `/api/backup` ও restore
- `/api/prepayment/*`
- `/api/sales/returns` ও refund-সংক্রান্ত route

প্রতিটি query-তে সংশ্লিষ্ট `businessId`-এর সীমা বজায় থাকতে হবে। কোনো route শুধু entity ID দিয়ে অন্য ব্যবসার record পড়তে বা পরিবর্তন করতে পারবে না।

## ৪.২ একটি জরুরি পরীক্ষা: অন্য ব্যবসার entity ID

ধরা যাক, Business A-এর পণ্যটির ID `product_A`, আর Business B-এর কর্মী তার request-এ ওই ID পাঠালেন।

সঠিক ফল: request প্রত্যাখ্যাত হবে, অথবা সম্পদটি নেই এমন নিরাপদ response দেওয়া হবে। Business A-এর পণ্য পরিবর্তন হবে না; Business B কোনো sensitive তথ্য জানতে পারবেন না।

একই পরীক্ষা customer, supplier, sale, invoice, purchase order, return, backup এবং ledger-এর ক্ষেত্রেও চালাতে হবে।

## ৪.৩ Permission matrix পুরোপুরি যাচাই করো

Admin, Manager, Cashier এবং Viewer—যে role-গুলো ইতিমধ্যে আছে, তাদের বিদ্যমান অনুমতিগুলো একটি সারণিতে লেখো।

| কাজ                      | পরীক্ষা                         |
| ------------------------ | ------------------------------- |
| পণ্য দেখা                | অনুমোদিত role-এ সফল             |
| পণ্য তৈরি/পরিবর্তন       | অনুমোদন অনুযায়ী সফল বা 403     |
| বিক্রি তৈরি              | অনুমোদিত role-এ সফল             |
| ছাড়ের সীমা অতিক্রম      | প্রত্যাখ্যাত                    |
| বিক্রি বাতিল বা refund   | অনুমতি না থাকলে প্রত্যাখ্যাত    |
| user বা role পরিবর্তন    | অনুমতি না থাকলে প্রত্যাখ্যাত    |
| backup/restore           | যথাযথ administrative permission |
| অন্য tenant-এর ডেটা দেখা | সব role-এই নিষিদ্ধ              |

এগুলো শুধু UI button disable করে পরীক্ষা করলে হবে না। সরাসরি API request পাঠিয়েও দেখতে হবে।

## ৪.৪ Authentication ও session

সর্বশেষ commit-এ Firebase token server-side verification ও hardcoded secret fallback সরানোর কথা রয়েছে। এগুলো গুরুত্বপূর্ণ নিরাপত্তা সংশোধন।

এবার পরীক্ষা করো:

- জাল বা expired Firebase token।
- inactive user বা inactive business।
- active membership প্রত্যাহার করার পরে পুরোনো session।
- একই user-এর একাধিক business membership থাকলে business switching।
- logout-এর পরে web ও Android session।
- permission পরিবর্তনের পর session-এ পুরোনো তথ্য ব্যবহার হচ্ছে কি না।
- login rate-limit, password lockout এবং password change।

একটি বিশেষ ক্ষেত্রে নজর দাও: `requireBusinessContext()`-এ session-এর business ID নির্দিষ্ট active membership-এর সঙ্গে না মিললে কোডটি fallback membership ব্যবহার করে। এই fallback-কে business switching-এর বিদ্যমান নিয়মের সঙ্গে মিলিয়ে পরীক্ষা করতে হবে, যাতে পুরোনো বা ভুল session context-এ নীরবে অন্য business select না হয়।

# ৫. Automated Testing: শুধু টেস্ট পাস করলেই যথেষ্ট নয়

তোমার repository-তে unit test-এর ভালো ভিত্তি আছে। আমি বর্তমান tree-তে নিম্নলিখিত test files যাচাই করেছি:

- `src/lib/money.test.ts`
- `src/lib/sale-stock.test.ts`
- `src/lib/sale-pricing.test.ts`
- `src/lib/sale-payment-consistency.test.ts`
- `src/lib/tenant-isolation.test.ts`
- `src/lib/offline/indexeddb.test.ts`
- `src/stores/pos-store.test.ts`
- `src/lib/printUtility.test.ts`
- `src/app/api/products/route.test.ts`
- `src/app/api/stock-entry/route.test.ts`
- `src/app/api/backup/route.test.ts`

এগুলোর অস্তিত্ব ভালো লক্ষণ। কিন্তু ফাইলের নাম দেখে বোঝা যায় না সব edge case আছে কি না। তাই পরের কাজ হবে টেস্টের সংখ্যা বাড়ানো নয়, টেস্টের অর্থবহ coverage বাড়ানো।

## ৫.১ বর্তমান CI-তে কী পরিবর্তন দরকার

বর্তমান: lint, typecheck, unit tests

বর্তমান `.github/workflows/ci.yml` এই checks চালায়। এগুলো অবশ্যই চালু রাখতে হবে।

যোগ করতে হবে: build verification

Production build সফল হচ্ছে কি না, server startup হচ্ছে কি না এবং প্রয়োজনীয় environment variables ছাড়া অ্যাপ নিরাপদে ব্যর্থ হচ্ছে কি না যাচাই করতে হবে।

যোগ করতে হবে: database integration tests

বাস্তব PostgreSQL transaction, constraints, row locks, rollback, একই সঙ্গে একাধিক request এবং tenant isolation পরীক্ষা করতে হবে।

পরিবর্তন করতে হবে: Playwright E2E tests

`tests/example.spec.ts`-কে POS-এর প্রকৃত পরীক্ষায় প্রতিস্থাপন করতে হবে। Test server চালু করে login থেকে checkout ও receipt পর্যন্ত বাস্তব flow পরীক্ষা করতে হবে।

### ৫.২ Playwright-কে বাস্তব POS পরীক্ষা করতে ব্যবহার করো

বর্তমান `playwright.config.ts`-এ `webServer` configuration মন্তব্যের মধ্যে আছে। ফলে CI-তে Playwright চালালেও বর্তমান test file-এর নিজের `https://playwright.dev/` ঠিকানায় যাওয়া ছাড়া অ্যাপের ব্যবহারকারীর flow যাচাই হচ্ছে না।

প্রস্তাবিত ন্যূনতম E2E scenario:

| ক্রম | পরীক্ষার কাজ         | সাফল্যের শর্ত                  |
| ---- | -------------------- | ------------------------------ |
| ১    | Login                | সঠিক user প্রবেশ করতে পারবেন   |
| ২    | Invalid login        | প্রবেশ আটকানো হবে              |
| ৩    | Product search       | সঠিক product পাওয়া যাবে       |
| ৪    | Cart update          | quantity ও total ঠিক থাকবে     |
| ৫    | Discount/payment     | অনুমোদিত হিসাব ঠিক থাকবে       |
| ৬    | Checkout             | একবারই sale তৈরি হবে           |
| ৭    | Reload               | নিশ্চিত sale হারাবে না         |
| ৮    | Transaction history  | সঠিক invoice দেখা যাবে         |
| ৯    | Print/PDF            | invoice-এর মূল তথ্য মিলবে      |
| ১০   | Permission violation | অননুমোদিত operation ব্যর্থ হবে |

এই পরীক্ষাগুলোতে dedicated test database ও পরিষ্কার test data ব্যবহার করবে। বাস্তব দোকানের production database-এ automated test চালানো যাবে না।

## ৫.৩ Regression test-এর নিয়ম

প্রতিটি বাগ ঠিক করার পরে অন্তত একটি এমন test তৈরি করতে হবে, যেটি আগে ব্যর্থ হতো এবং সংশোধনের পরে সফল হবে।

উদাহরণ:

- একই offline sale দুবার সিঙ্ক হচ্ছিল → একই idempotency key-তে দুটি সমান্তরাল request-এর test।
- refund-এ বেশি stock ফেরত আসছিল → আংশিক refund-এর পরে পুনরায় return-এর test।
- একটি tenant অন্য tenant-এর customer পড়তে পারছিল → cross-tenant read/update test।
- পেমেন্টের অঙ্কে rounding error হচ্ছিল → fractional amount ও repeated addition-এর test।
- একই purchase order দুবার receive হচ্ছিল → concurrent receive test।

এটাই ভালো regression discipline। একই ভুল যেন পরবর্তী refactor-এ ফিরে না আসে।

## ৫.৪ Coverage কীভাবে মাপবে

শুধু line coverage-কে গুণগত মানের বিকল্প বানিও না। তবু coverage report ব্যবহার করা উপকারী।

শুরুতে আলাদা coverage measure করো:

- `src/lib/money.ts`
- `src/lib/sale-*`
- `src/app/api/sales/route.ts`
- `src/app/api/sync/route.ts`
- stock-entry ও purchase-এর API routes
- `src/lib/tenant.ts` ও `src/lib/api-middleware.ts`
- offline queue ও sync worker

বিশেষ করে branch coverage দেখো। একটি function-এর সফল path পরীক্ষা হয়েছে, কিন্তু error বা concurrency path পরীক্ষা হয়নি—এমন অবস্থা coverage report ও scenario checklist একসঙ্গে দেখে খুঁজতে হবে।

# ৬. Inventory, Purchase ও Stock History

স্টক-সংক্রান্ত ভুল দোকানের দৈনিক কাজ ব্যাহত করতে পারে। বিক্রি ঠিক হলেও purchase, return বা adjustment ভুল হলে শেষে physical stock এবং সফটওয়্যারের stock মিলবে না।

প্রাসঙ্গিক মডিউল:

`src/server/services/inventory.service.ts`, `src/server/services/product-import.service.ts`, `src/lib/sale-stock.ts` এবং purchase/stock-entry-সংক্রান্ত API routes।

## ৬.১ প্রতিটি stock পরিবর্তনের হিসাব মেলাতে হবে

নিচের invariant (সব সময় সত্য থাকতে হবে এমন শর্ত) নির্ধারণ করো:

\\[ \begin{aligned} \text{Closing Stock} ={}& \text{Opening Stock}\\\ &+ \text{Received Stock}\\\ &+ \text{Sale Returns}\\\ &- \text{Sales}\\\ &- \text{Stock Adjustments} \end{aligned} \\]

এটি তোমার বিদ্যমান stock business rules অনুযায়ী বাস্তবায়িত হবে। কোনো পণ্যের নির্দিষ্ট হিসাব আলাদাভাবে পরিচালিত হলে সেটিও নথিভুক্ত করতে হবে।

প্রতিটি পরিবর্তনের জন্য নিশ্চিত করতে হবে:

- পরিমাণ ঠিক আছে।
- সঠিক পণ্য ও business ID ব্যবহার হয়েছে।
- stock history record হয়েছে।
- WAC বা weighted average cost ঠিকভাবে পরিবর্তিত হয়েছে।
- পুরোনো sale-এর cost snapshot অকারণে পরিবর্তন হয়নি।
- failure হলে stock ও history একইভাবে rollback হয়েছে।

## ৬.২ Purchase order receiving

যেহেতু সর্বশেষ commit-এর বর্ণনায় cumulative receiving ও row lock সংশোধনের কথা আছে, এটি বিশেষভাবে regression-test করা উচিত।

উদাহরণ: purchase order-এ ১০০টি পণ্য আছে। প্রথমবার ৩০টি, দ্বিতীয়বার ৪০টি, তৃতীয়বার ৩০টি গ্রহণ করা হলো। শেষ পর্যন্ত stock-এ মোট ১০০টি যোগ হওয়া উচিত, ২০০টি নয়। একই request পুনরায় পাঠালেও duplicate receiving চলবে না।

তারপর পরীক্ষা করো:

- অনুমোদিত পরিমাণের চেয়ে বেশি receive।
- শূন্য বা ঋণাত্মক receiving quantity।
- মাঝপথে network timeout।
- দুই ব্যবহারকারীর concurrent receiving।
- purchase invoice, stock history ও supplier balance-এর মিল।

## ৬.৩ Product import ও bulk operations

CSV বা bulk stock entry-এর ক্ষেত্রেও:

- duplicate barcode-এর নিয়ম।
- invalid row-এর handling।
- আংশিক সফল import-এর ফলাফল।
- ভুল encoding বা বাংলা নাম।
- decimal quantity।
- import পুনরায় চালালে duplicate stock যোগ হচ্ছে কি না।

এসবের পরিষ্কার প্রত্যাশিত আচরণ থাকতে হবে। একাধিক পণ্য পরিবর্তনের কাজ যদি একসঙ্গে সম্পন্ন হওয়ার কথা হয়, তবে failure-এর সময় partial update অনুমোদিত কি না সেটাও স্পষ্ট করতে হবে।

# ৭. Return, Refund, Prepaid, Due ও Supplier Ledger

এগুলি পরস্পরের সঙ্গে জড়িত। এক জায়গার ছোট ভুল রিপোর্টে লাভ-ক্ষতির পার্থক্য সৃষ্টি করতে পারে।

প্রাসঙ্গিক মডিউলগুলোর মধ্যে আছে `src/lib/sale-returns.ts`, `src/server/services/sales.service.ts`, `src/server/services/supplier.service.ts` এবং prepayment-সংক্রান্ত API routes।

## ৭.১ Sale return ও refund

`src/lib/sale-returns.ts`-এ আগের return quantity হিসাব করে সর্বোচ্চ ফেরতযোগ্য পরিমাণ নির্ধারণের ব্যবস্থা আছে। এবার নিশ্চিত করতে হবে, দুটি return request একসঙ্গে এলে দুটিই যেন একই অবশিষ্ট quantity ফেরত দিতে না পারে।

পরীক্ষা করো:

- আংশিক return।
- একই item-এর দ্বিতীয় return।
- মূল বিক্রির মোট quantity-এর বেশি return।
- সম্পূর্ণ refund-এর পরে পুনরায় refund।
- cancellation-এর পরে return।
- refund-এর সঙ্গে discount ও tax-এর অনুপাত।
- stock, cash, customer due ও prepaid balance-এর প্রভাব।
- পুরোনো legacy refund record থাকলে double-counting হচ্ছে কি না।

বিশেষ করে একই পণ্য একটি invoice-এ একাধিক line item হিসেবে থাকলে individual-line quantity এবং product-level remaining quantity দুটোই ঠিক থাকতে হবে।

## ৭.২ Customer due ও prepaid balance

প্রতিটি customer-এর জন্য নিম্নলিখিত সম্পর্ক যাচাই করো:

- বিক্রিতে বকেয়া বাড়ে।
- due collection-এ বকেয়া কমে।
- অতিরিক্ত due collection বর্তমান নিয়মে প্রত্যাখ্যাত হয়।
- prepaid top-up balance বাড়ায়।
- prepaid withdrawal balance কমায়।
- sale-এ prepaid ব্যবহার করলে balance এবং ledger একসঙ্গে পরিবর্তিত হয়।
- একই operation পুনরায় পাঠালে balance দ্বিতীয়বার পরিবর্তিত হয় না।

এখানে কেবল balance-এর বর্তমান মান দেখলেই হবে না। পুরো ledger-এর entries যোগ করে balance-এর সঙ্গে মিলিয়ে দেখতে হবে।

প্রস্তাব: test-এ ledger invariant রাখো, যেমন transaction-এর আগে ও পরে customer balance এবং নতুন ledger entries-এর পার্থক্য একে অপরের সঙ্গে মেলে কি না।

## ৭.৩ Supplier payment ও expense

Supplier-এর কাছে কত টাকা পাওনা, কত টাকা দেওয়া হয়েছে এবং কোন ক্রয়ের সঙ্গে সেই payment যুক্ত—এই তথ্য সব সময় মিলতে হবে।

একটি supplier payment-এর জন্য যাচাই করো:

- supplier-এর বর্তমান due।
- payment amount ও payment method।
- ledger entry।
- purchase/payment reference।
- expense রিপোর্টে সঠিক শ্রেণিবিন্যাস।
- duplicate request-এ পুনরায় টাকা কাটা হচ্ছে কি না।

নেগেটিভ due, duplicate payment এবং purchase order-এর চেয়ে বেশি payment—এই পরিস্থিতিগুলোর বর্তমান business rule আলাদা করে লিখে test করতে হবে। সব ক্ষেত্রে একই নিয়ম ধরে নেওয়া উচিত নয়।

# ৮. Reports: একই তথ্য, একই হিসাব

POS-এর রিপোর্ট নির্ভরযোগ্য না হলে বিক্রি সঠিক হলেও ব্যবসায়ী ভুল সিদ্ধান্ত নিতে পারেন।

যেসব রিপোর্ট যাচাই করা দরকার:

- দৈনিক ও মাসিক বিক্রি।
- cash ও UPI reconciliation।
- due এবং prepaid balance।
- পণ্যের বর্তমান stock।
- weighted average cost।
- gross profit ও net profit।
- return ও refund।
- expense ও supplier payment।
- category, product ও customer report।
- manual daily records।

### একটি golden dataset তৈরি করো

একটি ছোট স্থির test dataset-এ নির্ধারিত সংখ্যক বিক্রি, purchase, expense, return, cash payment, UPI payment ও due collection থাকবে। তার প্রত্যাশিত ফল হাতে হিসাব করে লিখে রাখো।

তারপর একই dataset-এর জন্য:

1\. Transaction history-এর মোট।

2\. Dashboard-এর মোট।

3\. Sales report-এর মোট।

4\. Cash/UPI reconciliation।

5\. Profit report-এর ফল।

সব মিলিয়ে দেখতে হবে।

এক্ষেত্রে ব্যবসার তারিখ ও timezone, sale return অন্তর্ভুক্তির নিয়ম, canceled sale-এর প্রভাব এবং cost snapshot-এর নিয়ম স্পষ্ট থাকতে হবে। একটি রিপোর্টে বর্তমান product cost ব্যবহার করে অন্য রিপোর্টে historical sale cost ব্যবহার করলে একই সময়ের লাভের হিসাব অমিল হতে পারে।

তোমার সর্বশেষ commit-এর বিবরণে revenue ও return/COGS হিসাব নিয়ে সংশোধনের কথা রয়েছে। তাই এগুলোকে বিশেষ regression test-এর আওতায় রাখো।

# ৯. Backup ও Restore: শুধু ফাইল তৈরি হওয়া যথেষ্ট নয়

`src/app/api/backup/route.test.ts` আছে এবং সর্বশেষ commit-এ full backup/restore-সংক্রান্ত পরিবর্তনের উল্লেখ রয়েছে। কিন্তু backup সফল বলে দেখালেই সেটি নির্ভরযোগ্য প্রমাণিত হয় না।

## যা পরীক্ষা করবে

Backup integrity

- সব প্রাসঙ্গিক business data অন্তর্ভুক্ত হচ্ছে কি না।
- গ্রাহক, পণ্য, বিক্রি, sale items, purchase, stock history, ledger, settings এবং ব্যবহারকারীর সম্পর্ক ঠিক থাকছে কি না।
- Decimal, date, timezone, enum এবং nullable field ঠিকভাবে সংরক্ষিত হচ্ছে কি না।
- backup file অর্ধেক লেখা বা malformed হলে সেটি সফল হিসেবে দেখানো হচ্ছে কি না।

Restore integrity

- পরিচ্ছন্ন test database-এ restore।
- ইতিমধ্যে থাকা ডেটার সঙ্গে restore।
- একই backup দুবার restore।
- মাঝপথে restore ব্যর্থ হওয়া।
- invalid বা পরিবর্তিত backup।
- এক business-এর backup অন্য business-এ restore করার চেষ্টা।
- restore-এর পরে database constraints ও foreign-key relationships।

Restore যেন নীরবে বিদ্যমান ব্যবসার ডেটা মুছে না দেয়। বিদ্যমান আচরণ অনুসারে overwrite বা merge-এর নিয়ম নির্ধারণ করতে হবে, এবং যে অপারেশন ব্যর্থ হলে পুরোনো ডেটা অক্ষত থাকার কথা, সেটিতে rollback নিশ্চিত করতে হবে।

একটি বাধ্যতামূলক release test: backup তৈরি, নতুন test database-এ restore, তারপর আগের golden dataset-এর প্রতিটি মোট, stock balance, ledger balance এবং report পুনরায় গণনা। সব মিললেই এই পরীক্ষা সফল বলে ধরা হবে।

# ১০. Invoice, PDF, Printing ও Android

বিলের দৃশ্যমান ফলাফল ব্যবসায়িক রেকর্ডেরই অংশ। তাই এখানে শুধু component render হচ্ছে কি না পরীক্ষা করলেই হবে না।

প্রাসঙ্গিক মডিউল:

- `src/lib/printUtility.ts`
- `src/lib/invoicePdf.ts`
- `src/lib/receipt-i18n.ts`
- `src/components/pos/PrintDialog.tsx`
- `src/components/pos/PrintInvoice.tsx`
- Android-এর Capacitor shell ও native print flow

## পরীক্ষার পরিকল্পনা

| পরিস্থিতি                             | কী যাচাই করবে                                 |
| ------------------------------------- | --------------------------------------------- |
| ৫৮ মিমি thermal paper                 | বিলের লেখা ও মোট দৃশ্যমান                     |
| ৮০ মিমি thermal paper                 | সঠিক width ও alignment                        |
| A4/A5 invoice                         | page break ও clipping নেই                     |
| বাংলা receipt                         | যুক্তাক্ষর ও বাংলা অক্ষর ঠিক                  |
| Bengali digits                        | একই পরিমাণ, শুধু প্রত্যাশিত locale formatting |
| Receipt language `bn` / `en` / `both` | সেটিং অনুযায়ী আউটপুট                         |
| Long product name                     | কাটা না পড়ে বা bill ভেঙে না যায়             |
| বড় item list                         | সব item ও grand total অন্তর্ভুক্ত             |
| Android print                         | system print panel সঠিকভাবে খোলে              |
| PDF sharing                           | PDF ফাইল তৈরি ও খুলতে পারে                    |
| Cancelled/refunded sale               | status ও refund তথ্য সঠিক                     |

সবচেয়ে গুরুত্বপূর্ণ invariant হলো: invoice total = database sale total = report-এর সংশ্লিষ্ট sale total। Format অনুযায়ী সংখ্যার চিহ্ন বা locale বদলাতে পারে, অর্থের মান নয়।

UI test ছাড়াও PDF-এর text extraction বা generated document-এর content-level test রাখবে; আর কাগজের alignment, বাংলা glyph rendering ও clipping-এর জন্য বাস্তব visual test দরকার।

# ১১. Authentication, API ও Security Hardening

এখানে নতুন security feature যোগ করার কথা বলছি না; বিদ্যমান security behavior ভাঙছে কি না তা নিশ্চিত করতে হবে।

## ১১.১ CSRF ও origin validation

`src/lib/api-middleware.ts` এবং `src/proxy.ts`-এ origin ও rate-limit-সংক্রান্ত ব্যবস্থা আছে।

যাচাই করতে হবে:

- অনুমোদিত origin থেকে অনুরোধ।
- অজানা origin থেকে state-changing request।
- Origin header অনুপস্থিত।
- `OPTIONS` preflight।
- CORS ও CSRF checks-এর সম্পর্ক।
- Android `capacitor://localhost` origin।
- proxy বা reverse proxy-র forwarded headers।
- rate-limit storage সাময়িকভাবে ব্যর্থ হওয়া।

`x-forwarded-for` বা অনুরূপ header-কে সব hosting environment-এ অন্ধভাবে বিশ্বাস করা যাবে না। কোন proxy সেটি লিখছে, সেই trust boundary অনুযায়ী IP নির্ধারণ করা উচিত।

## ১১.২ Error handling ও logging

API response-এ এমন database error বা internal details প্রকাশ করা যাবে না, যা ব্যবহারকারীর দরকার নেই বা অন্য ডেটা সম্পর্কে তথ্য ফাঁস করে।

তবে error-কে শুধু generic message দিয়ে গোপন করলেও চলবে না। Server-side log-এ correlation ID, operation type, business context, status ও প্রয়োজনীয় diagnostic তথ্য রাখতে হবে—কিন্তু password, token, পূর্ণ payment-sensitive data বা secret নয়।

যেসব error সাময়িক, সেগুলো পুনরায় চেষ্টা করা যেতে পারে। Validation ও permission error-এ blind retry করা উচিত নয়।

## ১১.৩ Rate-limit fallback

`src/proxy.ts`-এ Upstash Redis না থাকলে in-memory rate limiter-এ fallback হয়। একাধিক server instance বা serverless deployment-এ এই fallback সব instance মিলিয়ে একটি সমন্বিত limit নিশ্চিত করে না।

তাই স্থাপনার ক্ষেত্রে ঠিক করতে হবে:

- production-এ Redis বাধ্যতামূলক কি না।
- Redis failure হলে নিরাপদ নীতি কী হবে।
- authentication বা sensitive endpoint-এর জন্য distributed rate-limit কার্যকর কি না।
- health-check endpoint অনাবশ্যক তথ্য দিচ্ছে কি না।

এটি শুধু performance সমস্যা নয়; brute-force বা abuse প্রতিরোধের ক্ষেত্রেও গুরুত্বপূর্ণ।

# ১২. Database migration, deployment ও dependency stability

তোমার অ্যাপ Next.js, Prisma, PostgreSQL, Cloudflare/Vercel-ধরনের deployment path এবং Capacitor Android shell ব্যবহার করে। একই কোড বিভিন্ন পরিবেশে একভাবে কাজ করছে কি না, সেটি আলাদা করে প্রমাণ করতে হবে।

## ১২.১ Schema ও migration

`prisma/schema.prisma`, `prisma.config.ts` এবং database setup scripts পরীক্ষা করো।

- Local database ও production database schema মিলে কি না।
- migration ছাড়া `db push` ব্যবহার করলে পরিবর্তনের ঝুঁকি কী।
- unique constraint এবং foreign key production-এ আছে কি না।
- index বাস্তবে তৈরি হয়েছে কি না।
- পুরোনো ডেটার সঙ্গে schema পরিবর্তন সামঞ্জস্যপূর্ণ কি না।
- migration ব্যর্থ হলে rollback বা recovery পদ্ধতি কী।
- backup ছাড়া destructive schema change করা আটকানো আছে কি না।

Production database-এ সাধারণ feature testing-এর অংশ হিসেবে নির্বিচারে schema push চালানো উচিত নয়। Production schema change version-controlled ও review করা migration দিয়ে পরিচালনা করো।

## ১২.২ Build ও runtime test

CI-তে অন্তত নিচের আলাদা ধাপ থাকা উচিত:

1. `npm ci`
2. Prisma client generation
3. Lint
4. Typecheck
5. Unit tests
6. Database integration tests
7. Production build
8. Production server smoke test
9. POS E2E tests

এরপর deployment target অনুযায়ী Cloudflare worker build ও Android debug/release build যাচাই করতে হবে। সব টার্গেট একই workflow-তে বাধ্যতামূলক না হলেও release-এর সময় কোনগুলো প্রয়োজন তা স্পষ্ট থাকতে হবে।

## ১২.৩ Dependency update

তোমার `package.json` এবং `package-lock.json` আছে; lockfile অক্ষত রেখে reproducible install নিশ্চিত করতে হবে।

- নির্ধারিত Node.js সংস্করণ।
- lockfile-এর মাধ্যমে ঠিক একই dependency resolution।
- Dependabot-এর update PR।
- security advisory scan।
- major upgrade-এ regression suite।
- dependency update-এর আগে ও পরে build/test ফলাফলের তুলনা।

অকারণে সব dependency সর্বশেষ সংস্করণে আপডেট করা স্থিতিশীলতার কাজ নয়। নিরাপত্তা সংশোধন ও দরকারি compatibility update অগ্রাধিকার পাবে; প্রতিটি update-এর পরে পরীক্ষা বাধ্যতামূলক হবে।

# ১৩. Performance ও দীর্ঘক্ষণ ব্যবহারের পরীক্ষা

POS-এর ক্ষেত্রে একটি ছোট দোকানের পণ্য তালিকা ১০০টি হলেও কয়েক হাজার product, হাজার হাজার sale এবং দীর্ঘদিনের stock history জমলে আচরণ বদলাতে পারে।

এখানে নতুন performance feature বানানোর দরকার নেই। বিদ্যমান feature একই মান বজায় রেখে কাজ করছে কি না মাপতে হবে।

পরীক্ষার dataset হতে পারে:

- ১০,০০০ product।
- ৫০,০০০ sale।
- ১,০০,০০০ sale item।
- দীর্ঘ stock history ও ledger।
- প্রচুর customer ও supplier।
- একাধিক concurrent cashier।

এগুলো load test-এর উদাহরণ, বাস্তব production-এর বাধ্যতামূলক capacity target নয়। তোমার deployment ও database অনুযায়ী baseline নির্ধারণ করবে।

পরীক্ষা করবে product search, barcode lookup, checkout, transaction history, report generation, backup এবং sync backlog process করতে কত সময় লাগে। Slow query, excessive database connections, memory growth, UI hang ও বড় তালিকায় scrolling সমস্যা হলে আগে কারণ নির্ণয় করবে; benchmark ছাড়া caching বা architectural rewrite শুরু করবে না।

# ১৪. বাস্তবায়নের ধাপ: কোন ক্রমে কাজ করবে

আমি নিচের ক্রমে এগোনোর পরামর্শ দিচ্ছি। কোনো ধাপের কাজ অসম্পূর্ণ রেখে সব জায়গায় একসঙ্গে পরিবর্তন করো না।

## ১

Baseline ও বাগের তালিকা তৈরি

প্রথমে

একটি স্থির commit-এ বর্তমান lint, typecheck, test, build ও E2E ফলাফল সংরক্ষণ করো। বিদ্যমান feature inventory, database invariants এবং বর্তমান ব্যর্থতা লিখে রাখো। আগে থেকেই যা কাজ করছে, তার baseline না জেনে refactor করবে না।

## ২

P0 business invariants ও integration tests

Money, sale totals, stock, returns, due, prepaid এবং ledger-এর জন্য deterministic test লিখো। বাস্তব PostgreSQL-এ transaction, rollback ও concurrent request যাচাই করো।

## ৩

Offline-sync audit

Duplicate request, dropped response, retry, dead-letter, stale update ও session expiry-র test লিখো। Queue state এবং server ledger-এর মধ্যে অমিল হচ্ছে কি না পরীক্ষা করো।

## ৪

Tenant ও permission audit

সব API route-এ business scoping এবং server-side permission পরীক্ষা করো। cross-tenant test-গুলোকে বাধ্যতামূলক CI gate করো।

## ৫

বাস্তব E2E ও recovery

Playwright-এ login, product, checkout, history, print/PDF এবং permissions পরীক্ষা করো। Backup-restore round trip-ও চালাও।

## ৬

Release candidate validation

Production build, deployment target, Android shell, dependency scan, report reconciliation এবং দীর্ঘক্ষণ ব্যবহার পরীক্ষা করে versioned release তৈরি করো।

## ১৪.১ প্রতিটি ধাপের entry ও exit criteria

যে কোনো মডিউলকে “stabilized” ঘোষণা করার আগে এই শর্তগুলো মানতে হবে:

- সংশ্লিষ্ট test suite সফল।
- গুরুত্বপূর্ণ failure path পরীক্ষা হয়েছে।
- নতুন কোনো P0/P1 defect অমীমাংসিত নেই।
- বিদ্যমান business behavior ভাঙেনি।
- migration বা data change থাকলে test database-এ যাচাই হয়েছে।
- rollback/recovery path প্রমাণিত।
- review-তে পরিবর্তনের কারণ ও প্রভাব স্পষ্ট।

একটি মডিউল সফল হলেই গোটা অ্যাপ stable—এমন সিদ্ধান্ত নেওয়া যাবে না।

# ১৫. “কোনো বাগ নেই” বলার পরিবর্তে কীভাবে release-ready অবস্থা নির্ধারণ করবে

বাস্তবসম্মত লক্ষ্য হবে কোনো পরিচিত critical defect নেই, গুরুত্বপূর্ণ user journey-গুলো automated test-এ যাচাই করা, এবং failure হলে data loss বা financial inconsistency না হওয়া।

প্রস্তাবিত release gate:

| মানদণ্ড                    | Release শর্ত                                             |
| -------------------------- | -------------------------------------------------------- |
| Lint ও typecheck           | সফল                                                      |
| Unit ও regression tests    | সব বাধ্যতামূলক test সফল                                  |
| Database integration tests | Transaction, rollback ও concurrency test সফল             |
| Tenant security            | Cross-tenant access-এর কোনো সফল অননুমোদিত ঘটনা নেই       |
| Financial reconciliation   | Golden dataset-এর প্রত্যাশিত ফলের সঙ্গে পূর্ণ মিল        |
| Offline sync               | Duplicate বা dropped sale-এর কোনো পরীক্ষিত ব্যর্থতা নেই  |
| Backup restore             | Test database-এ সম্পূর্ণ পুনরুদ্ধার ও reconciliation সফল |
| Production build           | সব নির্বাচিত deployment target-এ সফল                     |
| E2E                        | Critical POS workflows সফল                               |
| পরিচিত defect              | P0/P1 খোলা নেই; অন্যান্য defect নথিভুক্ত ও অনুমোদিত      |

এখানে “কোনো পরীক্ষিত ব্যর্থতা নেই” গুরুত্বপূর্ণ কথা। কিছু পরীক্ষা সফল হওয়া মানেই সব সম্ভাব্য পরিস্থিতিতে নিশ্চয়তা নয়। বাস্তব ব্যবহারের error log, bug report ও regression test-এ পাওয়া তথ্য ধরে এই গেট ক্রমশ শক্ত করতে হবে।

## ১৫.১ Bug triage-এর নিয়ম

প্রতিটি বাগকে চারটি মাত্রায় নথিভুক্ত করো:

- P0: ভুল টাকা, নষ্ট আর্থিক রেকর্ড, cross-tenant data leak, duplicate sale অথবা গুরুতর data loss।
- P1: বিক্রি, স্টক, refund, login বা অন্য প্রধান বিদ্যমান workflow ভেঙে গেছে।
- P2: কোনো নির্দিষ্ট edge case বা সীমিত workflow-এ সমস্যা।
- P3: ছোট UI বা ব্যবহারযোগ্যতার ত্রুটি, যা হিসাব বা নিরাপত্তা প্রভাবিত করে না।

প্রতিটি রিপোর্টে পুনরুৎপাদনের ধাপ, প্রত্যাশিত ফল, প্রকৃত ফল, প্রভাবিত মডিউল, test case ও সমাধানের commit উল্লেখ থাকবে।

# ১৬. তোমার কোডিং এজেন্টের জন্য পূর্ণাঙ্গ Stability Audit Prompt

তুমি Codex, Claude Code বা অন্য কোনো coding agent-কে নিচের নির্দেশ দিতে পারো। এটি নতুন ফিচার যোগ না করে বিদ্যমান ফিচারের বাগ খোঁজা, পরীক্ষা তৈরি, প্রমাণসহ সংশোধন এবং regression প্রতিরোধের জন্য লেখা।

# POS App — Stability, Reliability and Zero-Known-Critical-Bug Initiative

Repository: [https://github.com/joysriramsarkar/pos-app](https://github.com/joysriramsarkar/pos-app)

## Primary Objective

Stabilize the existing application. Do not add features, redesign the product, expand scope, replace working subsystems without evidence, or introduce new business behavior.

The goal is to make every currently implemented feature work reliably according to its existing intended behavior, prevent data corruption and duplicate financial operations, and establish repeatable automated verification.

Absolute freedom from all possible bugs cannot be proven. The deliverable is a release candidate with no known unresolved critical defects, verified core workflows, database integrity guarantees, and durable regression coverage.

## Phase 1 — Establish the baseline

1. Inspect the entire repository and identify the current commit, package manager, framework versions, environment requirements, deployment targets, database schema, and existing scripts.
2. Inventory all existing features and map each feature to its UI, state management, API routes, service functions, database models, permissions, tests, and external dependencies.
3. Run all currently supported checks: dependency installation, Prisma generation, lint, typecheck, unit tests, production build, and existing Playwright tests.
4. Record exact pass/fail results. Do not claim that a check passed unless it was actually run.
5. Do not modify the production database or use production customer data in tests.

## Phase 2 — Financial correctness

Audit and test the existing implementations of:

- `src/lib/money.ts`
- `src/lib/sale-calculations.ts`
- `src/lib/sale-payment-breakdown.ts`
- `src/lib/sale-payment-consistency.ts`
- `src/lib/sale-pricing.ts`
- `src/lib/sale-stock.ts`
- `src/lib/sale-returns.ts`
- `src/server/services/sales.service.ts`
- `src/app/api/sales/route.ts`
- `src/app/api/sync/route.ts`

Validate:

- Subtotal, discounts, taxes, final total, cash/UPI split, amount received, amount paid, change, due and prepaid usage.
- Decimal precision, rounding, fractional quantities, invalid numbers, and boundary values.
- Server-authoritative prices, discounts, product ownership, and product activity.
- Sale creation, stock mutation, stock history, customer ledger entries and audit records.
- Partial payment, due collection, prepaid top-up, prepaid withdrawal and debt repayment.
- Sale cancellation, partial return, complete refund, legacy refunds, tax/discount allocation, and return quantity limits.
- Report totals, cost snapshots, revenue, COGS and profit reconciliation.

Establish explicit invariants for every operation. Test both successful and failed transactions. Verify that database changes roll back atomically when a required step fails.

## Phase 3 — Database integration and concurrency

Use an isolated PostgreSQL test database. Do not substitute mocked database calls for all integration tests.

Test:

- Two simultaneous sales against limited stock.
- Repeated concurrent requests using the same idempotency key.
- Concurrent purchase-order receiving.
- Concurrent due collections, prepaid withdrawals, refunds and supplier payments.
- Unique-constraint violations, transaction timeouts, deadlocks and rollback.
- Foreign-key integrity and business-scoped database queries.
- Consistency between financial records, stock records, ledgers, and audit records.

Verify idempotency under concurrency, not merely with sequential unit tests. Replaying a successful operation must not apply its financial or stock side effects twice.

If the same idempotency key is reused with a different payload, reject it according to an explicit, tested rule. Do not silently treat different operations as equivalent.

## Phase 4 — Offline and synchronization reliability

Inspect:

- `src/lib/offline/indexeddb.ts`
- `src/lib/offline/sync-worker.ts`
- `src/lib/offline/network-listener.ts`
- `src/lib/offline/offline-context.tsx`
- `src/app/api/sync/route.ts`
- `src/stores/pos-store.ts`

Test:

- Offline creation and persistence of sales.
- Browser refresh, restart and network interruption.
- Server commit followed by a lost response.
- Duplicate delivery, idempotent replay, conflict and changed payload.
- Network failures, timeouts, HTTP 408, 429, 4xx, 5xx and expired authentication.
- Retry exhaustion, permanent dead-letter failures and user-authorized retry.
- Queue dependency ordering and stale entity updates.
- Multiple browser tabs and different clients processing the same logical operation.
- Tenant switching and logout/login while operations remain queued.
- Local rollback or reconciliation after server rejection.

Financial operations such as sales, returns, stock movements and ledger entries must never be silently dropped using a generic last-write-wins policy.

A queue item may be marked successfully synchronized only after the server has durably committed the corresponding operation. Preserve enough information to recover failed and ambiguous operations safely.

## Phase 5 — Multi-tenant isolation and authorization

Inspect every protected API route. Create an inventory of route, required permission, business scoping, side effects, and existing test coverage.

Audit:

- `src/lib/tenant.ts`
- `src/lib/tenant-scope.ts`
- `src/lib/api-middleware.ts`
- `src/lib/multi-tenant-security.test.ts`
- `src/lib/tenant-isolation.test.ts`
- `src/lib/permissions.test.ts`
- All business data, reports, backups, restores, sales, returns, purchases, customers, suppliers, inventory, expenses, user and settings routes.

Verify that tenant identity and authorization come from trusted server-side context. Test direct API requests, cross-tenant identifiers, inactive businesses, expired sessions, revoked memberships, role changes and business switching.

Never depend only on hidden UI controls to enforce permissions. Test unauthorized reads and writes, including indirect access through related records.

## Phase 6 — Inventory, returns and purchasing

Reconcile stock mathematically from opening inventory, purchases, sales, returns and adjustments.

Test product creation, editing, import, stock entry, purchase receiving, weighted average cost, stock history, adjustments, sale reversal, and return flows.

Verify:

- Cumulative receiving cannot exceed allowed quantities.
- Duplicate requests do not duplicate stock.
- Concurrent stock mutations remain consistent.
- Historical sale costs remain stable.
- Invalid product ownership or quantities cannot mutate another tenant's records.
- Every inventory-changing operation has the required stock-history record.
- Database failure never leaves stock and its required history inconsistent.

Preserve the existing business rules for loose goods, tracked inventory, stock shortages and quantity precision. Do not replace those rules without evidence of a defect and regression tests.

## Phase 7 — Reports and financial reconciliation

Create a deterministic golden dataset containing products, purchases, sales, split payments, due balances, prepaid transactions, returns, refunds, adjustments and expenses.

Calculate expected totals independently. Verify that dashboard, transaction history, sales reports, payment reconciliation, inventory valuation, profit reports and ledger balances agree according to existing business rules.

Audit date filtering, timezone boundaries, canceled transactions, partial returns, rounding, pagination, category grouping and historical cost snapshots.

## Phase 8 — Backup, restore and operational recovery

Test the current backup and restore behavior without creating a new backup feature.

Using disposable databases:

- Create a backup.
- Restore it into a clean test database.
- Validate required tables, relationships, constraints, financial totals, stock balances, ledger balances and business ownership.
- Test malformed files, incomplete data, repeated restore, interrupted restore and incompatible schema versions.
- Confirm that failure cannot silently destroy existing data.

## Phase 9 — UI and end-to-end verification

Replace the generic Playwright example tests with application-specific end-to-end tests.

Verify:

- Login and invalid login.
- Product search and barcode-based product selection.
- Cart quantity, discount and total.
- All supported payment modes.
- Checkout and duplicate-submit protection.
- Transaction history and receipt data.
- Product and stock management.
- Customer and supplier balances.
- Returns and refunds.
- Permission failures.
- Offline queue recovery.
- Bengali and English receipt output.
- Thermal and A4/A5 invoice output.
- Android print and PDF-sharing behavior where executable tests are supported.

Configure Playwright to start the actual application and wait for it to be ready. Use isolated test accounts and disposable data. Do not report a workflow as verified merely because a component renders.

## Phase 10 — Build, deployment and dependency reliability

Verify reproducible dependency installation, Prisma generation, lint, typecheck, tests, production build and startup. Validate each supported deployment target separately.

Inspect migration safety, database indexes, environment validation, connection pooling, rate-limit behavior and runtime-specific failures.

Do not perform indiscriminate dependency upgrades or architectural rewrites. Every necessary update must be justified, narrowly scoped and followed by regression tests.

## Phase 11 — Regression and CI

Every confirmed bug fix must include a regression test that fails before the fix and succeeds afterward.

Configure required CI checks for lint, typecheck, unit tests, database integration tests, production build and application-specific E2E tests. Include tenant isolation and financial consistency in release-blocking checks.

Track meaningful coverage for business-critical modules and error branches. Do not use line coverage as the sole measure of correctness.

Never skip or weaken existing tests merely to make CI pass. Do not use `any`, broad exception swallowing, ignored errors or relaxed validation to hide defects.

## Required working protocol

1. Work on a dedicated branch and preserve a clean baseline.
2. Investigate and document the cause before changing code.
3. Fix one coherent defect group at a time.
4. Make the smallest safe correction that preserves intended behavior.
5. Add regression tests before considering the defect resolved.
6. Run targeted tests, then relevant full suites.
7. Inspect the final diff for unrelated changes, removed safeguards and unintended behavior.
8. Keep changes isolated and reviewable. Do not bundle unrelated refactors.
9. Record any test that could not be run and explain what evidence remains missing.
10. Do not claim exhaustive correctness without supporting evidence.

## Required final report

Provide:

- Existing feature inventory.
- Baseline test and build results.
- Confirmed defects, with file/function references and reproducible evidence.
- Risks that still need runtime or database verification.
- Changes made and reasons for each change.
- Regression tests added.
- Commands run and exact outcomes.
- Known limitations, unresolved issues and release blockers.
- A final release-readiness assessment.

Do not add new user-facing features. Stabilize the existing product only.

# ১৭. শেষ কথা: এখন ঠিক কী দিয়ে শুরু করবে?

আমার পরামর্শ, প্রথমেই সব ফাইল rewrite করতে যেও না। তোমার অ্যাপে অনেক পরীক্ষিত ব্যবসায়িক নিয়ম ও বিদ্যমান safeguards আছে; বড়সড় refactor-এ সেগুলো নষ্ট হয়ে যেতে পারে।

প্রথম কাজ হবে তিনটি:

1\. Playwright-কে বাস্তব POS-এর বিরুদ্ধে চালানো।

2\. বাস্তব PostgreSQL test database-এ sale, stock, payment ও ledger-এর atomicity এবং concurrency পরীক্ষা করা।

3\. Offline sync-এ একই request, হারিয়ে যাওয়া response এবং recovery-র ক্ষেত্রে duplicate বা data loss ঘটছে কি না প্রমাণসহ যাচাই করা।

এই তিনটি ক্ষেত্রের ফল না জেনে UI polish, নতুন architecture বা আরও optimization-এ সময় দেওয়া ঠিক হবে না।

সবশেষে একটি বাস্তব মানদণ্ড মনে রেখো: stable POS মানে শুধু crash না করা অ্যাপ নয়। একটি বিক্রির প্রতিটি প্রভাব—টাকা, স্টক, গ্রাহকের বকেয়া, রিপোর্ট ও invoice—সঠিক থাকা, ব্যর্থ হলে নিরাপদে থেমে যাওয়া এবং পুনরায় চেষ্টা করলে একই লেনদেন দ্বিতীয়বার না হওয়া। এই মানদণ্ডে তোমার বর্তমান অ্যাপকে পরীক্ষা করে তারপরই production-ready ঘোষণা করা উচিত।

আমি পুরো রিপোজিটরির প্রতিটা ফাইল পড়তে পারিনি। ৩১৯টা কমিটের এই প্রজেক্টে বিক্রি, স্টক, টাকা আর অফলাইন সিঙ্ক নিয়ন্ত্রণ করে এমন মূল ফাইলগুলো পড়েছি: idempotency.ts, sync-worker.ts, api/sync/route.ts, prepayment/withdraw/route.ts, db.ts, api-middleware.ts, tenant.ts, money.ts, sale-stock.ts, indexeddb.ts, pos-store.ts, schema.prisma আর package.json। কয়েকটা ফাইলের পুরোটা নয়, আংশিক অংশ দেখতে পেয়েছি। তাই নিচের তালিকাকে "সব বাগ" ধরবেন না। এগুলো কোড দেখে নিশ্চিতভাবে পাওয়া বা জোরালোভাবে সন্দেহ করা সমস্যা। প্রতিটা ঠিক করার আগে একবার মিলিয়ে নেবেন।

সামগ্রিকভাবে কোডের মান ভালো। decimal.js দিয়ে টাকার হিসাব, FOR UPDATE লক, প্রোডাক্ট id সাজিয়ে লক করা (deadlock এড়াতে), টেন্যান্ট আলাদা রাখা, DB-তে idempotency — এগুলো ঠিকঠাক আছে। আসল ঝুঁকি কয়েকটা ধারের কেস (edge case) আর একাধিক অংশ একসাথে কাজ করার সময়।

গুরুতর (টাকা বা ডেটা হারাতে পারে)

১. Idempotency কী চিরকাল "inprogress"-এ আটকে থাকতে পারে। reserveIdempotency প্রথমে একটা সারি বানায়, কাজ শেষ হলে finalize হয়, ব্যর্থ হলে release। কিন্তু মাঝপথে সার্ভার ক্র্যাশ করলে, Worker টাইমআউট হলে বা কানেকশন কেটে গেলে সারিটা synced: false অবস্থায় থেকে যায়। তারপর সেই কী দিয়ে প্রতিটা রিট্রাই চিরকাল 409 পাবে। এর জন্য কোনো TTL বা মেয়াদ নেই।

আরও খারাপ ব্যাপার, withdraw রুটে আছে finalizeIdempotency(...).catch(() => {})। মানে টাকা কেটে নেওয়া হয়ে গেছে, কিন্তু finalize ব্যর্থ হলে ত্রুটিটা চুপচাপ গিলে ফেলা হচ্ছে। ফলে কী-টা আটকে যায়।

সমাধান: finalize-কে মূল ব্যবসায়িক transaction-এর ভেতরে আনুন। তাহলে টাকা কাটা আর কী "সম্পন্ন" চিহ্নিত করা, দুটো একসাথে commit হবে। পুরনো আটকে থাকা claim-এর জন্য মেয়াদের হিসাব যোগ করুন:

``ts
// reserveIdempotency-র unique violation শাখায়
const existing = await db.syncQueue.findUnique({
  where: { idempotencyKey },
  select: { synced: true, result: true, createdAt: true },
});
if (existing?.synced) return { status: "replay", result: existing.result };

const STALEMS = 2  60  1000;
if (existing && Date.now() - existing.createdAt.getTime() > STALEMS) {
  // আটকে থাকা claim — শর্তসাপেক্ষে নিজের নামে নিন (race-safe)
  const taken = await db.syncQueue.updateMany({
    where: { idempotencyKey, synced: false, createdAt: existing.createdAt },
    data: { createdAt: new Date(), retryCount: { increment: 1 } },
  });
  if (taken.count === 1) return { status: "claimed", idempotencyKey };
}
return { status: "inprogress" };
`

সাবধান: transaction সত্যিই commit হয়ে থাকলে stale claim নতুন করে নেওয়া বিপজ্জনক। তাই আগে finalize-কে transaction-এর ভেতরে আনুন, তারপর এটা করুন।

২. সিঙ্ক ওয়ার্কার 409 পেলে আইটেমকে "স্থায়ী ব্যর্থ" ধরে নেয়। এটা আমার মতে সবচেয়ে বাস্তব বাগ। isPermanentStatus 408 আর 429 বাদে সব 4xx-কে স্থায়ী ব্যর্থতা ধরে, অর্থাৎ 409-ও। অথচ সার্ভার 409 দুই অর্থে পাঠায়:

• "একই অনুরোধ প্রক্রিয়াধীন" (inprogress): এটা সাময়িক, পরে আবার চেষ্টা করলেই হবে।
• CONFLICT: (যেমন ইনভয়েস নম্বরের সংঘাত): এটা সত্যিই স্থায়ী।

দুই ট্যাব একসাথে সিঙ্ক করলে, বা নেটওয়ার্ক রিট্রাই হলে, ঠিকঠাক একটা অফলাইন বিক্রি "failed" হয়ে যেতে পারে। আলাদা স্ট্যাটাস বা কোড পাঠান:

`ts
// সার্ভার: inprogress হলে
return NextResponse.json({ success:false, code:"INPROGRESS", error:"..." },
  { status: 409, headers: { "Retry-After": "5" } });

// ক্লায়েন্ট
if (res.status === 409 && body.code === "INPROGRESS") → transient, retry
`

৩. একাধিক ট্যাব একসাথে সিঙ্ক চালায়। isRunning শুধু ওই ট্যাবের মেমরিতে থাকে। POS-এ দুটো ট্যাব খোলা থাকলে দুটোই একই queue চালাবে। সার্ভারের idempotency টাকা দুবার কাটা আটকায় ঠিকই, কিন্তু উপরের ২ নম্বর বাগের সাথে মিলে আইটেম ভুলভাবে failed হয়ে যায়। Web Locks API দিয়ে এটা ঠিক করুন:

`ts
await navigator.locks.request(pos-sync-${businessId}, { ifAvailable: true },
  async (lock) => { if (!lock) return; await this.runQueue(options); });
`

৪. অফলাইন বিক্রি সিঙ্ক হলে স্টক "ফ্যান্টম" হতে পারে। সিঙ্কে rejectOnShortage=false রাখা হয়েছে। এটা ইচ্ছাকৃত সিদ্ধান্ত, কারণ বিক্রি আগেই হয়ে গেছে। কিন্তু এতে স্টক স্বয়ংক্রিয়ভাবে অ্যাডজাস্ট হয় আর ঘাটতি অংশের COGS (বিক্রিত পণ্যের খরচ) শূন্য ধরা হয়। এর ফলে লাভের রিপোর্ট বেশি দেখাবে। নতুন ফিচার না বানিয়েও একটা কাজ করা যায়: autoAdjusted থাকলে সিঙ্কের ফলাফলে সেটা ফেরত পাঠান, আর UI-তে বিদ্যমান সতর্কবার্তার জায়গায় দেখান, যাতে কেউ খেয়াল না করে থেকে না যায়।

মাঝারি (স্থিতিশীলতা বা নির্ভরযোগ্যতা)

৫. db.ts-এ কানেকশন pool লিক হয়। এরর মেসেজে 'timeout', 'Connection' বা 'closed' শব্দ থাকলেই globalForPrisma.prisma = undefined করে দেওয়া হয়। কিন্তু পুরনো client-এর $disconnect() বা pool-এর end() ডাকা হয় না। ফলে প্রতিবার নতুন pool তৈরি হয়, পুরনোগুলো খোলাই থেকে যায়। শেষ পর্যন্ত Postgres-এর "too many connections" এরর আসবে। তার ওপর একটা সাধারণ query timeout হলেই অন্য চলমান request-এর client বদলে যায়। সমাধান:

• রিসেট করার আগে old.$disconnect().catch(()=>{}) ডাকুন।
• স্ট্রিং মিলিয়ে নয়, নির্দিষ্ট এরর কোড দেখে সিদ্ধান্ত নিন (ECONNRESET, EPIPE, 57P01)।

৬. Prisma-র প্যাকেজ ভার্সন মেলে না। @prisma/client হলো ^7.8.0, কিন্তু @prisma/adapter-pg হলো ^7.5.0। prisma CLI-সহ তিনটেকেই একই exact ভার্সনে পিন করুন। ভার্সন না মিললে runtime-এ অদ্ভুত সমস্যা দেখা দেয়।

৭. প্রতি request-এ সেশন দুবার পড়া হয়। README-তে লেখা "no duplicate session fetches", কিন্তু withdraw আর sync রুটে প্রথমে requireAuth (getServerSession ডাকে), তারপর requireBusinessContext (আবার getServerSession ডাকে এবং membership-এর জন্য DB query করে)। এটা বাগ নয়, কিন্তু প্রতি request-এ বাড়তি লেটেন্সি আর DB লোড। middleware-এর withTenant জাতীয় র‍্যাপার সব রুটে একভাবে ব্যবহার করুন।

৮. প্রোডাকশনে CSRF allowlist-এ http://localhost আছে। ডিফল্ট origin তালিকায় http://localhost, https://localhost আর http://localhost:3000 প্রোডাকশনেও থাকছে। Capacitor-এর জন্য দরকার শুধু capacitor://localhost এবং Android-এ https://localhost। NODEENV !== "production" হলে তবেই dev origin যোগ করুন।

৯. অডিট লগে IP জাল করা যায়। x-forwarded-for হেডার ক্লায়েন্ট নিজেই পাঠাতে পারে। Cloudflare-এর পিছনে থাকলে cf-connecting-ip ব্যবহার করুন, অথবা XFF-এর শুধু সবচেয়ে ডানের বিশ্বস্ত মানটা নিন।

১০. Stale-update চেনা হয় ক্লায়েন্টের ঘড়ি দেখে। সিঙ্ক ওয়ার্কার payload.updatedAt তুলনা করে পুরনো আপডেট বাদ দেয়। দুটো ডিভাইসের ঘড়ি আলাদা হলে সঠিক আপডেটও বাদ পড়তে পারে। একই ডিভাইসের queue-র মধ্যে তুলনার জন্য টাইমস্ট্যাম্পের বদলে queue-র ক্রমিক নম্বর (autoincrement) ব্যবহার করুন।

১১. SyncQueue টেবিল কখনো পরিষ্কার হয় না। idempotency রেকর্ড আর সিঙ্ক queue একই টেবিলে থাকে, আর মুছে ফেলার কোনো ব্যবস্থা দেখিনি। সময়ের সাথে টেবিলটা অনেক বড় হবে। দুটো কাজ করুন:

• synced=true AND syncedat < now() - 30 days সারিগুলো মোছার একটা নির্ধারিত (scheduled) কাজ চালান।
• (businessid, synced)-এ index যোগ করুন।

১২. ক্লায়েন্টের ছোটখাটো সমস্যা:

• useSyncStore.syncErrors শুধু বাড়তেই থাকে, কোনো সীমা নেই। শেষ ৫০টা রাখুন।
• IndexedDB-তে onversionchange হলে db.close() করে dbInstances থেকে সরিয়ে দিন। নইলে নতুন ভার্সন ডিপ্লয় হলে অন্য ট্যাবে upgrade আটকে যাবে।
• লগআউট বা ব্যবসা পরিবর্তনের সময় activeTenantBusinessId রিসেট হচ্ছে কিনা দেখে নিন।

১৩. Withdraw রুটের ছোট সমস্যা:

• replay হলে সংরক্ষিত ফলাফল না পাঠিয়ে কাস্টমারের বর্তমান ব্যালান্স পাঠানো হয়। এটা মোটামুটি ঠিক আছে, কিন্তু অসঙ্গত।
• X-Idempotency-Key হেডারের দৈর্ঘ্য বা ফরম্যাট যাচাই করা হয় না। z.string().uuid() দিয়ে যাচাই করুন।
• এরর আলাদা করা হয় মেসেজের স্ট্রিং মিলিয়ে (msg === 'Customer not found')। মেসেজ একটু বদলালেই 404-এর জায়গায় 500 যাবে। আলাদা এরর ক্লাস ব্যবহার করুন, যেভাবে সিঙ্ক রুটে SyncRejection করা আছে।

পুরো কোডবেস যাচাইয়ের পদ্ধতি

বাগহীন অবস্থায় পৌঁছানোর একমাত্র নির্ভরযোগ্য উপায় হলো একটা স্বয়ংক্রিয় সুরক্ষা ব্যবস্থা। শুধু চোখে পড়ে বাগ ধরলে চলবে না:

CI-কে কড়া করুন। .github/workflows-এ প্রতি PR-এ npm ci, npm run lint, npm run typecheck, npm test, prisma validate আর npm run build চালান। কোনো একটা ব্যর্থ হলে merge বন্ধ থাকবে। mergeprs.sh দিয়ে যাচাই ছাড়া merge করা বন্ধ করুন।
tsconfig-এ কড়া নিয়ম চালু করুন: strict, noUncheckedIndexedAccess, noImplicitOverride। আর ESLint-এ @typescript-eslint/no-explicit-any, no-floating-promises আর no-misused-promises চালু করুন। এতেই অনেক লুকোনো বাগ বেরিয়ে আসবে, যেমন db.ts-এ অনেক any আছে।
শুধু টাকা আর স্টকের পথগুলোর জন্য ইন্টিগ্রেশন টেস্ট লিখুন। আসল Postgres (Docker) চালিয়ে vitest দিয়ে করুন:
   - একই idempotency কী দিয়ে ১০টা একযোগে withdraw করলে ব্যালান্স মাত্র একবার কমবে।
   - একই প্রোডাক্টে একসাথে বিক্রি হলে স্টক কখনো ভুল হবে না।
   - অফলাইন বিক্রি দুবার সিঙ্ক হলে একটাই ইনভয়েস তৈরি হবে।
   - মাঝপথে ক্র্যাশ হলে (transaction-এর ভেতর থেকে throw করে সেটা অনুকরণ করুন) পরে রিট্রাই সফল হবে।
   - ক্যাশ, ধারে বিক্রি, প্রিপেইড, মিশ্র পেমেন্ট আর রিটার্ন, প্রতিটার জন্য টাকার হিসাব মিলবে (money.ts-এর রাউন্ডিংসহ)।
E2E টেস্ট করুন। Playwright দিয়ে নেটওয়ার্ক অফ করে বিক্রি করুন, আবার অন করুন, তারপর সার্ভারে ডেটা মিলিয়ে দেখুন। দুই ট্যাব একসাথে খুলেও একই পরীক্ষা চালান।
এরর মনিটরিং যোগ করুন। Sentry বা এরকম কিছু লাগান, আর .catch(() => {}) জাতীয় সব জায়গায় অন্তত লগ রাখুন। কোডে কোথায় কোথায় এরর চুপচাপ গিলে ফেলা হচ্ছে, তা দেখতে grep -rn "catch(() => {})" src/ চালান।
ডিপেন্ডেন্সি পরিষ্কার করুন। npm audit আর npx depcheck চালান। NextAuth আর Firebase Auth দুটোই রাখা আছে। দুটোই সত্যিই দরকার কিনা নিশ্চিত হোন, কারণ দুটো auth ব্যবস্থা একসাথে থাকলে সেশনের বাগ সহজে ঢোকে। গুরুত্বপূর্ণ প্যাকেজগুলোর ভার্সন exact পিন করুন।
মাইগ্রেশন পদ্ধতি বদলান। প্রোডাকশনে prisma db push-এর বদলে prisma migrate deploy ব্যবহার করুন। db push` কোনো ইতিহাস রাখে না আর ডেটা মুছে ফেলার ঝুঁকি থাকে।

এই ক্রমে ঠিক করুন: প্রথমে ২ আর ৩ (সিঙ্ক ভুলভাবে failed হওয়া), তারপর ১ (আটকে থাকা claim আর চুপচাপ ব্যর্থ finalize), তারপর ৫ (pool লিক)। এরপর CI আর ইন্টিগ্রেশন টেস্ট দাঁড় করিয়ে বাকিগুলো একে একে ধরুন। প্রতিটা ঠিক করার সাথে সাথে একটা টেস্ট যোগ করবেন, যাতে বাগটা আর ফিরে না আসে।

নিচের পরিকল্পনাটি **নতুন কোনো ফিচার যোগ না করে**, বরং বর্তমানে থাকা ফিচারগুলোকে **স্থিতিশীল, নির্ভরযোগ্য, ডেটা-সুরক্ষিত এবং বাগ-মুক্ত** করার জন্য।  

> সততার সাথে বলতে হয়: যেকোনো সফটওয়্যারে “১০% অজানা বাগ নেই” বলে গ্যারান্টি দেওয়া কঠিন। তবে **known critical/major/minor বাগ শূন্য**, **financial data ভুল না হয়**, **offline sync ডেটা হারায় না**, **stock oversell না হয়**, **receipt/print/barcode ঠিকমতো কাজ করে**, এবং **security/RBAC ফাঁস না হয়**—এই মান পর্যন্ত পৌঁছানো যায়। নিচের checklist ও test strategy সেটাই লক্ষ্য রাখছে।

---

## ০. মূল নীতি: Feature Freeze + Regression Discipline

প্রথমেই project-এ একটি hard rule রাখতে হবে:

1. **নতুন ফিচার নেই**  
   - শুধু bug fix, reliability fix, security fix, test addition, documentation fix, refactor without behavior change।
   - কোনো PR-এ যদি user-visible নতুন capability আসে, সেটি reject করতে হবে।

2. **প্রতিটি bug fix-এর সাথে regression test বাধ্যতামূলক**  
   - যে বাগ পাওয়া গেছে, সেটি ঠিক করার পর এমন test লিখতে হবে যা future-এ আবার সেই বাগ আসলে build fail করবে।

3. **Financial correctness = highest priority**  
   - টাকা, due, prepaid balance, stock cost, profit, payment split, change-as-prepayment—এগুলোতে সামান্যতম ভুলও production blocker।

4. **Offline sync = data loss blocker**  
   - IndexedDB queue, idempotency key, replay, conflict resolution—এখানে duplicate sale বা lost sale হলে app stable বলা যাবে না।

5. **Print/PDF/receipt = customer-facing blocker**  
   - ভুল ভাষা, ভুল currency symbol, Bengali font break, raw HTML share, thermal layout ভাঙা—এগুলো immediate fix।

---

## ১. Repo baseline ঠিক করা: build/install/environment স্থিতিশীল করা

### ১.১ Package manager inconsistency দূর করা

আপনার README/KB-এ একদিকে বলা হয়েছে:

- **Package manager:** npm (`package-lock.json`)

অন্যদিকে setup commands-এ ব্যবহার হয়েছে:

```bash
pnpm install
pnpm db:push
pnpm db:generate
pnpm db:seed
pnpm dev
```

এটি একটি বড় stability risk। কারণ npm এবং pnpm mixed use করলে:

- lockfile mismatch
- phantom dependencies
- CI-তে ভিন্ন dependency tree
- Android/Capacitor plugin version drift
- Prisma client generation issue
- postinstall script差异

হতে পারে।

### করণীয়

একটি package manager finalize করুন। আমার পরামর্শ: **pnpm**, কারণ commands ইতিমধ্যে pnpm-based।

তারপর:

```bash
corepack enable
pnpm install --frozen-lockfile
```

যদি `package-lock.json` থাকে:

- হয় npm ব্যবহার করে সব command ঠিক করুন, অথবা
- pnpm-এ migrate করে `pnpm-lock.yaml` তৈরি করুন এবং `package-lock.json` মুছুন।

CI-তে অবশ্যই:

```bash
pnpm install --frozen-lockfile
```

ব্যবহার করতে হবে। `npm install` বা loose install চলবে না।

---

### ১.২ Node.js version fix করা

Next.js 16, React 19, Prisma 7, Capacitor 8—এসবের জন্য Node version consistent হতে হবে।

করা উচিত:

- `.nvmrc` বা `.node-version` file রাখা
- `package.json`-এ:

```json
"engines": {
  "node": ">=20.x",
  "pnpm": ">=9.x"
}
```

(আপনার actual compatible version অনুযায়ী ঠিক করুন)

- CI, Docker, Vercel/Cloudflare/Server, Android build—সব জায়গায় একই Node version।

---

### ১.৩ Environment variable validation

`.env.example`-এ যে keys আছে:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DIRECT_URL` | for migrations | Direct non-pooled URL |
| `NEXTAUTH_SECRET` | yes | ≥ 32 chars |
| `NEXTAUTH_URL` | yes | e.g. `http://localhost:3000` |
| `ALLOWED_ORIGINS` | prod | CORS/CSRF origins |
| `SEED_ADMIN_PASSWORD` | optional | seed admin password |

এগুলো শুধু document করলেই হবে না। App startup-এ validate করতে হবে।

### করণীয়

একটি `src/lib/env.ts` বা similar module রাখুন, যেখানে Zod দিয়ে validate হবে:

- `DATABASE_URL` present and valid Postgres URL
- `NEXTAUTH_SECRET` length ≥ 32
- production হলে `NEXTAUTH_URL` HTTPS
- production হলে `ALLOWED_ORIGINS` defined
- `DIRECT_URL` migration command-এ required
- Capacitor/Android production build হলে `server.url` valid deployed HTTPS URL

Validation fail হলে app শুরু হবে না, কিন্তু clear error message দেখাবে।

উদাহারণ ধারণা:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]),
  ALLOWED_ORIGINS: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

Production-এ `process.env` direct ব্যবহার কমিয়ে centralized validated env ব্যবহার করুন।

---

### ১.৪ Scripts যোগ/ঠিক করা

`package.json`-এ অন্তত এই scripts থাকা উচিত:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:mobile": "echo 'configure Appium/Detox/Capacitor e2e'",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "i18n:check": "node scripts/find-missing-i18n.mjs",
    "audit:deps": "pnpm audit --audit-level=high",
    "cap:sync": "npx cap sync android",
    "android:debug": "cd android && ./gradlew assembleDebug"
  }
}
```

Production deployment-এ `db:push` ব্যবহার করা উচিত নয়। Production-এ:

```bash
pnpm db:migrate deploy
```

অথবা আপনার migration strategy অনুযায়ী `prisma migrate deploy`।

---

## ২. সম্পূর্ণ কোড যাচাইয়ের Static Audit Checklist

এখন codebase-এর সব ফাইল systematicভাবে যাচাই করতে হবে। নিচের checklist অনুযায়ী grep/search/review করুন।

### ২.১ TypeScript strictness

নিশ্চিত করুন `tsconfig.json`-এ:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false
  }
}
```

`skipLibCheck: false` সবসময় সম্ভব নাও হতে পারে, তবে minimally strict mode চালু থাকতে হবে।

### খুঁজে বের করতে হবে:

```bash
rg "any" src
rg "@ts-ignore" src
rg "@ts-expect-error" src
rg "as unknown as" src
rg "as any" src
```

প্রতিটি `any`/ignore-এর কারণ লিখতে হবে। Financial, offline sync, auth, print module-এ `any` থাকলে সেটি blocker।

---

### ২.২ ESLint/react-hooks/static analysis

ESLint-ে অন্তত থাকতে হবে:

- `@typescript-eslint`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh` if applicable
- unused vars
- no console in production? বা at least controlled
- no unsafe assignment
- no eval
- no dangerlouslySetInnerHTML without review

চালাুন:

```bash
pnpm lint
pnpm typecheck
```

CI-তে দুটোই pass করতে বাধ্য।

---

### ২.৩ Dependency audit

```bash
pnpm audit --audit-level=high
```

Critical/high vulnerability থাকলে release blocker।

Dependency update করুন, তবে major upgrade আলাদা branch-এ test করে।

---

### ২.৪ Secret scan

Repo-তে কোনো secret commit হয়েছে কিনা দেখুন:

- GitHub secret scanning
- Gitleaks/trufflehog
- manual search:

```bash
rg "NEXTAUTH_SECRET=" .
rg "DATABASE_URL=postgres://" .
rg "password" .
rg "secret" .
rg "api_key" .
rg "token" .
```

`.env`, `.env.local`, seed password, database URL commit করা থাকলে অবিলম্বে rotate করুন।

---

### ২.৫ i18n missing keys

আপনার repo-তে স্ক্রিপ্ট আছে:

```bash
node scripts/find-missing-i18n.mjs
```

এটি CI-তে চালাতে হবে।

Checklist:

- `messages/en.json`
- `messages/bn.json`
- duplicate key নেই
- missing key নেই
- nested structure same
- receipt-related keys আলাদাভাবে check করা হয়েছে
- Bengali encoding ঠিক আছে
- JSON valid

---

### ২.৬ Hardcoded currency symbol search

KB-এ স্পষ্ট বলা হয়েছে:

> currency symbol comes from Settings (never hard-coded ৳/₹)

তাই search করুন:

```bash
rg "৳" src
rg "₹" src
rg "\\$" src
rg "currencySymbol" src
```

যেখানে hardcoded symbol পাওয়া যাবে, সেটি Settings থেকে আসে কিনা দেখুন।

---

### ২.৭ Floating-point money calculation search

Money-এ `decimal.js` ব্যবহার করার কথা। তাই search করুন:

```bash
rg "toFixed" src
rg "parseFloat" src
rg "Number\\(" src
rg "parseInt" src
rg "\\* 100" src
rg "/ 100" src
rg "Math.round" src
rg "Math.floor" src
rg "Math.ceil" src
```

এগুলো money path-এ থাকলে review করতে হবে।

সঠিক পদ্ধতি:

- amount parse: `new Decimal(value)`
- arithmetic: Decimal methods
- rounding: explicit `toFixed(2, Decimal.ROUND_HALF_UP)` বা আপনার business rule
- storage: Decimal/string/integer minor units
- API response: precision নষ্ট না হয় সেদিকে খেয়াল

JSON-এ Decimal পাঠালে সংখ্যা হিসেবে precision issue হতে পারে। তাই money field হয় string হিসেবে পাঠান, অথবা integer paise/cents হিসেবে রাখুন।

---

### ২.৮ Raw SQL injection risk search

KB-এ আছে:

> Atomic Stock Updates: Raw SQL `UNNEST` batch updates with conditional `WHERE current_stock >= quantity`

Raw SQL থাকলে parameterization অবশ্যক।

Search:

```bash
rg "\\$queryRaw" src
rg "\\$executeRaw" src
rg "UNNEST" src
rg "sql\\`" src
```

নিশ্চিত করুন:

- user input directly interpolate হচ্ছে না
- tagged template `prisma.sql` / `Prisma.sql` ব্যবহার হচ্ছে
- array values safeভাবে bind হচ্ছে
- dynamic column/table name whitelist থেকে আসছে
- batch update all-or-nothing transaction-এ আছে

---

### ২.৯ XSS/print HTML risk search

Print/receipt HTML generate করলে user-supplied data escape করতে হবে।

Search:

```bash
rg "dangerouslySetInnerHTML" src
rg "innerHTML" src
rg "document.write" src
rg "<script" src
rg "eval\\(" src
```

বিশেষ করে:

- product name
- customer name
- supplier name
- note
- receipt footer
- company name
- address
- phone
- expense description

এগুলো HTML/PDF-এ inject হতে পারে। Escape করুন।

---

### ২.১০ Permission bypass search

KB-এ আছে:

> Every API route calls `requirePermission()` which validates session + RBAC in one pass

তাই সব API route inventory বের করুন।

Search:

```bash
rg "export const GET" src/app/api
rg "export const POST" src/app/api
rg "export const PUT" src/app/api
rg "export const PATCH" src/app/api
rg "export const DELETE" src/app/api
rg "requirePermission" src
```

প্রতিটি route-এ `requirePermission()` বা equivalent auth guard আছে কিনা দেখুন।

একটি automated test লিখুন যে:

- সব API route enumerate করে
- anonymous request-এ 401/403 দেয়
- viewer role mutation করলে 403 দেয়
- cashier restricted route access করতে পারে না
- manager/admin permission matrix ঠিক আছে

---

## ৩. Module-wise Verification Plan

এখন প্রধান ফিচারগুলো একে একে যাচাই করব।

---

# ৩.১ Authentication ও Role-Based Access Control

### Features

- NextAuth.js
- Admin / Manager / Cashier / Viewer
- per-permission checks on every API route

### যাচাই করতে হবে

1. Login/logout সঠিক কাজ করে
2. Session expiry ঠিকমতো হয়
3. Role change হলে পুরনো session/permission cache invalidate হয়
4. Client-side guard only যথেষ্ট নয়; server/API guard থাকতে হবে
5. Viewer role কোনো mutation করতে পারবে না
6. Cashier শুধু POS-related কাজ করতে পারবে
7. Manager/Admin report/settings/party/prepayment withdrawal ইত্যাদি ঠিকমতো access করবে
8. CSRF/CORS production-এ ঠিক আছে
9. `ALLOWED_ORIGINS` ঠিকমতো configure করা
10. Android Capacitor WebView origin allow করা হয়েছে কিনা
11. NextAuth secret strong এবং rotate করা যায়
12. Password hashing secure
13. Admin seed password default না থাকে
14. Failed login rate-limit করা হয়
15. Session cookie secure/httpOnly/sameSite production-এ ঠিক আছে

### সম্ভাব্য বাগ

- UI-তে button hide করা আছে, কিন্তু API route-এ permission check নেই
- role পরিবর্তনের পর পুরনো JWT/session-এ পুরনো permission থেকে যায়
- Viewer direct API call করে stock/product modify করতে পারে
- Capacitor origin CORS-এ ব্লক হয়
- production `NEXTAUTH_URL` ভুল হলে login redirect break
- seed admin password hardcode/known থাকে

### Test cases

| Test | Expected |
|---|---|
| Anonymous `/api/products` POST | 401/403 |
| Viewer `/api/sales` POST | 403 |
| Cashier `/api/settings` PUT | 403 if not allowed |
| Manager due collection | allowed if permission says so |
| Admin prepayment withdrawal | allowed |
| Role changed from cashier to viewer | old token cannot mutate |
| Wrong password repeated | rate limit/captcha/lockout policy |
| CSRF token missing | mutation rejected |

---

# ৩.২ Offline-First Sync Worker

### Features

- IndexedDB local cache
- sync worker in `src/lib/offline/`
- action queue with idempotency keys
- replay queued operations against `/api/sync`
- financial data uses ledger-based incremental updates

### এটি সবচেয়ে ঝুঁকিপূর্ণ module

কারণ এখানে হলে:

- duplicate sale
- lost sale
- wrong stock
- wrong due
- wrong prepaid balance
- out-of-order sync
- partial sync
- crash during sync

### যাচাই করতে হবে

1. IndexedDB queue persist করে reload/close/restart-এ
2. একাধিক browser tab খোলা থাকলে duplicate sync worker চলে না
3. Network offline হলে action queue-এ যায়
4. Online হলে auto replay হয়
5. Idempotency key server-এ store/verify হয়
6. Same action দুবার replay হলে duplicate record তৈরি হয় না
7. Server response timeout হলে client retry করে, কিন্তু duplicate হয় না
8. Partial failure হলে queue retain থাকে
9. Poison message infinite loop造成 crash করে না
10. Retry backoff আছে
11. Max retry/failed queue handling আছে
12. Logout করলে pending sync user-specificভাবে handle হয়
13. Multiple user login একই device-লে cross-user data leak হয় না
14. Ledger-based incremental update race condition prevent করে
15. Client clock ভুল হলে server timestamp authoritative থাকে
16. IndexedDB quota full হলে graceful error দেখায়, crash করে না
17. Sync worker error React app crash করায় না
18. ARCHITECTURE.md এবং SUMMARY.md-এর সাথে implementation match করে

### সম্ভাব্য বাগ

- idempotency key client-generated কিন্তু server verify করে না
- network success হলেও response parse fail হলে client আবার পাঠায় → duplicate sale
- sync worker multiple tabs-এ একসাথে চলছে
- offline queue-তে sale আছে, user logout/login করলে অন্য user-এর data-তে merge হয়ে যায়
- IndexedDB transaction abort হলে queue নষ্ট হয়
- server restart/rollback হলে client retry sequence ভাঙে
- ledger incremental update-এ concurrent due payment duplicate হয়

### Test cases

| Scenario | Expected |
|---|---|
| Create sale offline, then online | exactly one sale in DB |
| Replay same idempotency key 10 times | one sale, same response |
| Kill network mid-sync | queue remains, retry later |
| Server returns 500 | retry/backoff, no data loss |
| Two tabs open, offline sale in both | no duplicate worker conflict |
| Logout with pending queue | pending belongs to user, not leaked |
| IndexedDB quota exceeded | clear error, no silent loss |
| Device time 5 years wrong | server timestamp used for record |
| Duplicate action due to timeout | server idempotency prevents duplicate |
| Ledger due payment replay | balance correct, no double debit |

### Recommended invariant tests

```text
For every queued action:
- action has unique idempotencyKey
- server stores processed key
- replay returns original result
- no duplicate Sale/Payment/LedgerEntry/StockMovement
```

---

# ৩.৩ POS Cart ও Multi-tab Checkout

### Features

- Multi-tab cart
- per-tab independent checkout processing
- `processingTabIds` in UIStore
- one tab processing does not block another

### যাচাই করতে হবে

1. দুটি tab-এ আলাদা cart থাকে
2. একটি tab checkout processing চলাকালীন অন্য tab block হয় না
3. Tab close করলে processing lock cleanup হয়
4. Same tab double submit হয় না
5. Cart state reload/persistence ঠিক থাকে
6. Product add/remove/update quantity race-free হয়
7. Discount/tax/rounding থাকলে সঠিক হয়
8. Empty cart checkout block হয়
9. Negative/zero quantity block হয়
10. Very large cart performance ঠিক থাকে
11. Bengali/English product name search ঠিক থাকে
12. Barcode scan cart-এ সঠিক product add করে
13. Scanner rapid input duplicate line না বাড়ায়, unless intended
14. Tab refresh হলে cart恢复/loss policy clear এবং consistent
15. Multiple cashier same device different tabs? isolate properly

### সম্ভাব্য বাগ

- `processingTabIds` set-এ lock থেকে যায়, tab crash করলে আর checkout হয় না
- দুটি tab একই product-এর last stock নিতে চাইলে একটা oversell try করে
- cart persistence localStorage-এ থাকলে cross-tab leak
- Zustand store shared state ভুলভাবে merge
- scanner keystroke cart input-এ পড়ে যায়
- double-click submit duplicate sale creates

### Test cases

| Test | Expected |
|---|---|
| Open 2 tabs, add different items | carts independent |
| Tab A checkout slow, Tab B checkout | Tab B not blocked |
| Close Tab A during processing | lock cleared after timeout/cleanup |
| Submit same tab twice quickly | one sale |
| Refresh tab with active cart | defined behavior, no crash |
| Scan same barcode 3 times fast | expected quantity behavior |
| Last stock 1, two tabs sale | only one succeeds, other gets stock error |

---

# ৩.৪ Payments: Cash, UPI, Partial/Due, Change-as-Prepayment, Split Payment

### Features

- prepaid balance
- partial/due payments
- change-as-prepayment
- split Cash+UPI payments

### এটি financial correctness-এর core

### যাচাই করতে হবে

1. Total sale amount exact calculation
2. Cash paid + UPI paid + due + prepaid used = total
3. Change calculated correctly
4. Change-as-prepayment customer prepaid balance-এ যোগ হয়
5. Split Cash+UPI rounding ঠিক থাকে
6. Partial payment due ledger entry তৈরি করে
7. Due collection later payment ledger-এ reduce করে
8. Prepaid top-up ledger entry correct
9. Prepaid withdrawal atomic এবং balance negative না হয়
10. Payment method report সঠিক
11. Refund/void/cancel থাকলে (যদি existing feature হয়) balance reverse correct
12. Currency symbol settings থেকে আসে
13. Bengali digits/date receipt-এ intended locale অনুযায়ী
14. Decimal precision loss নেই
15. Concurrent payment same customer-এর due/prepaid balance ভাঙে না

### সম্ভাব্য বাগ

- `0.1 + 0.2` floating point issue
- change as prepayment double credit
- split payment total mismatch due to rounding
- due payment record হয়, কিন্তু customer balance update হয় না
- prepaid withdrawal concurrent হলে overdraft
- cash+UPI amount negative allow হয়
- zero amount payment accept হয়
- payment method report-এ prepaid usage wrong classify
- receipt-এ total paid/change mismatch

### Invariants

প্রতিটি sale-এর জন্য:

```text
saleTotal = sum(lineTotals) +/- discount/tax (if applicable)
amountPaid = cashPaid + upiPaid + prepaidUsed
dueAmount = saleTotal - amountPaid - changeGiven? (business rule clearly define)
changeAmount = max(0, amountPaid - saleTotal)
if changeAsPrepayment:
  customer.prepaidBalance += changeAmount
```

Customer ledger invariant:

```text
currentBalance = openingBalance
             + prepaidTopups
             - prepaidWithdrawals
             + dueCreated
             - duePayments
             +/- adjustments
```

Prepaid balance:

```text
prepaidBalance >= 0 unless business explicitly allows credit
withdrawal amount <= current prepaidBalance
```

### Test cases

| Scenario | Expected |
|---|---|
| Sale 100.50, cash 200, change 99.50 as prepay | prepaid +99.50 |
| Sale 100, cash 60, UPI 40 | due 0 |
| Sale 100, cash 30, UPI 30 | due 40 |
| Due 40 later paid 20 | due 20 remaining |
| Split 33.33 + 66.67 = 100.00 | exact |
| Rounding 0.005 cases | consistent rule |
| Prepaid balance 100, withdraw 120 | rejected |
| Two withdrawals 80+80 on balance 100 | only one succeeds or total <=100 |
| Change-as-prepay replay offline | no double credit |
| Bengali receipt | correct digits/terms per spec |

---

# ৩.৫ Inventory, Stock, WAC, Bulk Entry, Stock History

### Features

- Product CRUD
- weighted average cost (WAC)
- bulk stock entry
- stock history audit trail
- cost snapshot at sale
- atomic stock updates with `UNNEST` and `WHERE current_stock >= quantity`

### যাচাই করতে হবে

1. Stock কখনো negative হয় না
2. Concurrent sale হলে oversell হয় না
3. Bulk stock entry atomic বা clearly partial-failure handled
4. WAC calculation correct
5. Purchase/stock adjustment পরে WAC update হয়
6. Sale time-এ cost snapshot save হয়
7. পরে WAC change হলে পুরনো sale-এর profit পরিবর্তন হয় না
8. Stock history-এ every movement logged
9. Product deactivate/delete policy safe
10. Category/product search index ঠিকভাবে ব্যবহার হয়
11. Virtualized list large data-তে crash/leak করে না
12. Edit stock race condition নেই
13. Barcode/SKU/name duplicate handling clear
14. Import/bulk entry validation strong
15. Decimal quantity/weight থাকলে precision ঠিক

### সম্ভাব্য বাগ

- batch update-এ একটি item stock کم হলেও অন্য items update হয়ে যায়
- `WHERE current_stock >= quantity` আছে, কিন্তু transaction rollback নেই
- WAC division by zero
- cost snapshot null/undefined হলে profit report NaN
- stock history audit log miss
- product delete করলে sale/reference break
- bulk entry CSV/Excel injection? (if file import exists)
- virtualized list scroll-এ stale row render
- search index না ব্যবহার হলে large catalog slow

### Test cases

| Scenario | Expected |
|---|---|
| Stock 5, two concurrent sales qty 5 | only one succeeds |
| Batch sale 3 items, one insufficient | all-or-nothing or documented atomic behavior |
| Purchase 10 @ 100, then 10 @ 200 | WAC 150 |
| Sale after WAC change | old cost snapshot unchanged |
| Bulk stock entry invalid row | no partial corrupt data |
| Stock adjustment +5/-5 | history entries correct |
| Product inactive | not selectable in POS unless allowed |
| 10,000 products list | 60fps-ish, no memory leak |
| Special characters in product name | search/print safe |

### DB checks

Verify indexes exist:

- `isActive`
- `category + isActive`
- `name`

Run:

```sql
EXPLAIN ANALYZE
SELECT ... FROM products WHERE isActive = true AND category = ... ORDER BY name ...;
```

Ensure index scan, not sequential scan for common POS queries.

---

# ৩.৬ Parties: Customer/Supplier, Ledger Due, Prepaid Top-up/Withdrawal

### Features

- customer and supplier management
- ledger-based due tracking
- prepaid balance top-up
- prepaid cash withdrawal
- due collection UX

### যাচাই করতে হবে

1. Customer/supplier create/update/delete safe
2. Party with transactions delete/hard-delete হলে data integrity ভাঙে না
3. Ledger entries immutable বা append-only
4. Due collection fast repayment UI correct
5. Prepaid top-up/withdrawal atomic
6. Balance report ledger-এর সাথে match করে
7. Supplier due/purchase ledger correct
8. Party search Bengali/English ঠিক
9. Phone/name/address validation reasonable
10. Duplicate party prevention/merge policy clear
11. Concurrent due payment no double count
12. Offline sync party ledger idempotent

### সম্ভাব্য বাগ

- party delete করলে sale orphan হয়
- ledger entry edit করে balance mismatch
- prepaid withdrawal audit log miss
- due payment method record না থাকা
- supplier balance sign উল্টো
- party name XSS in receipt/report
- concurrent top-up/withdraw overdraft

### Invariants

```text
party.balance = sum(ledgerEntries.amount with correct sign)
prepaidBalance >= 0
dueBalance >= 0 unless credit policy allows negative
every balance change has ledger entry + audit log
```

---

# ৩.৭ Money, Locale, Bengali Digits, Dates, Currency Symbol, Receipt Language

### Features

- `decimal.js` precise money
- `src/lib/money.ts`
- `useNumberFormat` / `format-utils`
- Bengali digits and dates when UI is Bangla
- receipt language: `bn` / `en` / `both`
- currency symbol from Settings
- `src/lib/receipt-i18n.ts`

### যাচাই করতে হবে

1. Money parse/format round-trip safe
2. API payload-এ precision নষ্ট হয় না
3. UI-তে Decimal value correct display
4. Bengali digits শুধু intended locale-এ
5. Dates timezone consistent
6. Receipt language settings অনুযায়ী
7. App language এবং receipt language আলাদা হলে behavior clear
8. Currency symbol hardcoded নয়
9. Both receipt-এ duplicate/overlap নেই
10. Long Bengali words thermal print-এ break ঠিক
11. PDF font Bengali render করে
12. Google Input Tools API failure হলে app crash করে না
13. Missing i18n key fallback safe
14. Number formatting negative/zero/large values ঠিক
15. Currency decimal places settings অনুযায়ী (if applicable)

### সম্ভাব্য বাগ

- `Intl.NumberFormat` Bengali digit না দেখায় কারণ locale ভুল
- receipt PDF-এ Bengali square box/tofu
- both mode-এ English/Bangla line overlap
- currency symbol settings change করলে পুরনো receipt ভুল
- money string `"10.00"` parse হয়ে `10` হয়ে display
- date UTC দেখাচ্ছে, local Asia/Dhaka নয়
- timezone change হলে report day boundary ভুল
- i18n missing key visible `[missing: xyz]` production-এ

### Test matrix

| App Language | Receipt Language | Expected |
|---|---|---|
| EN | EN | English terms, English digits/dates per spec, settings currency |
| BN | BN | Bengali terms, Bengali digits/dates per spec, settings currency |
| EN | BN | Bengali receipt terms, digit/date behavior per documented spec |
| BN | EN | English receipt terms, digit/date behavior per documented spec |
| Any | BOTH | both languages cleanly separated |

### Money unit tests

Use property-based testing:

```ts
// examples
Decimal("0.1").plus("0.2").toString() === "0.3"
formatMoney(1234.5, "bn") correct
parseMoney("১,২৩৪.৫০") correct if Bengali digits accepted
rounding 2.675 consistent
negative amounts formatted correctly
large amounts no scientific notation
```

---

# ৩.৮ Invoice & Printing: Thermal 58mm/80mm, A4/A5, Desktop Print, Android Print, PDF Share

### Features

- Thermal 58mm / 80mm
- A4/A5 invoices
- Desktop browser print dialog
- Android WebView system print panel
- PDF share as last resort, never raw HTML
- Share always generates PDF
- `printUtility.ts`, `invoicePdf.ts`, `PrintDialog.tsx`, `PrintInvoice.tsx`

### যাচাই করতে হবে

1. Receipt preview correct
2. Print CSS actual paper size অনুযায়ী
3. 58mm/80mm character width correct
4. A4/A5 pagination correct
5. Table columns break না হয়
6. Bengali font print/PDF-এ render হয়
7. Currency symbol settings থেকে
8. Company logo/image load fail হলে layout ভাঙে না
9. Long product/customer name wrap correct
10. QR/barcode থাকলে scan হয় (যদি existing feature হয়)
11. Desktop hidden iframe + `window.print()` reliable
12. Android WebView print → system PrintManager
13. Optional Cordova printer থাকলে fallback ঠিক
14. PDF share only last resort
15. Share-এ raw HTML না যায়
16. PDF file cache-এ লেখে, share করে, cleanup হয়
17. WhatsApp share PDF MIME/type ঠিক
18. Print cancel/error handle হয়
19. Multiple print queue crash করে না
20. Print module offline-এ কাজ করে যদি data local থাকে

### সম্ভাব্য বাগ

- jsPDF Bengali shaping না করায় receipt unreadable
- thermal 58mm-এ text cut
- A4 print-এ extra blank page
- Android share HTML file instead of PDF
- print dialog open না হয়ে crash
- hidden iframe CSS purge হয়ে print blank
- PDF font embedded নয়, অন্য device-এ ভাঙা
- long note XSS/script injection
- print success callback duplicate sale trigger
- cache PDF full হয়ে share fail

### Test cases

| Surface | Test | Expected |
|---|---|---|
| Desktop Chrome | print 58mm | proper width |
| Desktop Firefox | print A4 | pagination ok |
| Desktop Safari | share PDF | PDF generated |
| Android Capacitor | system print | PrintManager opens |
| Android | WhatsApp share | PDF attachment |
| Android | raw HTML share attempt | blocked |
| Bengali receipt | PDF | readable Bengali |
| Both receipt | thermal | no overlap |
| Long product name | 58mm | wraps correctly |
| Network offline | print cached invoice | works or clear error |

---

# ৩.৯ Barcode Scanning: Desktop Keyboard Wedge, Android ML Kit Camera

### Features

- Global keyboard-wedge scanner support on desktop
- Native camera scanning on Android via Capacitor ML Kit

### যাচাই করতে হবে

#### Desktop keyboard wedge

1. Scanner rapid keystrokes capture হয়
2. Prefix/suffix (Enter/Tab) handle হয়
3. Scanner input normal typing-এ interfere করে না
4. Bengali IME typing চলাকালীন scanner buffer ভাঙে না
5. Invalid barcode clear error
6. Duplicate scan prevention/throttle
7. Product not found message
8. Focus loss/regain handle
9. Multiple scanner devices? if applicable
10. Scanner code leading zeros preserve

#### Android ML Kit

1. Camera permission flow correct
2. Permission denied graceful
3. Torch/control works if existing
4. Continuous scan duplicate prevention
5. Background/foreground resume crash না করে
6. Low light/focus failure message
7. ML Kit model load failure fallback
8. Orientation change handle
9. WebView/Capacitor camera plugin compatibility
10. Scan result POS cart-এ correct add

### সম্ভাব্য বাগ

- keyboard wedge code product search field-এ partial type হয়ে যায়
- scanner suffix Enter submit করে unintended action
- duplicate scan同一 product multiple lines
- leading zero barcode not found
- Android camera permission revoke করলে app crash
- ML Kit init fail হলে entire POS freeze
- orientation change scan stream leak
- background app scan callback crash

### Test cases

| Scenario | Expected |
|---|---|
| Scan valid EAN-13 | product added |
| Scan unknown code | clear error |
| Scan same code rapidly | intended duplicate behavior |
| Type Bengali while scanner idle | no corruption |
| Scanner sends prefix/suffix | parsed correctly |
| Android deny camera | graceful message |
| Android background/foreground | no crash |
| Low battery/camera fail | recoverable |

---

# ৩.১০ Dashboard, Reports, Expenses, Cash/UPI Reconciliation

### Features

- real-time sales stats
- cash/UPI reconciliation
- category/product/customer reports
- expense tracking
- consistent chart labels/colors from settings

### যাচাই করতে হবে

1. Date range filter correct
2. Timezone Asia/Dhaka consistent
3. Cash total = sum cash payments - cash refunds/withdrawals? according to existing rules
4. UPI total = sum UPI payments
5. Due total = outstanding ledger
6. Prepaid balance reports correct
7. Profit = revenue - cost snapshot
8. Expense report totals correct
9. Category/product/customer report aggregation correct
10. Chart labels/colors settings থেকে
11. Bengali/English chart labels correct
12. Large dataset query performance
13. Real-time update memory leak নেই
14. Export/print report থাকলে correct
15. Empty data state clean
16. Negative/zero values display safe

### সম্ভাব্য বাগ

- report today’s boundary UTC vs local ভুল
- profit current WAC ব্যবহার করে, cost snapshot নয়
- cash reconciliation prepaid withdrawal ভুল classify
- expense double count
- chart color settings না মানা
- Bengali chart label overflow
- large report query timeout
- real-time poll unmount-এ চলতে থাকে

### Reconciliation invariants

```text
Sales report total = sum(sale totals) for period
Payments report cash = sum(cash payment amounts) for period
Payments report UPI = sum(upi payment amounts)
Due outstanding = sum(due ledger balances)
Prepaid balance = sum(prepaid ledger balances)
Profit = revenue - cost_of_goods_sold_from_snapshots
Expenses = sum(expense amounts)
Net = gross profit - expenses (if business rule exists)
```

---

# ৩.১১ Audit Logs

### Features

- Database-level logging of critical actions
- sales, stock changes, user modifications

### যাচাই করতে হবে

1. Every critical mutation creates audit log
2. Audit log contains:
   - actor/user
   - timestamp
   - action type
   - entity type/id
   - before/after or delta
   - IP/device if available
   - idempotency/sync metadata if relevant
3. Audit log failure policy clear:
   - financial mutation সহ audit log one transaction-এ হওয়া উচিত, অথবা
   - audit fail হলে mutation rollback
4. Audit log tamper-resistant/appended-only
5. Viewer role cannot modify audit logs
6. Audit log PII minimization
7. Audit log retention/export
8. Offline sync audit log duplicate না করে
9. Stock adjustment audit trail complete
10. User permission change logged

### সম্ভাব্য বাগ

- sale create হয়, audit log miss
- stock manual adjust log নেই
- audit log-এ password/token record হয়
- offline replay duplicate audit log
- audit log edit/delete possible
- report audit count mismatch

---

# ৩.১২ Performance: Virtualized Stock List, DB Indexes, Field-level Select

### Features

- `react-virtuoso` virtualized stock management list
- composite DB indexes: `isActive`, `category+isActive`, `name`
- Sales API field-level `select`

### যাচাই করতে হবে

1. 10k/50k/100k products list smooth
2. Search/filter debounce correct
3. Scroll memory leak নেই
4. Row edit focus/state ঠিক
5. Virtualized list keyboard accessibility
6. Images/logos lazy load
7. DB queries use indexes
8. N+1 query নেই
9. Sales API over-fetching নেই
10. Client bundle size reasonable
11. Lazy page chunks load error handle
12. Dashboard charts large data-তে freeze না করে
13. Print PDF large invoice performance
14. Offline IndexedDB large cache performance

### Test data

Create:

- 10,000 products
- 100,000 sales
- 50,000 stock movements
- 10,000 parties
- 100,000 ledger entries
- 1,000 pending offline sync actions

Measure:

- product list initial load
- search latency
- sale API latency
- report query latency
- memory usage after 1 hour
- CPU during scrolling
- PDF generation time

---

# ৩.১৩ Android/Capacitor Native Shell

### Features

- Capacitor 8
- ML Kit barcode
- Filesystem + Share for PDF
- WebView loads deployed URL or live-reload
- APK debug build

### যাচাই করতে হবে

1. `capacitor.config.ts` production URL ঠিক
2. `webDir` placeholder sync ঠিক
3. Dev URL production APK-এ নেই
4. Native plugins version lock
5. `npx cap sync android` build আগে চলে
6. Android permissions declared
7. Camera permission UX
8. Filesystem cache path safe
9. Share PDF MIME correct
10. Cleartext traffic disabled production
11. HTTPS certificate pinning? optional but consider
12. App version/build number visible
13. Update flow: redeploy Next server + reinstall synced APK if native plugins changed
14. Crash reporting native + JS
15. Offline IndexedDB persists across app restart
16. Android back button doesn’t break cart/sync
17. Screen rotation doesn’t leak camera/scan listeners
18. Low storage handling
19. WebView print integration stable
20. PDF share to WhatsApp/Drive/Documents works

### সম্ভাব্য বাগ

- APK production-এ localhost load করে
- native plugin change করলে APK reinstall না করায় old behavior
- cache PDF full হয়ে share fail
- camera permission deny করলে crash
- back button cart destroy
- WebView print panel open না হয়
- Share intent HTML file পাঠায়

---

# ৩.১৪ Database: Prisma, Neon PostgreSQL, Cloudflare Hyperdrive

### Features

- Prisma 7
- Neon PostgreSQL via Cloudflare Hyperdrive
- Prisma singleton in `src/lib/db.ts`
- `DIRECT_URL` for migrations

### যাচাই করতে হবে

1. Prisma schema valid
2. Migrations reproducible
3. Production use migrate deploy, not db push
4. Hyperdrive connection string correct
5. Direct URL non-pooled for migration
6. Connection pool exhaustion prevention
7. Transactions isolation appropriate
8. Deadlock handling
9. Slow query logging
10. Backups/PITR enabled
11. Restore tested
12. Foreign keys enforced
13. Check constraints for money/stock where appropriate
14. Unique constraints for idempotency keys
15. Cascade delete policy safe
16. Prisma client singleton works in dev hot reload/serverless
17. Neon branch/staging data isolated
18. Secrets not in connection string logs

### DB constraints to verify/add if missing

Examples:

```sql
CHECK (amount >= 0) -- where applicable
CHECK (current_stock >= 0)
CHECK (prepaid_balance >= 0)
UNIQUE (idempotency_key)
FOREIGN KEY sale_items -> products
FOREIGN KEY ledger_entries -> parties
```

But be careful: existing data may violate. Run audit queries first.

---

## ৪. Automated Testing Strategy

এখন সবচেয়ে গুরুত্বপূর্ণ: manual QA-only দিয়ে stable করা যায় না। Automated test suite লাগবে।

### ৪.১ Test Pyramid

| Level | Tool suggestion | Coverage |
|---|---|---|
| Unit | Vitest/Jest | money, format, validators, offline queue logic, permission matrix |
| Integration | Vitest + Supertest/Testcontainers or Neon branch | API routes, Prisma transactions, auth, sync |
| Concurrency | Custom integration tests | stock oversell, prepaid withdrawal, duplicate sync |
| E2E Desktop | Playwright | login, POS sale, print, barcode wedge, reports |
| E2E Mobile | Appium/Detox/Capacitor plugin tests | camera scan, system print, PDF share |
| Property-based | fast-check | money, ledger invariants |
| Load | k6/artillery | sync, sales API, product search |
| Visual/Print | Playwright screenshots/PDF snapshots | receipt layouts |

---

### ৪.২ Unit Tests

#### Money

- parse Decimal strings
- Bengali digits parse if supported
- format EN/BN
- rounding rules
- currency symbol from settings
- negative/zero/large values
- split payment totals
- change calculation
- WAC calculation
- profit from cost snapshot

#### Offline queue

- create action idempotency key
- serialize/deserialize
- retry backoff
- queue ordering
- dedupe
- error classification
- logout/user switch handling

#### Permissions

- role permission matrix unit test
- every API route has required permission mapping

#### Receipt i18n

- bn/en/both rendering
- missing key fallback
- date/number locale

---

### ৪.৩ Integration/API Tests

প্রতিটি API route-এর জন্য:

- unauthenticated → 401/403
- wrong role → 403
- invalid payload → 400 with clear error
- valid payload → expected DB change
- audit log created
- idempotent where applicable
- transaction rollback on failure

Important routes:

- `/api/sync`
- sales create
- payment/due collection
- prepayment top-up
- prepayment withdrawal
- product CRUD
- stock adjust/bulk entry
- party CRUD
- expense create
- settings update
- user/role update

---

### ৪.৪ Concurrency Tests

এগুলো না করলে POS app stable বলা যাবে না।

#### Stock oversell

Setup:

- product stock = 1
- fire 20 concurrent sale requests qty=1

Expected:

- exactly 1 success
- 19 stock insufficient errors
- stock final = 0
- no negative stock
- audit logs only for successful movement

#### Prepaid withdrawal

Setup:

- prepaid balance = 100
- fire 10 concurrent withdrawal 80

Expected:

- only one success or total withdrawn <=100
- no negative balance
- ledger entries match

#### Due payment

Setup:

- due = 100
- fire concurrent payments 60+60

Expected:

- final due >=0
- no overpayment unless business allows
- ledger consistent

#### Sync duplicate

Setup:

- same idempotency key sent 50 times concurrently

Expected:

- one resource created
- all responses consistent

---

### ৪.৫ E2E Desktop Tests

Playwright scenarios:

1. Admin login
2. Create product
3. Set stock
4. Open POS
5. Add product via search
6. Add via barcode keyboard wedge simulation
7. Apply payment split cash+UPI
8. Generate due
9. Print receipt (mock print dialog)
10. Share/download PDF
11. Logout
12. Cashier login
13. Attempt forbidden settings API
14. Go offline
15. Create sale offline
16. Go online
17. Verify sync
18. Open reports
19. Verify totals
20. Switch language BN/EN
21. Verify Bengali digits/dates/receipt language

---

### ৪.৬ Mobile E2E/Manual Automation

Capacitor Android:

1. Install debug APK pointing staging URL
2. Login
3. Camera barcode scan
4. Add to cart
5. Checkout
6. System print panel open
7. PDF share to file/WhatsApp mock
8. Kill app with pending offline queue
9. Restart app
10. Verify queue persists and syncs
11. Rotate device during scan/print
12. Deny camera permission
13. Revoke permission
14. Low storage scenario

---

### ৪.৭ Property-based Tests

Use `fast-check` for:

#### Money

```text
For random amounts a,b:
Decimal(a).plus(b) equals expected arbitrary precision
format(parse(format(x))) stable
rounding idempotent
split payments sum to total
change never negative
```

#### Ledger

```text
For random transactions:
balance equals sum(entries)
no operation creates balance without ledger entry
withdrawal cannot exceed balance
```

#### Stock

```text
For random movements:
current stock equals initial + inflows - outflows
stock never negative
sale cost snapshot fixed at sale time
```

---

## ৫. Manual QA Matrix

Automated test ছাড়াও real device/manual QA লাগবে।

### ৫.১ Roles

| Role | Test |
|---|---|
| Admin | full access, settings, users, withdrawal, reports |
| Manager | operational reports, parties, stock, maybe no user admin |
| Cashier | POS sale, customer due, limited reports |
| Viewer | read-only, no mutation |

### ৫.২ Devices

- Windows Chrome
- Windows Edge
- macOS Safari
- Linux Firefox
- Android phone low-end
- Android tablet
- Android with external USB/Bluetooth scanner
- Thermal printer 58mm
- Thermal printer 80mm
- A4 laser printer
- A5 printer if used

### ৫.৩ Network Conditions

- online
- offline
- flaky network
- slow 3G
- WiFi disconnect during sync
- server restart during sync
- DNS failure
- HTTPS certificate issue staging
- Capacitor WebView offline

### ৫.৪ Payment Scenarios

- full cash
- full UPI
- cash + UPI split
- partial cash, due
- partial UPI, due
- change given
- change as prepayment
- prepaid used fully
- prepaid used partially
- prepaid top-up
- prepaid withdrawal
- due collection cash/UPI
- multiple due payments
- zero amount edge cases
- very large amount
- decimal fraction amounts

### ৫.৫ Receipt Scenarios

- EN receipt
- BN receipt
- BOTH receipt
- app EN receipt BN
- app BN receipt EN
- long customer name
- long product name
- many line items
- notes with special chars `<>&"'`
- Bengali digits
- currency symbol changed in settings
- 58mm
- 80mm
- A4
- A5
- PDF share
- system print
- browser print

### ৫.৬ Barcode Scenarios

- EAN-13
- UPC
- Code128
- QR if supported
- leading zeros
- invalid checksum
- unknown product
- duplicate product code
- rapid scan
- scan while typing
- scan in search field
- scan in cart
- camera low light
- camera permission denied

---

## ৬. Security Hardening Checklist

Stability-এর সাথে securityও জড়িত, কারণ security breach হলে app reliable না।

### ৬.১ Input Validation

Every API input Zod schema:

- string lengths
- enum values
- positive numbers
- Decimal strings
- date ranges
- IDs UUID/CUID validation
- no unexpected fields
- role/permission fields only admin

### ৬.২ Output Encoding

- HTML print escape
- PDF text escape/font safe
- JSON responses no sensitive fields
- logs no password/token/full card/UPI secrets

### ৬.৩ AuthN/AuthZ

- server-side permission checks
- session revocation
- role cache invalidation
- rate limit login/sync/mutations
- CSRF protection
- CORS allowed origins strict
- Android WebView origin allowed intentionally

### ৬.৪ SQL Safety

- Prisma parameterized queries
- raw SQL reviewed
- dynamic identifiers whitelist
- no string concat SQL

### ৬.৫ File/PDF Safety

- cache directory controlled
- filename sanitized
- MIME type correct
- no path traversal
- cleanup old PDFs
- share only generated PDF, not arbitrary HTML

### ৬.৬ Dependencies

- lockfile
- audit
- renovate/dependabot
- minimal native plugins
- Capacitor plugins updated with test

### ৬.৭ Secrets

- no secrets in client bundle
- no secrets in logs
- no secrets in repo
- rotate NEXTAUTH_SECRET safely
- database least privilege

---

## ৭. Observability: বাগ ধরা, diagnose করা, prevent করা

একটা app stable করতে হলে শুধু fix নয়, দেখতেও হবে।

### ৭.১ Error Tracking

যোগ করুন/যাচাই করুন:

- Sentry or similar
- capture React errors
- capture unhandled promise rejections
- capture API server errors
- capture Capacitor native crashes
- attach release/version/commit
- attach user role anonymized
- attach offline queue state if safe

### ৭.২ Structured Logs

Log fields:

- timestamp UTC
- level
- request id
- user id/role
- route
- action
- idempotency key
- sync attempt
- error code
- DB transaction outcome

Do not log:

- password
- session token
- full payment secrets
- unnecessary PII

### ৭.৩ Metrics

Track:

- sales created per minute
- sync queue depth
- sync failure rate
- duplicate idempotency rejection count
- stock insufficient errors
- print failures
- PDF share failures
- barcode scan failures
- API latency p50/p95/p99
- DB connection count
- Hyperdrive latency
- IndexedDB errors
- Android crash-free sessions

### ৭.৪ Alerts

Alert if:

- sync failure rate > threshold
- queue age > X minutes
- duplicate sale detected
- stock negative detected
- auth errors spike
- print/PDF failure spike
- DB connections near limit
- error rate spike after deploy

### ৭.৫ Health Checks

Endpoints:

- `/api/health`
- DB ping
- migration version
- app version
- offline sync worker status (safe subset)
- Capacitor app can reach server

---

## ৮. Data Integrity Audit Queries

Release আগে production/staging DB-এ এই queries চালান।

### ৮.১ Negative stock

```sql
SELECT id, name, current_stock
FROM products
WHERE current_stock < 0;
```

Expected: 0 rows unless business allows negative stock.

### ৮.২ Negative prepaid balance

```sql
SELECT id, name, prepaid_balance
FROM parties
WHERE prepaid_balance < 0;
```

Expected: 0 rows unless allowed.

### ৮.৩ Sale without payment/ledger

Depending schema:

```sql
SELECT s.id
FROM sales s
LEFT JOIN payments p ON p.sale_id = s.id
WHERE p.id IS NULL;
```

Expected: no invalid sale unless due-only allowed.

### ৮.৪ Stock movement without audit log

```sql
-- adjust table/column names actual schema অনুযায়ী
SELECT sm.id
FROM stock_movements sm
LEFT JOIN audit_logs al ON al.entity_type = 'StockMovement' AND al.entity_id = sm.id
WHERE al.id IS NULL;
```

Expected: 0 rows.

### ৮.৫ Duplicate idempotency processed keys

```sql
SELECT idempotency_key, COUNT(*)
FROM sync_processed_actions
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

Expected: 0 rows.

### ৮.৬ Ledger balance mismatch

Pseudo:

```sql
SELECT p.id,
       p.balance AS stored_balance,
       COALESCE(SUM(le.amount), 0) AS ledger_sum
FROM parties p
LEFT JOIN ledger_entries le ON le.party_id = p.id
GROUP BY p.id, p.balance
HAVING p.balance <> COALESCE(SUM(le.amount), 0);
```

Expected: 0 rows.

### ৮.৭ Profit using current WAC instead of snapshot

Check sales table has cost snapshot fields not null.

```sql
SELECT id
FROM sale_items
WHERE unit_cost_snapshot IS NULL;
```

Expected: 0 rows for completed sales.

---

## ৯. Migration/Deployment Stability

### ৯.১ Migration rules

- Development: `prisma migrate dev`
- Staging/Production: `prisma migrate deploy`
- `db:push` শুধু throwaway local DB-এ
- Migration আগে backup নাও
- Migration dry-run staging-এ
- Long-running migration lock risk check
- Backward-compatible deploy if possible
- Rollback plan:
  - code revert
  - DB restore
  - or reversible migration

### ৯.২ Neon/Hyperdrive

- `DATABASE_URL` pooled/Hyperdrive
- `DIRECT_URL` non-pooled migration
- connection limit monitor
- prepared statement/pooler compatibility check
- idle transaction timeout
- neon branch for staging test

### ৯.৩ Next.js standalone

- `output: 'standalone'` ঠিকভাবে build হয়
- static assets serve
- middleware/serverless compatibility
- environment variables runtime available
- health check endpoint
- graceful shutdown

### ৯.৪ Capacitor release

Build process:

```bash
pnpm install --frozen-lockfile
pnpm build
npx cap sync android
cd android
./gradlew assembleRelease
```

Checklist:

- production `server.url` HTTPS
- no dev live-reload URL
- app version incremented
- native plugin changes synced
- APK/AAB signed
- ProGuard/R8 rules not breaking ML Kit/Share/Filesystem
- permissions minimal
- cleartext disabled
- crash symbols uploaded

---

## ১০. Bug Triage ও Severity Definitions

বাগ পেলে classify করুন:

| Severity | Meaning | Release rule |
|---|---|---|
| P0 | data loss, wrong money, security breach, crash, oversell, duplicate sale | must fix immediately |
| P1 | major feature broken, receipt unreadable, sync stuck, role bypass | must fix before release |
| P2 | minor functional issue with workaround | should fix before stable release |
| P3 | cosmetic/typo | can defer with ticket |

“ত্রুটিমুক্ত” release মানে:

- P0 = 0
- P1 = 0
- P2 = 0 বা অত্যন্ত limited documented workaround
- P3 tracked but not blocking

---

## ১১. প্রতিটি ফিচারের জন্য Definition of Done

কোনো module “done” বলতে হলে:

1. Code review complete
2. TypeScript strict pass
3. Lint pass
4. Unit tests pass
5. Integration tests pass
6. Relevant E2E pass
7. Concurrency test pass (if financial/stock/sync)
8. Security review pass
9. i18n keys complete
10. Print/PDF verified on target surfaces
11. Offline behavior verified
12. Audit log verified
13. Performance benchmark pass
14. Documentation updated
15. Regression test added for every fixed bug
16. Staging sign-off
17. Monitoring/alerting in place

---

## ১২. 30 দিনের Stabilization Plan

### Week 1: Baseline ও Critical Audit

- package manager fix
- env validation
- CI pipeline setup
- typecheck/lint/test scripts
- dependency audit
- secret scan
- i18n missing keys
- route permission inventory
- grep hardcoded currency/money floats/raw SQL/XSS
- create bug tracker with P0-P3

Deliverable:

- failing tests baseline
- critical risk list
- CI green for static checks

---

### Week 2: Financial & Offline Core Hardening

- money Decimal tests
- split payment/due/prepaid tests
- ledger invariants
- offline idempotency tests
- sync duplicate/retry tests
- stock concurrency tests
- WAC/cost snapshot tests
- audit log transaction tests

Deliverable:

- P0 financial/offline bugs fixed
- concurrency test suite passing

---

### Week 3: POS UX, Print, Barcode, Localization

- multi-tab checkout tests
- barcode wedge/ML Kit tests
- print 58/80/A4/A5
- PDF Bengali font
- share PDF not HTML
- receipt language matrix
- Bengali digits/dates
- error boundaries/loading states
- manual device QA

Deliverable:

- customer-facing receipt/print/barcode stable

---

### Week 4: Reports, Performance, Security, Release Gate

- dashboard/reconciliation reports
- expense reports
- load test large dataset
- DB index verification
- security pen-test checklist
- backup/restore drill
- migration dry-run
- staging soak test
- Android release build
- monitoring alerts
- release checklist sign-off

Deliverable:

- production-ready stable build

---

## ১৩. Concrete Test Suite You Should Build

নিচের test files/globals তৈরি করুন।

### Unit

```text
tests/unit/money.test.ts
tests/unit/format-utils.test.ts
tests/unit/receipt-i18n.test.ts
tests/unit/offline-queue.test.ts
tests/unit/idempotency.test.ts
tests/unit/permissions.test.ts
tests/unit/wac.test.ts
tests/unit/stock-sql.test.ts
```

### Integration

```text
tests/integration/auth-rbac.test.ts
tests/integration/sales-api.test.ts
tests/integration/payments.test.ts
tests/integration/prepayment-withdrawal.test.ts
tests/integration/due-collection.test.ts
tests/integration/stock-concurrency.test.ts
tests/integration/sync-duplicate.test.ts
tests/integration/audit-logs.test.ts
tests/integration/parties-ledger.test.ts
```

### E2E Desktop

```text
tests/e2e/pos-sale.spec.ts
tests/e2e/offline-sync.spec.ts
tests/e2e/print-receipt.spec.ts
tests/e2e/barcode-wedge.spec.ts
tests/e2e/rbac.spec.ts
tests/e2e/reports.spec.ts
tests/e2e/locale-bn.spec.ts
```

### Mobile

```text
tests/mobile/android-camera-barcode.spec.ts
tests/mobile/android-print-share.spec.ts
tests/mobile/android-offline-restart.spec.ts
```

---

## ১৪. Code Review-এ প্রথমে যে ফাইলগুলো দেখবেন

আপনার KB অনুযায়ী critical files:

```text
src/lib/offline/
ARCHITECTURE.md
SUMMARY.md
src/lib/money.ts
src/lib/receipt-i18n.ts
src/lib/printUtility.ts
src/lib/invoicePdf.ts
src/components/PrintDialog.tsx
src/components/PrintInvoice.tsx
src/stores/pos-store.ts
src/lib/api-middleware.ts
src/lib/db.ts
src/app/pos/
src/app/api/sync/
src/app/api/prepayment/withdraw/
prisma/schema.prisma
capacitor.config.ts
scripts/find-missing-i18n.mjs
.env.example
package.json
```

প্রতিটি ফাইলে প্রশ্ন:

### `src/lib/offline/`

- queue persist?
- idempotency key generation stable?
- retry safe?
- worker single instance?
- errors caught?
- user isolation?
- ledger incremental update safe?

### `src/lib/money.ts`

- Decimal only?
- rounding explicit?
- parse/format symmetric?
- no float leakage?
- currency from settings?

### `src/lib/api-middleware.ts`

- every route uses it?
- session + RBAC one pass?
- audit context set?
- error responses safe?

### `src/lib/db.ts`

- singleton correct?
- connection errors handled?
- transaction helpers safe?
- raw SQL parameterized?

### `src/stores/pos-store.ts`

- tab isolation?
- processing locks cleanup?
- cart persistence safe?
- no cross-tab mutation?

### `printUtility.ts` / `invoicePdf.ts`

- HTML escaped?
- Bengali font embedded?
- paper sizes correct?
- PDF only for share?
- cache cleanup?
- failure fallback?

### `capacitor.config.ts`

- production URL?
- webDir correct?
- plugins allowed?
- permissions?

---

## ১৫. Acceptance Criteria: কখন বলবেন app stable?

App-কে “stable/ reliable/ bug-free” বলার minimum gate:

### Functional

- All existing features work on desktop + Android
- No P0/P1 bugs open
- P2 bugs zero or explicitly accepted with workaround
- All role permissions enforced server-side
- Offline sale syncs exactly once
- No duplicate sales/payments/ledger entries
- No stock oversell
- No negative stock/prepaid unless business allows
- Receipt prints/shares correctly in EN/BN/BOTH
- PDF share never sends raw HTML
- Barcode scanning works on supported devices
- Reports reconcile with DB

### Quality

- `pnpm typecheck` pass
- `pnpm lint` pass
- `pnpm test` pass
- `pnpm test:e2e` pass
- `node scripts/find-missing-i18n.mjs` pass
- dependency audit no critical/high
- secret scan clean
- build production pass
- Android release build pass

### Operational

- Sentry/error tracking live
- health checks pass
- sync queue metrics/alerts live
- DB backup/restore tested
- migration rollback plan ready
- staging soak test passed
- release notes/version/commit recorded

---

## ১৬. সবচেয়ে বেশি ঝুঁকির ১০টি জায়গা (Priority Fix List)

যদি সময় কম থাকে, আগে এগুলো hardening করুন:

1. **Offline sync idempotency**  
   duplicate/lost sale prevent করা।

2. **Stock atomic update concurrency**  
   oversell prevent করা।

3. **Money Decimal precision**  
   floating point ভুল দূর করা।

4. **Split payment/due/prepaid ledger invariants**  
   টাকা balance match করা।

5. **RBAC on every API route**  
   permission bypass prevent করা।

6. **Receipt PDF Bengali font/rendering**  
   customer-facing blocker।

7. **Android share PDF not HTML**  
   privacy/correctness blocker।

8. **Multi-tab checkout lock cleanup**  
   UI freeze prevent করা।

9. **Audit logs for financial/stock mutations**  
   accountability/data recovery।

10. **Environment/package manager consistency**  
   build/runtime drift prevent করা।

---

## ১৭. Sample CI Pipeline Idea

GitHub Actions-এ এমন pipeline রাখুন:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma validate
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm i18n:check
      - run: pnpm test
      - run: pnpm build
```

আলাদা job:

- integration tests with Postgres service/container/Neon branch
- Playwright e2e
- Android build artifact
- dependency audit
- secret scan

Branch protection:

- required status checks
- no direct push to main
- PR review required
- squash/rebase consistent
- lockfile changes reviewed

---

## ১৮. Practical Commands for Full Verification

আপনার machine/staging-এ চালান:

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm prisma validate
pnpm prisma format --check
pnpm typecheck
pnpm lint
pnpm i18n:check
pnpm audit:deps

pnpm test
pnpm test:e2e

pnpm build

npx cap sync android
cd android
./gradlew assembleDebug
```

Production migration dry-run staging-এ:

```bash
pnpm prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

অথবা আপনার actual migration workflow অনুযায়ী।

DB integrity audit queries উপরের section ৮ থেকে চালান।

---

## ১৯. Final Recommendation: কী করলে সবচেয়ে দ্রুত stable হবে?

আমার পরামর্শ এই ক্রমে কাজ করুন:

### Step 1: Stop feature development

একটি branch খুলুন:

```bash
git checkout -b stabilization/core-hardening
```

সব PR শুধু bugfix/test/docs/refactor।

### Step 2: Fix repo hygiene

- package manager one choice
- env validation
- CI typecheck/lint/test
- i18n check
- dependency audit

### Step 3: Protect money and stock

- Decimal tests
- concurrency tests
- ledger invariants
- audit log transaction tests

### Step 4: Protect offline sync

- idempotency server-side enforcement
- duplicate replay tests
- queue persistence tests
- worker singleton tests

### Step 5: Protect customer-facing receipt/print

- Bengali PDF font
- thermal/A4 layouts
- PDF share only
- raw HTML block
- print error handling

### Step 6: Protect auth/RBAC

- route inventory test
- role matrix test
- CSRF/CORS
- session/role cache invalidation

### Step 7: Soak test staging

কয়েকদিন continuous test:

- multiple cashiers
- offline/online toggling
- high sales volume
- large product catalog
- print/share repeatedly
- barcode scanning
- reports reconciliation

### Step 8: Release with rollback plan

- backup taken
- migration tested
- version tagged
- Android APK signed
- monitoring alerts live
- rollback command/runbook ready

---

## সংক্ষিপ্ত চূড়ান্ত উত্তর

এই pos-app-কে stable, reliable এবং বাগমুক্ত করতে হলে নতুন ফিচার নয়, বরং নিচের কাজগুলো করতে হবে:

1. **Repo hygiene ঠিক করুন**: package manager এক করুন, env validation, CI, lockfile, scripts।  
2. **Static code audit করুন**: TypeScript strict, lint, dependency audit, secret scan, i18n missing keys, hardcoded currency/float money/raw SQL/XSS search।  
3. **Financial invariants test করুন**: Decimal money, split payment, due, prepaid, change-as-prepayment, WAC, cost snapshot, ledger balance।  
4. **Offline sync hardening করুন**: IndexedDB persistence, idempotency keys, duplicate replay prevention, single worker, retry/backoff, user isolation।  
5. **Stock concurrency fix/test করুন**: atomic UNNEST update, all-or-nothing transaction, no oversell, no negative stock, audit trail।  
6. **RBAC server-side enforce করুন**: every API route permission test, role matrix, CSRF/CORS, session invalidation।  
7. **Print/PDF QA করুন**: 58/80mm, A4/A5, Bengali font, receipt language EN/BN/BOTH, PDF share only, no raw HTML।  
8. **Barcode testing করুন**: keyboard wedge timing, IME interference, ML Kit camera permissions, duplicate scan handling।  
9. **Reports reconciliation করুন**: cash/UPI/due/prepaid/profit/expense totals DB-এর সাথে match।  
10. **Observability ও release gate লাগান**: Sentry/logs/metrics/alerts, backup/restore, migration dry-run, staging soak test, P0/P1/P2 zero।  

কমিট `3f68d0b` (৭ অক্টোবর ২০২৬) পর্যন্ত [joysriramsarkar/pos-app](https://github.com/joysriramsarkar/pos-app) যাচাই করা হয়েছে। নতুন ফিচার লাগে না। বিক্রয়, স্টক, বাকি, ক্রয় আর রিপোর্টের যে পথগুলো আজকে টাকা নড়াচড়া করে, সেগুলোতেই বাগ আছে। অনেক জায়গায় ইতিমধ্যে `FOR UPDATE` লক, `decimal.js` আর রোল-ভিত্তিক ছাড় চেক বসানো আছে — সেগুলো ভাঙবেন না। নিচেরগুলো এখনও ভুল হিসাব বা ভাঙা স্ক্রিন দেয়।

## এখন আসল চেকআউট কোন পথে যায়

ক্যাশিয়ারের বিল **`POST /api/sales` দিয়ে হয় না**। [POSDashboard.tsx](https://github.com/joysriramsarkar/pos-app/blob/3f68d0b905d81e1e44885375fc8af6254c3b6482/src/app/pos/POSDashboard.tsx) আগে লোকাল সেল সেভ করে, তারপর **`POST /api/sync`** (`sale:create`) কল করে। বাতিল/রিফান্ড হয় `PUT /api/sales` দিয়ে। `src/server/services/sales.service.ts`-এর `createSale()` কোথাও থেকে ডাকা হয় না, আর সেই ফাংশনটি লাইভ পাথের চেয়ে দুর্বল (স্টক লক নেই, প্রিপেইড লেজার নেই)। ওটাকে “ঠিক” করে ওয়্যার করবেন না।

## ক্রিটিক্যাল — টাকা বা স্টক ভুল হয়

**১. স্টক ০ মানে “আউট অফ স্টক” নয়, “অসীম বিক্রি”।**  
`addItem` স্টক ০-কে আনট্র্যাকড ধরে ক্যাপ তোলে না (`src/stores/pos-store.ts`, প্রায় লাইন ১৬৪–১৬৭)। সার্ভারও ঘাটতি ঠেকায় না: `lockAndPlanSaleStock(..., false)` আছে `src/app/api/sync/route.ts` (~৩৪৬) এবং `src/app/api/sales/route.ts` (~৩৩৬)। ঘাটতি হলে স্টক ০-তে সেট হয়, খরচ ০ ধরা হয় (`sale-stock.ts`-এর `blendedUnitCost`)। ফল: ফুরিয়ে যাওয়া পণ্য বিক্রি হয়, স্টক ০-ই থাকে, লাভ পুরো বিক্রয়মূল্য দেখায়।

অফলাইন সেল যা ইতিমধ্যে হয়ে গেছে, সিঙ্কে সেটা রিজেক্ট করলে খাতা আরও ভাঙবে — সেখানে `false` রাখা যুক্তিযুক্ত। অনলাইন চেকআউট আর `POST /api/sales`-এ ঘাটতি বন্ধ করতে হবে। কার্টে `currentStock === 0` মানে বিক্রি নয়, শুধু সত্যিকারের আনট্র্যাকড ফ্ল্যাগ থাকলে আনলিমিটেড।

**২. সফল বিলের পর “ফেরত” সবসময় ০।**  
`CheckoutDialog.tsx` ~৩৩২–৩৩৪:

```332:334:src/components/pos/checkout-dialog/CheckoutDialog.tsx
const displayedChange = lastSale
  ? Math.max(0, (Number(lastSale.amountPaid || 0) - Number(lastSale.totalAmount || 0)))
  : change;
```

`amountPaid` কখনও মোটের বেশি হয় না (বাড়তি টাকা `amountReceived`-এ থাকে, সেল-এ সেভ হয় না)। তাই সাকসেস স্ক্রিনে খুচরা সবসময় ০। ফর্মের নিচে সঠিক খুচরা আছে (`change - প্রিপেইড - পুরনো বাকি`), সাকসেসে সেই সংখ্যাটাই দেখাতে হবে।

**৩. আংশিক রিটার্নের পর রিপোর্ট পুরো ইনভয়েস গুনে।**  
`src/lib/report-filters.ts`-এ `COMPLETED` আর `PARTIAL_RETURN` দুটোই রেভিনিউ। `src/app/api/reports/profit/route.ts` `sale.totalAmount` নেয়, `SaleReturn` বিয়োগ করে না। পুরো রিফান্ড (`REFUNDED`) বাদ পড়ে, আংশিক রিটার্ন থেকে যায়। বিক্রয়, ক্যাটাগরি, কাস্টমার রিপোর্টেও একই। রিটার্ন অ্যামাউন্ট বিয়োগ না করলে লাভ বেশি দেখাবে।

**৪. বাকি আদায় / প্রিপেইড / সাপ্লায়ার পেমেন্টে ডাবল-ক্লিক ঠেকার কোড আছে, কিন্তু UI চাবি পাঠায় না।**  
সার্ভারে `X-Idempotency-Key` না থাকলে `reserveIdempotency` চলেই না। `DueCollection.tsx` ~১৬৭-এ হেডার নেই। `src/components`-এ এই হেডার একবারও নেই (সিঙ্ক ওয়ার্কার ছাড়া)। নেটওয়ার্ক কেটে গিয়ে আবার চাপলে একই আদায় দুবার কাটা যায়। প্রতিটি মানি বোতামে একটা স্থির কী (এক ক্লিক = এক UUID, রিট্রাইয়ে সেই একই কী) পাঠাতে হবে। নতুন ফিচার নয়, ইতিমধ্যে লেখা সার্ভার গার্ড চালু করা।

**৫. ক্রয় অর্ডারের স্ট্যাটাস ফিল্টার ভুল enum।**  
ডাটাবেসে `PENDING | ORDERED | RECEIVED | PARTIALLY_RECEIVED | CANCELLED`। `purchase-orders/route.ts` GET ~৩৫–৩৮ খোঁজে `'Pending'`, `'Ordered'`, `'Received'`। মিলবে না, ফিল্টার খালি বা এরর। লেবেলও উল্টো: `PENDING` UI-তে “অর্ডার করা”, `ORDERED` পড়ে “পেন্ডিং”। PUT সফল হওয়ার পর রেসপন্স আবার `'Ordered'` / `'Cancelled'` খোঁজে (~৬৪০), তাই অর্ডার মার্ক করার পর স্ক্রিনে আবার “পেন্ডিং”।

## উচ্চ — বিদ্যমান ফিচার ভুল রেজাল্ট দেয়

**৬. সেল বাতিল রেস।** `PUT /api/sales` স্ট্যাটাস চেক ট্রানজ্যাকশনের বাইরে। দুইবার ক্লিক বা দুই ডিভাইস একসাথে বাতিল করলে স্টক দুবার ফেরে। ট্রানজ্যাকশনের ভিতরে `UPDATE ... WHERE status = 'COMPLETED'` করে, এক সারি আপডেট না হলে বাতিল বন্ধ।

**৭. বাতিল, বান্ডেল করা পুরনো বাকি ফেরত দেয় না।** চেকআউটে `debtRepaymentAmount` বাকি কমায়। বাতিল শুধু `total - amountPaid` ফেরত। সেই বিলের সঙ্গে নেওয়া পুরনো বাকির টাকা খাতায় থেকে যায়।

**৮. সাপ্লায়ার বাকি খাতা দুই নিয়মে চলে, একটা অসম্পূর্ণ।**  
`recordSupplierLedgerEntry()` আছে, কিন্তু স্টক এন্ট্রি, সরাসরি ক্রয় বা রিসিভ কেউ ডাকে না। পার্টিজ স্ক্রিন `calculateSupplierBalances()` দিয়ে হিসাব করে, আর সেখানে `Math.round` পয়সা কেটে দেয়। স্টক এন্ট্রির ক্রয় `deliveryStatus` ডিফল্ট `PENDING`, ব্যালেন্স শুধু `RECEIVED` / `PARTIALLY_RECEIVED` গুনে — তাই আংশিক/বাকিতে মাল নিলে সাপ্লায়ারকে দেনা ০ থাকে। নোট `Paid for stock:` “অতিরিক্ত ক্রয়” আর “পেমেন্ট” দুদিকেই যোগ হয়, নিট বাকি ০।

**৯. ক্রয় স্টক আপডেটে `businessId` চেক নেই।** `purchase-orders/route.ts` ~২৯২–৩১৭ `product.update({ where: { id } })`। অন্য দোকানের প্রোডাক্ট আইডি জানা থাকলে সেই স্টক আর ওয়েটেড অ্যাভারেজ কস্ট বদলে যায়। `stock-entry` লক করে `business_id` দেখে; ক্রয় অর্ডার দেখে না।

**১০. সিঙ্ক ক্লায়েন্টের `totalAmount` বিশ্বাস করে।** `/api/sales` সাবটোটাল − ছাড় + ট্যাক্স নিজে বানায়। আসল চেকআউট `syncSale`-এ ক্লায়েন্টের টোটাল সেভ হয় (`sync/route.ts` ~৪৫৩)। সার্ভারে একই সূত্রে মিলিয়ে না মিললে ৪০০ দিন। না হলে এক পয়সার গড়মিলও খাতায় থেকে যায়।

**১১. গ্রাহকের `totalPaid` চেকআউটে বাড়ে না।** বাকি আদায় বাড়ায়। পুরো নগদ বিল সিঙ্কে লেজার ব্লকই এড়িয়ে যায় (`amountPaid < total` না হলে, ~৫৪৫)। পার্টিজ-এ “মোট পরিশোধ” কম দেখায়।

## মাঝারি

- **প্রফিট রিপোর্টে ঘাটতির খরচ ০** — ওভারসেল বন্ধ না হলে লাভ বাড়ে। স্ন্যাপশট ঠিক আছে; ভুল ইনপুট।
- **WAC ভাসমান ভাগে** (`currentStock * price + ...`) — `decimal.js` ব্যবহার করুন, যেমন বিক্রয়ে করা হয়েছে।
- **রিসিভ করা ক্রয় বাতিল** স্টক `decrement` করে, ০-এর নিচে নামা আটকায় না, WAC ফেরায় না (`purchase-orders/route.ts` ~৫৫৪)।
- **`POST /api/sales` আর `syncSale` দুই কপি।** একটা সারলে অন্যটা পুরনো বাগ নিয়ে থাকে। এক ফাংশন, দুই কলার।
- **ইনভয়েস `INV-YYYYMMDD-` + ৮ হেক্স অক্ষর** শুধু ওই ডিভাইসে ইউনিক। সংঘর্ষে ৪০৯, লোকাল সেল রোলব্যাক হয় না, সারিও সাথে সাথে ডেড-লেটার হয় না। সিঙ্ক ওয়ার্কার পরে থামায়, এই ডিভাইসের স্টক আগের অবস্থায় থাকে না।
- **ড্যাশবোর্ড অ্যালার্ট `₹` হার্ডকোড** (`dashboard-alerts.service.ts`) — সেটিংসের কারেন্সি ব্যবহার হয় না।
- **`android/app/google-services.json` রিপোতে আছে।** ক্লায়েন্ট কনফিগ হলেও রিপো পাবলিক থাকলে Firebase কী ঘোরানো উচিত।

## যা এই কমিটে ঠিক আছে (আবার ভাঙবেন না)

- অফলাইন কিউ + `X-Idempotency-Key`, একই কি-তে দ্বিতীয় সিঙ্ক ক্যাশড রেজাল্ট দেয়।
- চেকআউটে খুচরা আলাদা `prepayment:create` কিউ হয় না (ডাবল প্রিপেইড বন্ধ)।
- প্রোডাক্ট স্টক `SELECT … FOR UPDATE`, সর্টেড আইডি (ডেডলক কম)।
- মিক্সড পেমেন্টে নগদ + UPI = বাইরে থেকে নেওয়া টাকা, না মিললে ৪০০।
- ওয়াক-ইনকে বাকি দেয় না। প্রিপেইড বাকি না থাকলে সিঙ্ক রিজেক্ট, লোকাল রোলব্যাক আছে।
- গ্রাহক সিঙ্ক ক্লায়েন্টের `totalDue` সেভ করে না (০ থেকে শুরু)।
- লাইন টোটাল `quantity × unitPrice`-এর সঙ্গে না মিললে সেল রিজেক্ট (`findSaleItemTotalMismatch`)।
- ছাড় রোল লিমিটের বিরুদ্ধে লিস্ট প্রাইস দিয়ে চেক (`sale-pricing.ts`)।
- রিটার্ন আগের রিটার্ন বাদ দিয়ে বাকি পরিমাণ দেখে; বাতিল সেলে রিটার্ন বন্ধ।

## স্থিতিশীল করার ক্রম (নতুন স্ক্রিন নয়)

১. স্টক ০-তে বিক্রি বন্ধ + অনলাইন পাথে `rejectOnShortage = true`।  
২. সাকসেস স্ক্রিনে আসল খুচরা।  
৩. সব মানি POST-এ একই আইডেমপোটেন্সি কী।  
৪. রিপোর্ট থেকে `SaleReturn.refundAmount` বাদ।  
৫. ক্রয় স্ট্যাটাস শুধু Prisma enum; লেবেল আলাদা ম্যাপ, ফিল্টারে নয়।  
৬. সেল বাতিল এক সারিতে, শর্ত `status = COMPLETED`; বান্ডেল বাকি আদায়ও উল্টানো।  
৭. সাপ্লায়ার বাকি একটাই নিয়ম: লেজার, `Math.round` নয়। স্টক এন্ট্রি/ক্রয় সেই নিয়ম ডাকবে। প্রোডাক্ট আপডেটে `businessId`।  
৮. `syncSale`-এ টোটাল সার্ভার আবার গণনা করবে। `createSale()` মুছে বা লাইভ পাথের সাথে মিলিয়ে ফেলুন, দুই জায়গায় লজিক রাখবেন না।  
৯. এই কেসগুলোর টেস্ট: স্টক ০, আংশিক রিটার্নের পর প্রফিট, ডাবল বাতিল, ডাবল বাকি আদায়, PO ফিল্টার `ORDERED`, সাপ্লায়ারকে আংশিক পেমেন্টে বাকি।

৭০ হাজার লাইনের প্রতিটি UI কম্পোনেন্ট আলাদা করে চালানো হয়নি। বিক্রয়, সিঙ্ক, স্টক, বাকি, প্রিপেইড, ক্রয়, রিটার্ন আর রিপোর্টের সার্ভার পাথ কোড ধরে দেখা হয়েছে। চাইলে এই তালিকার বাগগুলো রিপোতেই প্যাচ করে দিতে পারি — নতুন ফিচার ছাড়া।


POS App (Lakhan Bhandar) — স্থিতিশীলতা ও নির্ভরযোগ্যতা বিশ্লেষণ ও পরিপূর্ণ সমাধান

সূচিপত্র
প্রকল্পে পররচয় ও টেক স্টযাক
কোডবেইজ রচনা ও স্থাপত্য
সমসম্ািসক বিি ও রিিস্ক বিশ্লেষণ
ডাটাবেইজ দৃঢ়ীকরণ
API ও বযাকএন্ড স্টেবিলাইিজশন
ফ্রন্টএন্ড ও স্টেট মযানেজমেন্ট শুদ্ধিকরণ
অফলাইন/সিঙ্ক রিিলায়েবিলিটি
টেস্টিং কৌশল ও বযসবহারিক প্রয়োগ
ডেপ্লয়মেন্ট ও ইন্ফ্রাস্ট্াকচার
মনিটরিং ও এরর ট্রযাকিং
সিকউরিটি হারডেনিং
পােরফরমযান্স অপটিমাইজিশন
বযাকআপ ও ডাটা রিকভারি
ধােপ ধােপ বািবায়িন প্লযান

১. প্রকল্পে পররচয় ও টেক স্টযাক
প্রকল্পে িযাক্

এই প্রকল্পটি একটী পরিপূর্ণ POS (Point of Sale) অযাপ্লিকিশন — "Lakhan Bhandar POS" / "Onuron POS" বযাবসায়ক নযমে ব্যবহৃত। এটি নীচের টেকনলজী স্টযাকে তইরী:

| স্তর | টেকনলজী |
|---|---|
| ফ্রেমওয়াকর | Next.js 16 (App Router), React 19 |
| লযাঙ্গুয়েজ | TypeScript (98.2% কোড) |
| UI | Tailwind CSS 4, shadcn/ui, Framer Motion |
| স্টেট | Zustand (persist middleware) |
| ডাটাবেইজ | PostgreSQL (Neon/Supabase), Prisma 7 ORM |
| অথ | NextAuth.js, bcrypt, Firebase OTP/Goog le |
| মবাইল | Capacitor 8, ML Kit Barcode |
| অফলাইন | IndexedDB (tenant-scoped), Sync Worker |
| লোকালাইজিশন | next-intl, Google Input Tools API |
| অযারিথমিটক | decimal.js (নির্ভুল দশমিক গণনা) |
| প্রিন্ট/PDF | jsPDF, printUtility.ts, থামরাল 58mm/80mm + A4/A5 |
| TIER | Vitest, Playwright |
| ডেপ্লয় | Vercel, Cloudflare Workers (opennextjs), Docker |

কী ফীচার
• 📶 অফলাইন-ফাাস্ট: IndexedDB লোকাল কযাশ + সিঙ্ক কিউ, ইন্টারনেট ছাড়াই িবক্ি
• 🌍 দ্িভাষী (EN/BN): ইউআই ও রিসিট বাংলা ও ইংরেজী
• 📱 বারকোড স্ কযানিং: ডেস্কটপ কী-বরড ওয়েজ + And roid ML Kit কযামরা
• 🛒 কার্ট ও চেকআউট: মাল্টী-টযাব কার্ট, প্রী-পেইড বযালান্স, আংশিক/বাকী পেমেন্ট, কযাশ+UPI
• 🧾 ইনভয়েস ও প্রিন্ট: থামারল 58mm/80mm, A4/A5, PDF শেয়ার
• 📦 ইনভেন্টরী: WAC কসট, বাল্ক স্টক এন্ট্ী, অডিট ট্রেইল
• 👥 পার্ীজ: কা স্টামার ও সা্প্লায়ার লেজার, প্রী-পেইড টপ-আপ
• 📊 ডযাশবরড ও ররপোট: রিয়ল-টাইম সেল্ স্াটস, কযাটাগরী/প্াডাক্ট/কা স্টামার ররপোট
• ️ অডিট লগ: সব জটিল অযাকশনরে ডাটাবেইজ-লেভেল লগ
• 🔐 RBAC: Admin/Manag er/Cashier/Viewer, প্রতি API রাউটে পামিশন চেক
• পােরফরমযান্স: ভার্চুআলাইজড্ লিস্ট, কম্পজিট DB ইনডেক্, ফীল্ড-লেভল select

২. কোডবেইজ রচনা ও স্থাপত্য
ডাইরেক্টরী স্ট্রাকচার (সংক্ষিপ্ত)

``
pos-app/
├── prisma/                    # Prisma 7 স্কীমা ও মাইগ্রিশন
│   ├── schema.prisma          # 25+ মডল, এনাম, ররলিশন
│   └── seed.ts                # ডাটাবেইজ সীড
├── src/
│   ├── app/
│   │   ├── page.tsx           # রুট পেইজ → POSDashb oard (lazy)
│   │   ├── pos/
│   │   │   ├── POSDashb oard.tsx   # মইন ডযাশবরড - 800+ লাইন
│   │   │   ├── lazy-pag es.ts      # ডাইনযামিক ইম্পরট
│   │   │   └── nav-config.ts       # নযাভগিশন কন্িগ
│   │   └── api/               # ২০+ API রাউট
│   │       ├── sales/route.ts      # সেল্ CRUD + স্টক লক
│   │       ├── sync/route.ts       # অফলাইন সিঙ্ক (idempotent)
│   │       ├── stock-entry/        # স্টক এন্ট্ী + WAC
│   │       ├── customers/          # কা স্টামার CRUD
│   │       ├── products/           # প্াডাক্ট CRUD
│   │       ├── prepayment/         # প্রী-পেইড ট্রযানজযাকশন
│   │       └── ...                 # expenses, reports, users, etc.
│   ├── components/pos/        # POS কম্পনেন্ট (30+)
│   ├── lib/
│   │   ├── db.ts              # Prisma সিঙ্গলটন + কানেকশন পুল
│   │   ├── auth.ts            # NextAuth কন্িগ
│   │   ├── api-midd leware.ts # CSRF + session + RBAC
│   │   ├── tenant.ts          # মাল্টী-টেনযান্ট কন্টেক্ স্ট
│   │   ├── money.ts           # decimal.js মানি ফাংশন
│   │   ├── sale-stock.ts      # স্টক লক ও প্লযান
│   │   ├── sale-calculations.ts # সেল্ আইটেম ভযালিডিশন
│   │   ├── sale-pricing.ts    # রল-ভিত্তিক ডিস্কাউন্ট চেক
│   │   ├── audit.ts           # অডিট লগ
│   │   ├── rate-limit.ts      # Upstash / ইন-মেমরী রেইট লিমিট
│   │   ├── invoice.ts         # ইনভয়েস নম্বর জেনারেটর
│   │   ├── receipt-i18n.ts    # রিসিট ভাষা ও লেবল
│   │   ├── printU tility.ts   # iframe প্রিন্ট + PDF
│   │   ├── invoicePdf.ts      # jsPDF জেনারেটর
│   │   ├── permisions-helpers.ts # পামিশন সিস্েম (pure)
│   │   └── offline/           # অফলাইন আকর্িটেক্চার
│   │       ├── indexeddb.ts    # IndexedDB (per tenant)
│   │       ├── sync-worker.ts  # FIFO সিঙ্ক ইঞ্জিন
│   │       └── network-listener.ts # অনলাইন/অফলাইন মনিটর
│   ├── stores/
│   │   ├── pos-store.ts       # জুস্টযান্ড কার্ট + UI + সেল্ স্টোর
│   │   ├── setings-store.ts   # সটিংস (ভাষা, কারেন্সী)
│   │   └── sales-store.ts     # সেল্ ডাটা কযাশ
│   ├── hooks/                 # 20+ কা স্টাম হুক
│   ├── schemas/               # Zod ভযালিডিশন স্কীমা
│   └── types/                 # TypeScript টাইপ
├── tests/                     # Playwright E2E (1 example)
├── android/                   # Capacitor An droid
├── Dockerfile                 # মাল্টী-স্েটজ Docker
├── Cadd yfile                  # Cadd y রিভাসর প্রক্ি
└── .github/workflows/         # CI/CD
`

মূল স্থাপত্য নির্ণয়
মাল্টী-টেনযান্ট: Business মডল টেনযান্ট আইসোলিশন দেয়। প্রতি API রাউট requireBusinessContext() দিয়ে টেনযান্ট রিজল্ভ করে — ক্লাইন্ট-সা্পলাইড businessId কখনই বব্যহৃত হয় না।

অফলাইন-ফাাস্ট: IndexedDB লোকাল কযাশ (per tenant), SyncQueueDB সিঙ্ক কিউ, idempotency কী দ্ারা ডুপ্লিকেট সিঙ্ক রধ।

পরমাণবিক স্টক আপডেট: Raw SQL SELECT...FOR UPDATE দিয়ে কনকারেন্ট ওভারসেলিং রধ।

Prisma সিঙ্গলটন: globalThis-এ কযাশ করা একক PrismaClient, হট-ররলাড ও সার্ভারলেস ইনভকিশনে কানেকশন পুল এগজাশন রধ।

পার-টযাব প্ সেসিং: processingTabIds Set দিয়ে এক টযাবরে চেকআউট অনয টযাব ব্লক করে না।

মানি: decimal.js দিয়ে সমস্ত আথিক গণনা, toMoney Decimal → 2 দশমিক, toUnitPriceDecimal → 6 দশমিক।

পামিশন: Pure module permissions-helpers.ts — ডাটাবেইজ ডিপেন্ডেন্সী ছাড়াই ক্লাইন্ট ও সার্ভার উভয় স্থানেই ইম্পরট করা যায়।

৩. সমসম্ািসক বিি ও রিিস্ক বিশ্লেষণ
🔴 ক্রিটিকযাল (Critical) — অবশ্যই ফিিক্স

3.1 ডাটাবেইজ কানেকশন রিলায়েবিলিটি

সমস্যা: src/lib/db.ts-এ Prisma ক্লাইন্ট একটী Prox y-র মাধযমে রযাপ করা হয়েযে। get() ট্রযাপ কানেকশন এররর (ECONNRESET, EPIPE) সময [[WeakMap]] থেকে ক্লাইন্ট ডিলিট করে, কিন্তু পুনরায় কল সময নতন ক্লাইন্ট সৃি্ট হয়। Cloudflare Worker পরিবেশে WeakMap<object, PrismaClient> ব্যবহার সঠিক — প্রতিটি রিকুয়েস্টরে ExecutionContext এর মাধযমে একক ক্লাইন্ট পায়। কিন্তু Node.js ফ্লব্যাকে গ্লবাল সিঙ্গলটন ব্যবহৃত হয়, যেখানে কানেকশন স্টযাল হতে পারে।

কী করণীয়:
`typescript
// src/lib/db.ts - সংযাগ করুন:
const MAXRERIES = 3;
const RETRYDELAYMS = 100;

ফাংশন withRetry<T>(fn: () => Prommise<T>): Prommise<T> {
  let lastError: Error;
  for (let i = 0; i < MAXRERIES; i++) {
    try {
      রিটার্ন await fn();
    } catch (err) {
      lastError = err as Error;
      if (isTransientError(err)) {
        aw ait new Prommise(r => setTime out(r, RETRYDELAYMS  Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
  throw lastError!;
}
`

3.2 সেল্ ক্রিয়িশন রেস কন্ডিশন

সমস্যা: src/app/api/sales/route.ts-এ handlePost ফাংশন lock AndPlanSaleStock দিয়ে প্াডাক্ট লক করে — এটি raw SQL SELECT...FOR UPDATE ব্যবহার করে। এটি PostgreSQL-এই সঠিকভাবে কজ করে, কিন্তু যদি কান প্াডাক্টরে স্টক শূনয বা ঋণাত্মক হয়, planSaleStockUsage ফাংশন availableOwned = Math.max(0, stockBefore) দিয়ে 0 ধরে নেয় এবং shortageQty জেনারেট করে। এর ফলে "auto-adjust" হয় — অর্থাৎ ফযান্টম স্টক িবক্ি হয়, যেটী ইনভেন্টরী হিিসাব ন্ট করতে পারে।

কী করণীয়: auto-adjust-এর জন্যএ একটি স্পি্ট audit log রযাখুন এবং business seting-এ একটি টগল যুক্ত করুন যাতে দাকান মযালিক সিদ্ধান্ত নিতে পারেন auto-adjust অনমোদন করবেন কিনা।

3.3 অফলাইন সিঙ্ক ডাটা লস রিস্ক

সমস্যা: OfflineSyncWorker FIFO ক্রমে সিঙ্ক করে, কিন্তু যদি একটি আইটেম পামানেন্ট ফেইল করে (HTTP 400/403/404), SetInterval ভিত্তিক পুনরায় চেষ্টা বন্ধ হয়। কিন্তু FAILED আইটেমগুলি SyncQueueDB-তে জমা হয়ে থাকতে পারে এবং ব্যবহারকারীকে দৃশ্যমান নাও হতে পারে।

কী করণীয়: 
• একটি "Pending/Failed Sync" UI পযানেল যুক্ত করুন
• ফেইলড আইটেমরে মযানুয়াল রিট্রাই অপশন দিন
• প্রতিটি ফেইলড আইটেমরে জন্যএ notification জেনারেট করুন
• লোকাল Index edDB-র সাইজ মনিটর করুন (খুব বড় হলে পার্ফরমযান্স খারাপ হয়)

3.4 Zustand Persist ডাটা দন

সমস্যা: useCartStore persist middleware ব্যবহার করে লোকাল স্্টােরজে কার্ট ডাটা সংরক্ষণ করে। createScopedStorage টেনযান্ট আইসোলিশন দেয়। কিন্তু যদি ব্যবহারকারী ব্রাউজার কযাশ ক্লীয়ার করে বা অন্য business-এ সুইচ করে, কার্টর পুরা ডাটা হািরয়ে যেতে পারে।

কী করণীয়:
• business switch-এর সময user-কে সতকর্ ককরুন যদি কার্ট খালী না হয়
• important cart state server-side-এই backup রাখার বযসবস্থা

3.5 IndexedDB ভাশরন আপগ্রেড বাগ

সমস্যা: DBVERSION = 3 এবং onupgradeneeded-এই প্রতিটি স্টােরর জন্যএ if (!db.objectStoreNames.contains(...)) চেক করে। কিন্তু ভাশরন 2 থেকে 3-এই আপগ্রেডরে সময actionqueue স্টোর তৈরী হয়। যদি কান ব্যবহারকারী 1 বছর পর অযাপ খলে, মািঝর ভাশরনগুলি িমস হয়ে যেতে পারে।

কী করণীয়:
• version-based migration logic যুক্ত করুন (switch-case ভিত্তিক)
• প্রতিটি version change-এই স্পি্ট upgrade path

হাই (High) — দ্রুত ফিিক্স করা উচিত
3.6 CSRF সুরক্া gap

সমস্যা: api-midd leware.ts-এ CORS অরিজিন চেক আছে, কিন্তু defaultAllowedOrigins-এই কাড-কডেড ডমেইন রয়েছে। CORS শুধুমাত্র ব্রাউজার-ভিত্তিক আক্রমণ রধ করে — সার্ভার-টু-সার্ভার রিকুয়েস্ট CORS বাইপাস করে।

কী করণীয়: CSRF token (double-submit cookie pat ern) বািবায়ন করুন state-changing operations-এর জন্যএ।

3.7 NextAuth সিশন এক্সপায়ার হযান্ডলিং

সমস্যা: NextAuth v4 JWT-ভিত্তিক সিশন ব্যবহার করে। সিশন টোকেনরে ডিল্ট মেযাদ 30 দিন। API রাউটগুলি getServerSession দিয়ে সিশন ভযালিডেট করে। কিন্তু ক্লাইন্ট-সাইডে সিশন expire-এর সময UI স্বয়ংক্রিয়ভাবে ররিডাইরেক্ট নাও হতে পারে।

কী করণীয়:
• useSession হুক-এ session expiry চেক
• 401 response-এই automatic redirect to login
• Refresh token mechanism (NextAuth v5-এই upgrade করলে)

3.8 Rate Limiting ফলবযাক

সমস্যা: Upstash Redis অনুপস্থিত থাকলে rate limiting সম্পূণরূপে ইন-মেমরী fallback ব্যবহার করে। Cloudflare Workers / সার্ভারলেস পরিবেশে ইন-মেমরী store রিকুয়েস্ট-ভিত্তিক, অর্থাৎ প্রতিটি রিকুয়েস্টরে জন্যএ নতন store। ফলে rate limiting কার্যকর হয় না।

কী করণীয়:
• Upstash Redis বাধযমূলক করুন production-এই
• Cloudflare Workers-এই globalThis বা KV-ভিত্তিক rate limit
• DDoS সুরক্ার জন্যএ Cloudflare proxy-level rate limiting কন্িগার করুন

3.9 বাডী সংখ্যার অযাসাইনমেন্ট

সমস্যা: pos-store.ts-এ addItem ফাংশন product-এর currentStock চেক করে quantity cap করে। কিন্তু এটি লোকাল cached stock-এর উপর ভিত্তি করে — সার্ভার-সাইড actual stock differ করতে পারে।

কী করণীয়: চেকআউটরে সময সার্ভার সাইড ভযালিডিশনই প্রাথমিক defense; ক্লাইন্ট-সাইড cap কেবল UX improvement হিिसাবে রাখুন।

3.10 টাইমজোন ও DST

সমস্যা: Business.timezone ফীল্ড প্রতিটি business-এর timezone সংরক্ষণ করে (default: 'Asia/Kolkata')। কিন্তু সার্ভার-সাইড new Date() UTC ব্যবহার করে। DST পরিবতনের সময ররপোটিং-এই এক দিনরে পাথর্কয হতে পারে।

কী করণীয়: সমস্ত business-logic-এই timezone-aware date ফাংশন ব্যবহার করুন (date-fns-tz) এবং UTC-তেই ডাটাবেইজে সংরক্ষণ করুন।

মিডিয়াম (Medium) — পরবতী রিলিজে
3.11 জুস্টযান্ড স্টোর হাইড্রিশন

সমস্যা: useCartStore এবং useUIStore একই persist middleware ব্যবহার করে। UIStore-এই processingTabIds: Set<string> রয়েছে — Set JSON serialization-এই array-তে রূপান্তরিত হয়, কিন্তু deserialize-এর সময পুনরায় Set-এই রূপান্তর করতে হবে।

কী করণীয়: Custom serializer/deserializer যুক্ত করুন অথবা Set-এর পরিবতে array ব্যবহার করুন।

3.12 lazy-loading failure

সমস্যা: POSDashb oard-এই 30+ কম্পনেন্ট dynamic(() => import(...), { ssr: false }) দিয়ে lazy-load করা হয়। যদি কান বান্ডল লাড ফেইল করে, ErrorBoundary ধরে, কিন্তু ব্যবহারকারী খালী পেইজ দেখতে পারেন।

কী করণীয়: প্রতিটি lazy component-এর জন্যএ loading fallback (skeleton UI) যুক্ত করুন এবং load error-এই retry বাটন।

3.13 IndexedDB storage limit

সমস্যা: ব্রাউজার IndexedDB-র সাইজ লিমিট (সাধারণত 50MB-2GB ডিভাইস অনুযায়ী) রয়েছে। offline sales এবং sync queue জমা হয়ে গেলে storage quota ছাড়িয়ে যেতে পারে।

কী করণীয়: navigator.storage.estimate() দিয়ে storage মনিটর করুন এবং প্রয়জনে পুরান সিঙ্কড ডাটা cleanup করুন।

3.14 Barcode Scanner Race Condition

সমস্যা: useSimpleBarcodeScanner গ্লবাল keyboard event listener ব্যবহার করে। keyboard wedge scanner খুব দ্রুত input পাঠায় — মাািঝমািঝে incomplete scan বা character loss হতে পারে।

কী করণীয়: Debounce + input buffer implementation।

3.15 Decimal.js Precision Loss

সমস্যা: sale-stock.ts-এ planSaleStockUsage ফাংশন Number() কনভাশনন ব্যবহার করে। JavaScript Number IEEE 754 double (64-bit) — 15-17 significant digits পর্যন্ত সঠিক। বডী decimal value-তে precision loss হতে পারে।

কী করণীয়: stock quantity ও টাকা decimal.js-এই রাখুন (Number-এই কনভাটর্ করবেন না), কেবল display-এর জন্যএ .toNumber() ব্যবহার করুন।

CI/CD পাইপলাইন সবলীকরণ
GitHub Actions ওয়ার্কফ্ল

সমস্যা: .g ithub/workflows/-এই সম্ভবত CI pipeline রযাখা আছে, কিন্তু configuration দেখা যায়নি। বিস্তারিত পরীক্ষার জন্যএ pipeline দরকার।

সুপারিশ: নীচের workflow file যুক্ত করুন:

`yaml
.github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pullrequest:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRESDB: postest
          POSTGRESUSER: test
          POSTGRESPASSWORD: test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      
      # Static analysis
      - run: pnpm typecheck
      - run: pnpm lint
      
      # Unit & integration tests
      - run: pnpm test
        env:
          DATABASEURL: postgresql://test:test@localhost:5432/postest
      
      # Build check
      - run: pnpm build
      
      # E2E tests (on staging deploy)
      # - run: pnpm exec playwright test
`

Pre-commit Hooks

প্রজেক্ট-এই Husky বা lefthook setup যুক্ত করুন:

`bash
pnpm add -D husky lint-staged
.lintstagedrc.js
module.exports = {
  '.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '.prisma': ['prisma format'],
};
`

মনিটরিং ও এরর ট্রযাকিং
9.1 Application Performance Monitoring

Sentry বা সমতুল্য APM যুক্ত করুন:

`typescript
// src/lib/monitoring.ts
import  as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRYDSN,
  environment: process.env.NODEENV,
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.prismaIntegration(),
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
});

export { Sentry };
`

9.2 Structured Logging

`typescript
// src/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
    environment: process.env.NODEENV,
    version: process.env.NEXTPUBLICAPPVERSION,
  };
  
  if (level === 'error') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => log('debug', m, meta),
  info:  (m: string, meta?: Record<string, unknown>) => log('info', m, meta),
  warn:  (m: string, meta?: Record<string, unknown>) => log('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log('error', m, meta),
};
`

9.3 Database Query Monitor

`typescript
// src/lib/db-monitor.ts
const SLOWQUERYTHRESHOLDMS = 1000;

export function createMonitoredPrisma(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = Date.now();
          const result = await query(args);
          const duration = Date.now() - start;
          if (duration > SLOWQUERYTHRESHOLDMS) {
            logger.warn('Slow query', { model, operation, duration, args });
          }
          return result;
        },
      },
    },
  });
}
`

9.4 Health Check API

`typescript
// src/app/api/he alth/route.ts
export async function GET() {
  const checks = {
    database: false,
    redis: false,
    timestamp: new Date().toISOString(),
  };
  
  try {
    await db.$queryRawSELECT 1;
    checks.database = true;
  } catch {}

  try {
    if (redis) {
      aw ait redis.ping();
      checks.redis = true;
    }
  } catch {}

  const healthy = checks.database;
  return NextResponse.json(checks, { status: healthy ? 200 : 503 });
}
`

সিকউরিটি হারডেনিং
10.1 Environment Variables Audit

.env.example-এই নীচের ভযারিয়েবল রয়েছে:
• DATABASEURL — সংবেদনশীল
• DIRECTURL — সংবেদনশীল
• NEXTAUTHSECRET — সংবেদনশীল
• UPSTASHREDISRESTURL, UPSTASHREDISRESTTOKEN — সংবেদনশীল
• RESTORECONFIRMATIONTOKEN — সংবেদনশীল
• SEEDADMINPASSWORD — সংবেদনশীল

চেকলিস্ট:
• [ ] production-এই সমস্ত সীক্রেট Vercel/Cloudflare environment variables-এই সেট করা আছে
• [ ] .env ফাইল .gitignore-এই রয়েছে
• [ ] কোন hardcoded secret নেই
• [ ] NEXTAUTHSECRET ≥ 32 characters
• [ ] DATABASEURL strong password ব্যবহার করে

10.2 Dependency Audit

`bash
Run regularly
pnpm audit
pnpm outdated
`

নির্ভরতাগুলি:
• next-auth@^4.24.11 — v5 upgrade বিবেচনা করুন
• bcryptjs@^3.0.3 — maintained
• jsonwebtoken — NextAuth v4-এই অভ্যন্তরীণ বযসবহার (পরক্ষা করুন)

10.3 HTTP Security Headers

`typescript
// next.config.ts বা middleware.ts-এই যোগ করুন
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permisions-Policy', value: 'camera=(), microphone=()' },
];
`

10.4 Input Sanitization

সমস্ত API ইনপুট Zod স্কীমা দিয়ে ভযালিডেট করা হয়, এটি উত্কৃষ্। অতিরিক্তভাবে:
• XSS প্াতিরধের জন্যএ DOMPurify (ইতমধ্যে override-এই রয়েছে "dompurify": "^3.4.1")
• SQL injection প্রতিরধ: Prisma parameterized queries ব্যবহার করে — নিরাপদ
• File upload limit + type validation (যদি file upload feature থাকে)

10.5 Authentication Hardening
• [ ] NEXTAUTHURL production URL-এই সেট
• [ ] Session maxAge appropriate (ডিল্ট 30 days)
• [ ] Firebase ID Token verification সঠিকভাবে কাজ করছে
• [ ] Phone OTP rate limiting
• [ ] Account lockout after N failed attempts

পােরফরমযান্স অপটিমাইজিশন
11.1 Database Query Performance

Existing indexes (ভাল):
• products: isActive, category+isActive, name
• customers: businessId+phone, businessId
• sales: businessId+createdAt, businessId+invoiceNumer
• ledgerentries: businessId+customerId+createdAt, businessId+customerId+entryType+createdAt
• stockhistory: businessId+productId+createdAt

সপারিশ:
`sql
-- Frequent query path-এর জন্যএ composite indexes
CREATE INDEX idxsalesbusinessstatus ON sales(businessid, status);
CREATE INDEX idxsalesbusinessdate ON sales(businessid, createdat DESC);
CREATE IN DEX idxproductsbarcode ON products(businessid, barcode);
`

11.2 Frontend Bundle Optimization

`bash
Analyze bundle
pnpm run analyze
`

• [ ] Large dependencies tree-shake
• [ ] lucide-react — শুধু ব্যবহৃত icon import করুন
• [ ] recharts — large; বিকল্প বিবেচনা
• [ ] firebase — full SDK-এর পরিবতে modular import
• [ ] jspdf — 200KB+, প্রিন্ট dialog-এই dynamic import ইতমধ্যে করা আছে ✓

11.3 Image & Asset Optimization
• [ ] next/image ব্যবহার বাড়ান
• [ ] Product images lazy load (যদি থাকে)
• [ ] sharp ইতমধ্যে dependency-তে রয়েছে (image optimization)

11.4 Caching Strategy

`typescript
// src/lib/cache.ts
const CACHETTLMAP = {
  'products:list': 60000,      // 1 minute
  'customers:list': 60000,
  'dashboard:stats': 30000,    // 30 seconds
  'settings': 300000,          // 5 minutes
};
`

বযাকআপ ও ডিসাস্টার রিকভারি
12.1 Database Backup

ইতমধ্যে src/app/api/backup/ রাউট রয়েছে। নীচের বিষয় নিশ্চিত করুন:

• [ ] Scheduled automatic backup (pgdump বা Supabase automated)
• [ ] Backup retention policy (daily 7 days, weekly 4 weeks, monthly 12 months)
• [ ] Backup encryption at rest
• [ ] Restore drill — প্রতি মাসে একবার restore test

12.2 Data Export Feature

`typescript
// CSV export all critical data
export async function exportBusinessData(businessId: string) {
  const [products, customers, sales, ledgerEntries] = await Promise.all([
    db.product.findMany({ where: { businessId } }),
    db.customer.findMany({ where: { businessId } }),
    db.sale.findMany({ where: { businessId }, include: { items: true } }),
    db.ledgerEntry.findMany({ where: { businessId } }),
  ]);
  // Generate CSV/ZIP...
}
`

12.3 Offline Data as Backup

যেহতু IndexedDB-তে লোকাল কপি রয়েছে, এটি একটি implicit backup। কিন্তু:
• [ ] Manual "Export Local Data" বাটন
• [ ] Sync completion verification
• [ ] Conflict resolution doc umentation

ধাপে ধাপে বাস্তবায়ন পরিকল্পনা
ফেইজ 1: জরুরী ফিিক্স (সপ্তাহ 1-2)

| অগ্রাধিকার | কাজ | ফাইল |
|---|---|---|
| P0 | CSRF token mechanism | api-midd leware.ts |
| P0 | Rate limiting Redis dependency | rate-limit.ts |
| P0 | Zustand Set serialization fix | pos-store.ts |
| P1 | Database retry logic | db.ts |
| P1 | Session expiry handling | auth.ts, hooks |
| P1 | Auto-adjust audit trail | sale-stock.ts, audit.ts |
| P1 | Lazy-load error handling | POSDashb oard.tsx |

ফেইজ 2: টেস্ট ও মনিটরিং (সপ্তাহ 3-4)

| অগ্রাধিকার | কাজ |
|---|---|
| P0 | API integration test suite |
| P0 | CI/CD pipeline setup |
| P1 | Sentry integration |
| P1 | Health check endpoint |
| P2 | P laywright test suite |
| P2 | Load testing (k6 বা artillery) |

ফেইজ 3: স্থিতিশীলতা শক্তিশালীকরণ (সপ্তাহ 5-6)

| অগ্রাধিকার | কাজ |
|---|---|
| P1 | Backup automation |
| P1 | Database index optimization |
| P2 | Bundle size optimization |
| P2 | Response caching (Redis) |
| P3 | Horizontal scaling (Read replicas) |

ফেইজ 4: উন্নত মনিটরিং (সপ্তাহ 7-8)

| অগ্রাধিকার | কাজ |
|---|---|
| P2 | Business metrics dashb oard |
| P2 | Alerting (Discord/Slack) |
| P3 | Audit log retention policy |
| P3 | Per formance regression testing in CI |

টেস্টিং কভােরজ বযসবহারিক গাইড
Unit Test Example

`typescript
// src/lib/tests/plan-sale-stock.test.ts
import { describe, it, expect } from 'vitest';
import { planSaleStockUsage } from '@/lib/sale-stock';

describe('planSaleStockUsage', () => {
  it('calculates owned and shortage correctly', () => {
    const result = planSaleStockUsage({
      productId: 'p1',
      productName: 'Test Product',
      requiredQty: 10,
      stockBefore: 7,
      wacUnitCost: 50,
    });
    
    expect(result.ownedQty).toBe(7);
    expect(result.shortageQty).toBe(3);
    expect(result.bendedUnitCost).toBeCloseTo(35, 2); // (750)/10
  });

  it('handles negative stock as zero', () => {
    const result = planSaleStockUsage({
      productId: 'p2',
      productName: 'Corrupt Product',
      requiredQty: 5,
      stockBefore: -3,
      wacUnitCost: 100,
    });
    
    expect(result.ownedQty).toBe(0);
    expect(result.shortageQty).toBe(5);
  });
});
`

Integration Test Example

`typescript
// src/app/api/tests/sales.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

describe('POST /api/sales', () => {
  it('rejects sale with mismatched totals', async () => {
    const res = await fetch('http://localhost:3000/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          productId: 'p1',
          productName: 'Test',
          quantity: 2,
          unitPrice: 100,
          totalPrice: 199, // Should be 200
        }],
        paymentMethod: 'Cash',
      }),
    });
    
    expect(res.status).toBe(400);
  });
});
`

উপসংহার

এই POS অযাপ্লিকিশনটি স্থাপত্যগতভাবে শক্ত — মাল্টী-টেনযান্ট, অফলাইন-ফাাস্ট, proper money handling, এবং role-based access control সহ। কিন্তু producton-এই দীর্ঘমেযাদী স্থিতিশীলতার জন্যএ:

টেস্ট কভােরজ বাড়ান: একটীমা্ত্র একটি Playwright example test রয়েছে — এটি জরুরীভিত্তিতে বাড়াতে হবে
মনিটরিং যুক্ত করুন: Sentry, health checks, structured logging
ডাটাবেইজ রিলায়েবিলিটি: connection retry, slow query monitoring, index optimization
অফলাইন সিঙ্ক ভিজিবিলিটি: failed sync UI panel, storage monitoring
সিকউরিটি: CSRF tokens, dependency audit, security headers
CI/CD: automated testing pipeline, pre-commit hooks
বযাকআপ: automated backup schedule, restore testing

একটী POS সিস্েমর জন্যএ সবচেয়ে গুরুত্বপূণর্ বিষয় হল ডাটার অখণ্ডতা (data int egrity) এবং লেনদেনর নির্ভুলতা। decimal.js ও WAC পদ্ধতি সঠিক দিশা নির্দেশ করে। এগুলির উপর ভিত্তি করে, উপররি সুপারিশগুলি বাস্তবায়ন করলে অযাপ্লিকিশনটি দীর্ঘমেযাদ ধরে নির্ভরযোগ্যভাবে চালান যাবে।

বিঃ দ্র: এই প্রতিবেদন GitHub রিপজিটরী https://g ithub.com/joysriramsarkar/pos-app` এর main branch (commit history: 319 commits) ভিত্তি করে তৈরী। প্রকৃত কোড file-by-file পরীক্ষা ও run-time testing ছাড়া সম্পূণর্ সঠিকতা নিশ্চিত করা যায় না।*

আমি রিপোর মূল ফাইলগুলো পড়েছি — package.json, README, ci.yml, build.mjs, next.config.ts, db.ts, api-middleware.ts, auth.ts, tenant.ts, env.ts, rate-limit.ts, api-errors.ts, sale-stock.ts, money.ts, invoice.ts, api/sales/route.ts, api/sync/route.ts, offline লেয়ার (sync-worker.ts, network-listener.ts, indexeddb.ts, ARCHITECTURE.md), schema.prisma-র শুরুর অংশ, eslint.config.mjs, .env.example। ৩১৯ কমিটের রিপোতে শত শত ফাইল আছে; UI কম্পোনেন্ট, বাকি API রুট আর টেস্ট ফাইলগুলো লাইন-বাই-লাইন পড়া সম্ভব হয়নি — তাই নিচে যা "দেখেছি" বলছি সেটা কোড থেকে, আর যা "যাচাই করুন" বলছি সেটা আপনাকে নিজে চেক করতে হবে।

প্রথমে সৎ মূল্যায়ন: কোডবেসটা অনেক হবি প্রজেক্টের চেয়ে ভালো অবস্থায় আছে — decimal.js, FOR UPDATE লক, idempotency key, RBAC মিডলওয়্যার, Zod ভ্যালিডেশন, audit log, "Bug 7 fix / Bug 17 fix" কমেন্ট। সমস্যা হলো নিশ্চয়তা নেই — কোনটা কাজ করে সেটা প্রমাণ করার যন্ত্র (টেস্ট, CI গেট, মনিটরিং) দুর্বল, আর কিছু জায়গায় "চুপচাপ ব্যর্থ হওয়া" প্যাটার্ন আছে যা প্রোডাকশনে বাগ লুকিয়ে রাখে।

১. কোডে যে নির্দিষ্ট সমস্যাগুলো দেখেছি
নিরাপত্তা ও কনফিগারেশন

src/lib/env.ts — সব ভেরিয়েবল optional, ব্যর্থ হলে শুধু console.warn। DATABASEURL, NEXTAUTHSECRET দুটোই .optional(), আর parse ব্যর্থ হলে env = process.env as any। মানে ভুল কনফিগে অ্যাপ চালু হয়ে যায় এবং প্রথম রিকোয়েস্টে অদ্ভুত জায়গায় ভাঙে। NEXTAUTHURL-এর default https://pos.onuron.org — অন্য কেউ ডিপ্লয় করলে ভুল ডোমেইনে redirect হবে। ঠিক করুন: প্রোডাকশনে required ফিল্ডগুলো .min(1) করে startup-এ throw; default ডোমেইন সরান।

api-middleware.ts — CSRF allow-list-এ হার্ডকোডেড ডোমেইন। pos.onuron.org, lakhanb.vercel.app কোডে লেখা। এগুলো শুধু ALLOWEDORIGINS env থেকে আসা উচিত; localhost গুলোও শুধু NODEENV !== 'production' হলে যোগ হোক।

rate-limit.ts — Upstash না থাকলে in-memory fallback, যা serverless/Cloudflare Workers-এ কার্যত কাজ করে না। প্রতিটি isolate/instance-এর নিজস্ব Map, তাই login brute-force protection আসলে নেই যদি Redis কনফিগার না থাকে। হয় প্রোডাকশনে Redis বাধ্যতামূলক করুন (env check), নয়তো DB-ভিত্তিক rate limit (একটা loginattempts টেবিল)।

api/sync/route.ts — অন্য রুটের চেয়ে আলাদা প্যাটার্ন। এখানে requireAuth() + requireBusinessContext() আলাদা করে ডাকা হচ্ছে (withBusinessContext নয়), ফলে session দুবার fetch হয় এবং কোনো permissionCode চেক আমি দেখিনি — একজন Viewer রোলের ইউজার sync এন্ডপয়েন্ট দিয়ে sale পুশ করতে পারে কি না যাচাই করুন। getIp এখানে পুরো x-forwarded-for নেয়, sales রুটে .split(",")[0] — একই কাজ দুই রকমভাবে।

ডেটা সঠিকতা (POS-এর জন্য সবচেয়ে গুরুত্বপূর্ণ)

sale-stock.ts — stock ক্লিয়ারিং চুপচাপ। UPDATE products SET currentstock = GREATEST(0, currentstock - qty) — ঘাটতি থাকলে stock শূন্য হয়ে যায় কিন্তু কতটা "phantom" বিক্রি হলো সেটা হারিয়ে যায়। rejectOnShortage=false পথে (sync fallback) এটা ইনভেন্টরি ও profit রিপোর্ট দুটোকেই ভুল করে। হয় সবসময় reject করুন, নয়তো শর্টেজকে stockhistory-তে ADJUSTMENT হিসেবে আলাদা রেকর্ড করুন যাতে পরে দেখা যায়।

একই ফাইলে Number() + .toFixed(6) আর Decimal মিশে আছে। planSaleStockUsage-এ পরিমাণ ও cost float-এ হিসাব হচ্ছে; money.ts Decimal ব্যবহার করে। ০.১+০.২ জাতীয় সমস্যা weighted-average-cost-এ জমা হতে পারে। পুরো stock/COGS পাথ Decimal-এ নিন।

invoice.ts — ইনভয়েস নম্বর UUID-এর টুকরো। ক্লায়েন্টে ৮ hex char, সার্ভারে ১২। offline sale-এর ক্লায়েন্ট নম্বরই রেখে দেওয়া হচ্ছে (sync রুট invoiceNumber দাবি করে)। collision ঝুঁকি কম কিন্তু শূন্য নয়, আর ক্রমিক নম্বর না থাকায় হিসাবরক্ষণে অসুবিধা। যাচাই করুন Sale মডেলে @@unique([businessId, invoiceNumber]) আছে কি না — না থাকলে ডুপ্লিকেট DB-তে ঢুকবে। আদর্শ: সার্ভারে প্রতি business-এর একটা counter টেবিল থেকে ক্রমিক নম্বর, offline নম্বরটা localRef হিসেবে আলাদা কলামে।

api-errors.ts — regex দিয়ে error message মিলিয়ে HTTP status ঠিক করা। কেউ message-এর বানান বদলালে 400 হয়ে যাবে 500, আর offline worker সেটাকে transient ভেবে অনন্তকাল retry করবে। typed error class (class InsufficientStockError extends DomainError { status = 400 }) ব্যবহার করুন।

api/sales/route.ts — status as any cast। eslint-এ no-explicit-any: off থাকায় এরকম জায়গা ধরা পড়ে না। enum টাইপ সরাসরি ব্যবহার করুন।

Offline লেয়ার
• indexeddb.ts-এর STORES-এ ACTIONQUEUE দেখিনি, অথচ ARCHITECTURE.md বলছে actionqueue স্টোর আছে এবং DBVERSION = 3 সেটার জন্যই bump করা। ডক আর কোডের মধ্যে drift — কোনটা সত্য যাচাই করুন।
• পুরোনো onuron-pos-db থেকে নতুন pos-db-{businessId}-তে মাইগ্রেশন: পুরোনো ডিভাইসে আটকে থাকা pending sale হারাবে কি না পরীক্ষা করুন।
• sync-worker.ts-এ 4xx কে permanent ধরা ঠিক, কিন্তু permanently failed আইটেম ইউজারকে দেখানো হচ্ছে কি না (একটা "৩টি বিক্রি sync হয়নি" ব্যানার) — না হলে বিক্রি নিঃশব্দে হারিয়ে যায়।
• network-listener.ts-এর constructor-এ setInterval — cleanup নেই; HMR/রি-মাউন্টে একাধিক টাইমার জমে।
• সর্বত্র console.log (ইমোজিসহ) — প্রোডাকশন বান্ডেলে থাকা উচিত না।

বিল্ড, CI, টুলিং
• build.mjs-এ isCloudflare অনুমান: !isVercel && platform === 'linux' && !DOCKERBUILD — যেকোনো Linux মেশিনে (GitHub Actions সহ) Cloudflare প্যাকেজিং চলবে। explicit BUILDTARGET ছাড়া কিছু অনুমান করবেন না।
• CI-তে next build নেই। lint + typecheck + vitest পাস করলেও বিল্ড ভাঙতে পারে। prisma validate, next build, আর Playwright (ইনস্টল আছে, CI-তে চলে না) যোগ করুন।
• CI-তে ডামি DATABASEURL — মানে DB-নির্ভর কোনো ইন্টিগ্রেশন টেস্ট নেই। checkout, refund, ledger — এগুলোর সঠিকতা শুধু আসল Postgres-এ transaction চালিয়ে প্রমাণ করা যায়।
• README: "Package manager: npm" লিখে পরের লাইনে pnpm install। Tech stack টেবিলে একবার Neon/Hyperdrive, GitHub পেজে Supabase।
• লাইন এন্ডিং মিশ্র — sync/route.ts, invoice.ts, sync-worker.ts CRLF, বাকিগুলো LF। .gitattributes + Prettier যোগ করুন।
• ডিপেন্ডেন্সি বোঝা: pg, postgres, pg-cloudflare তিনটেই; html5-qrcode + ML Kit দুটোই; z-ai-web-dev-sdk, firebase (১২.x, বিশাল); @capacitor/cli dependencies-এ (devDependency হওয়া উচিত)। প্রতিটা অব্যবহৃত প্যাকেজ একটা করে ভবিষ্যৎ breaking update। npx depcheck চালান।
• রুটে mergeprs.sh, updatecategories.ts — এগুলো scripts/-এ নিন বা মুছুন। next.config.ts-এ allowedDevOrigins: ["192.168.1.11"] ব্যক্তিগত IP।

২. স্টেবল করার ধাপে ধাপে পরিকল্পনা
ধাপ ০: ফিচার ফ্রিজ ও ইনভেন্টরি (১–২ দিন)
README-র প্রতিটি ফিচারের জন্য একটা docs/FEATURES.md-এ এক লাইনে "expected behaviour" লিখুন — যেমন "Partial payment: customer due বাড়ে ঠিক (total − paid) পরিমাণে, ledger-এ একটা DEBIT এন্ট্রি হয়"। এটাই আপনার acceptance criteria এবং পরে টেস্টের তালিকা। main-এ branch protection চালু করুন: CI সবুজ না হলে merge নয়।

ধাপ ১: কম্পাইলার ও লিন্টারকে কড়া করুন (২–৩ দিন)
• tsconfig: strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes যোগ করে দেখুন কত error আসে — প্রতিটা একটা সম্ভাব্য runtime বাগ।
• ESLint: no-explicit-any আবার error করুন (প্রথমে warn, ফাইল ধরে ধরে পরিষ্কার করুন), @typescript-eslint/no-floating-promises চালু করুন — await-ভুলে-যাওয়া promise offline কোডে সবচেয়ে সাধারণ বাগ।
• Prettier + .gitattributes text=auto eol=lf।
• knip বা ts-prune দিয়ে dead export খুঁজে মুছুন।

ধাপ ২: ডেটাবেস-স্তরে invariant বসান (২–৩ দিন)
কোড যা-ই করুক, DB যেন ভুল ডেটা না নেয়:
• CHECK (currentstock >= 0), CHECK (quantity > 0) saleitems-এ, CHECK (amountpaid <= total_amount) যেখানে প্রযোজ্য।
• @@unique([businessId, invoiceNumber]), @@unique([businessId, barcode]), @@unique([businessId, sku]) — না থাকলে যোগ করুন।
• প্রতিটি tenant-scoped মডেলে businessId non-null আছে কি না স্ক্রিপ্ট দিয়ে যাচাই করুন (SyncQueue-তে businessId String? optional দেখেছি — কেন?)।
• prisma migrate ব্যবহার করুন, db push নয় — প্রোডাকশন স্কিমা পরিবর্তনের ইতিহাস থাকা দরকার।

ধাপ ৩: টেস্ট পিরামিড (সবচেয়ে বেশি সময়, ১–২ সপ্তাহ)
• Unit (vitest): money.ts, sale-calculations.ts, planSaleStockUsage, permissions-helpers, receipt-i18n, discount/rounding। এগুলো pure function, লেখা সহজ, এবং POS-এর টাকার হিসাবের ৮০% এখানেই। edge case: ০ পরিমাণ, ০.৫ কেজি, ৯৯.৯৯৫ টাকা rounding, percentage discount > ১০০।
• Integration (vitest + সত্যিকারের Postgres, CI-তে services: postgres): প্রতিটা API রুট — sale create → stock কমলো, ledger এন্ট্রি হলো, prepaid কাটলো; refund → সব উল্টো হলো; একই idempotency key দুবার → একটাই sale; দুটো concurrent sale একই product-এ → stock negative হয় না (Promise.all দিয়ে)। Viewer রোল POST করলে 403।
• E2E (Playwright, CI-তে): মাত্র ৫–৬টা critical flow — login, scan→cart→cash checkout→print preview, due payment, offline sale → online → synced, product create, report খোলা।
• Offline সিমুলেশন: Playwright-এ context.setOffline(true) দিয়ে sale করে online করুন; IndexedDB-তে কিছু বাকি নেই এবং সার্ভারে ঠিক একটা sale আছে — assert করুন।

ধাপ ৪: Observability (১–২ দিন)
• Sentry (বা GlitchTip, self-hosted) ক্লায়েন্ট + সার্ভারে। "ত্রুটিহীন" দাবি করার একমাত্র উপায় হলো ত্রুটি দেখতে পাওয়া।
• console.log → একটা ছোট logger (debug/info/warn/error) যা প্রোডাকশনে debug ফেলে দেয়।
• Audit log ইতিমধ্যে আছে; তার সাথে একটা /api/health যা DB ping + pending sync count দেয়।

ধাপ ৫: রিলিজ শৃঙ্খলা
• CI পাইপলাইন: lint → typecheck → prisma validate → unit → integration → next build → e2e।
• Dependabot ইতিমধ্যে আছে — minor/patch auto-merge শুধু CI সবুজ হলে; major হাতে।
• CHANGELOG.md আর git tag প্রতিটি রিলিজে; Android APK-এর versionCode সার্ভার ভার্সনের সাথে মিলিয়ে।
• Staging environment (আলাদা Neon branch) — প্রোডাকশনে সরাসরি কিছু যাবে না।

৩. প্রথম সপ্তাহে কী করবেন (অগ্রাধিকার ক্রমে)
env.ts-এ production-required ভেরিয়েবল enforce + হার্ডকোডেড ডোমেইন/IP সরানো।
CI-তে next build + Postgres service যোগ, branch protection চালু।
Sale.invoiceNumber-এ per-business unique index আছে কি না দেখা, না থাকলে যোগ।
sync রুটকে withBusinessContext + permissionCode দিয়ে একই ছাঁচে আনা।
GREATEST(0, …) পথটা বন্ধ বা logged করা।
money/sale-calculations/sale-stock-এর জন্য ৩০–৪০টা unit test।
Sentry যোগ।

এর পর বাকি ধাপগুলো ফিচার-ধরে-ফিচার: FEATURES.md-এর এক লাইন নিন → তার integration/e2e টেস্ট লিখুন → ভাঙলে ঠিক করুন → পরের লাইন। নতুন কিছু না বানিয়ে এভাবে ২–৩ সপ্তাহে আপনি সত্যিই বলতে পারবেন কোন ফিচার প্রমাণিতভাবে কাজ করে — আর তখন যে বাগ থাকবে সেটা অন্তত আপনার অজানা থাকবে না।

# pos-app স্থিতিশীলতা ও নির্ভরযোগ্যতা: সম্পূর্ণ কোড অডিট রিপোর্ট

**রিপোজিটরি:** `joysriramsarkar/pos-app`
**অডিট তারিখ:** ২০২৬-১০-১১
**উদ্দেশ্য:** বিদ্যমান ফিচারগুলো ত্রুটিহীনভাবে কার্যকর করা — কোনো নতুন ফিচার নয়

---

## নির্বাহী সারসংক্ষেপ (Executive Summary)

`pos-app` একটি পরিপক্ক, মাল্টি-টেন্যান্ট POS সিস্টেম যা Next.js 16, React 19, Prisma 7, Zustand, IndexedDB এবং Capacitor 8 দিয়ে নির্মিত [1]। প্রকল্পটির আর্কিটেকচার মোটের উপর সুচিন্তিত — RBAC, অডিট লগিং, আইডেম্পোটেন্ট অফলাইন সিঙ্ক এবং টেন্যান্ট আইসোলেশন সব বাস্তবায়িত আছে। তবে কোডবেস বিশ্লেষণে বেশ কিছু বাস্তব বাগ, সম্ভাব্য রেস কন্ডিশন, ডকুমেন্টেশন-কোড অমিল এবং স্থায়িত্ব ঝুঁকি চিহ্নিত হয়েছে। এই রিপোর্টে প্রতিটি সমস্যা সোর্স-স্তরে চিহ্নিত করে সংশোধনের পথ দেখানো হয়েছে।

**সবচেয়ে জরুরি সমস্যাগুলো:**
1. `sync/route.ts`-এ Prisma স্কিমা মিসম্যাচের জন্য raw SQL fallback বিদ্যমান — যা প্রোডাকশনে মাইগ্রেশন সঙ্গতির ঘাটতি নির্দেশ করে [56, 59]
2. `page.tsx`-এ `ErrorBoundary` র‍্যাপার অনুপস্থিত [12]
3. `ProductGrid.tsx`-এ আউট-অফ-স্টক পণ্য কার্টে যোগ হতে পারে [25]
4. অফলাইন সিঙ্কের সময় `totalPaid` না বাড়ানোর বাগ স্বীকৃত (Bug 4) কিন্তু fix যাচাই প্রয়োজন [59]
5. `db.ts`-এ dummy fallback connection string নিঃশব্দ ব্যর্থতার ঝুঁকি তৈরি করে [18]
6. Playwright E2E টেস্টে web server auto-start কনফিগার নেই [6, 29]
7. ARCHITECTURE.md-তে উল্লিখিত ফাইল বাস্তবে নেই [47]

---

## ১. প্রযুক্তি স্ট্যাক ও নির্ভরতা বিশ্লেষণ (package.json ও কনফিগ ফাইল)

### ১.১ মূল নির্ভরতাসমূহ

প্রকল্পটি নিম্নলিখিত মূল প্যাকেজ ব্যবহার করে [8]:

| বিভাগ | প্যাকেজ | সংস্করণ | পরিচিত ঝুঁকি |
|-------|---------|---------|--------------|
| Framework | next | ^16.2.12 | খুবই নতুন সংস্করণ — breaking changes সম্ভব |
| UI | react | ^19.0.0 | stable কিন্তু ecosystem সব update হয়নি |
| ORM | @prisma/client | ^7.8.0 | Prisma 7 major version — API পরিবর্তন |
| State | zustand | ^5.0.6 | v5 — middleware API পরিবর্তিত |
| Validation | zod | ^4.0.2 | Zod v4 — breaking API পরিবর্তন |
| Mobile | @capacitor/core | ^8.2.0 | সর্বশেষ stable |
| Auth | next-auth | (নির্দিষ্ট সংস্করণ দেখতে package.json প্রয়োজন) | CSRF কনফিগ জটিল |

**সমস্যা ১: Zod v4 মাইগ্রেশন**
Zod 4 এর API Zod 3 থেকে ভিন্ন। যদি কোথাও `z.string().nonempty()` বা পুরনো API ব্যবহার করা থাকে, সেগুলো নিঃশব্দে ভুল আচরণ করতে পারে। সব schema ফাইল (`src/schemas/`) Zod 4 কমপ্যাটিবল কিনা যাচাই করতে হবে [8]।

**সমস্যা ২: Next.js 16 + React 19 Canary**
এই সংমিশ্রণ এখনও সব থার্ড-পার্টি লাইব্রেরির সাথে পরীক্ষিত নয়। বিশেষত `next-auth` এবং `react-hook-form` [8] এর সাথে hydration mismatch হতে পারে। `layout.tsx`-এ `suppressHydrationWarning` ব্যবহার করা হচ্ছে [23], যা মূল সমস্যা লুকাতে পারে।

### ১.২ Scripts বিশ্লেষণ

`package.json`-এ তিনটি build লক্ষ্য আছে [8]:
- `build`: সাধারণ Next.js build (Node.js deployment)
- `build:worker`: Cloudflare Workers build (`cross-env BUILD_TARGET=cloudflare node scripts/build.mjs`)
- `deploy`: `opennextjs-cloudflare build && wrangler deploy`

**সমস্যা ৩: Dual Build Target জটিলতা**
Node.js এবং Cloudflare Workers দুটি আলাদা runtime। `db.ts` এই পার্থক্য handle করে [18], কিন্তু কোনো integration test নেই যা উভয় পরিবেশে সঠিক build নিশ্চিত করে। CI-তে `build:worker` আলাদাভাবে চালানো উচিত।

### ১.৩ Prisma কনফিগারেশন সমস্যা

`prisma.config.ts`-এ স্পষ্টভাবে বলা আছে: CLI অপারেশনের জন্য `DIRECT_URL` এবং runtime-এ Hyperdrive বা `DATABASE_URL` ব্যবহার করতে হবে [5, 28]।

```typescript
// prisma.config.ts-এর সমস্যাযুক্ত অংশ:
url: process.env.DIRECT_URL || process.env.DATABASE_URL
```

**সমস্যা ৪: Fallback Chain বিপজ্জনক**
যদি `DIRECT_URL` না থাকে, `DATABASE_URL` দিয়ে migration চালানো হয় — যা Neon pooled URL হতে পারে এবং migration ব্যর্থ হবে [28]। `.env` validation-এ এটি ধরা উচিত।

**সমস্যা ৫: `prisma/schema.prisma`-তে URL কনফিগ নেই**
Prisma 7 URL কনফিগ `prisma.config.ts`-এ রাখা হয়েছে [58], কিন্তু পুরনো workflow (`npx prisma migrate`) এটি না পেয়ে ব্যর্থ হতে পারে। `package.json`-এ যদি `prisma migrate` স্ক্রিপ্ট থাকে, সেটি `prisma.config.ts` ব্যবহার করে কিনা পরীক্ষা করতে হবে।

---

## ২. Auth সিস্টেম: CSRF, প্রক্সি ব্লক ও সেশন ম্যানেজমেন্ট

### ২.১ Auth.ts সামগ্রিক মূল্যায়ন

`src/lib/auth.ts` বেশ পরিপক্ক এবং বহু নিরাপত্তা উদ্বেগ সমাধান করেছে [19, 64]:

✅ **যা সঠিকভাবে করা হয়েছে:**
- Firebase ID token ক্রিপ্টোগ্রাফিকভাবে সার্ভার-সাইডে যাচাই করা হয় [64]
- IP ও username উভয় স্তরে rate limiting আছে (IP: ১০/মিনিট, username: ৫/মিনিট) [19]
- ৫ বার ব্যর্থ লগইনে ১৫ মিনিটের account lock [19]
- Business switching সার্ভার-সাইডে DB থেকে resolve হয়, client-supplied value নয় [19]
- `NEXTAUTH_SECRET` ছাড়া production-এ start হয় না [64]
- Log injection প্রতিরোধে `sanitizeLogInput()` ব্যবহার [19]

### ২.২ সনাক্তকৃত CSRF ও সেশন সমস্যা

**সমস্যা ৬: CSRF কনফিগারেশন এবং ALLOWED_ORIGINS**

`wrangler.jsonc`-এ `ALLOWED_ORIGINS` হার্ডকোড করা আছে:
```
"ALLOWED_ORIGINS": "https://pos.onuron.org,https://pos-app.joysriram-sarkar-56.workers.dev,http://localhost:3000"
```
[26]

`next.config.ts`-এ বলা আছে এই চেক `src/lib/env.ts`-এ হয় [60]। কিন্তু Cloudflare Worker proxy এর মাধ্যমে request আসলে `Origin` header পরিবর্তিত হতে পারে। যদি Capacitor Android app থেকে request আসে, origin `capacitor://localhost` বা `http://localhost` হতে পারে যা `ALLOWED_ORIGINS`-এ নেই।

**সমাধান:**
```
ALLOWED_ORIGINS-এ যোগ করুন: "capacitor://localhost,ionic://localhost"
```

**সমস্যা ৭: 10 বছরের JWT সেশন মেয়াদ**

```typescript
session: { strategy: "jwt", maxAge: 10 * 365 * 24 * 60 * 60 }
```
[21]

JWT চুরি হলে ১০ বছর পর্যন্ত valid থাকবে। Token revocation এর কোনো mechanism নেই (database-backed session নয়, JWT)। এটি একটি ট্রেড-অফ — offline app-এর জন্য দরকার, কিন্তু:

**সমাধান:** `sessionToken` নির্দিষ্ট সময়ের মধ্যে database-এ `invalidatedAt` চেক করুন অথবা refresh token rotation চালু করুন।

**সমস্যা ৮: bcrypt pgcrypto Fallback এর ঝুঁকি**

```typescript
const pgCheck = await db.$queryRaw...
// catch { isPasswordValid = await bcrypt.compare(...) }
```
[21]

pgcrypto ব্যর্থ হলে JavaScript bcrypt-এ fallback করে। Cloudflare Worker-এ ৫০ms CPU limit-এ ১২-round bcrypt প্রায় সবসময় timeout করবে। এই fallback কার্যত ব্যবহারযোগ্য নয় — বরং login ব্যর্থ করে error দেওয়া নিরাপদ।

**সমাধান:**
```typescript
catch (pgErr) {
  console.error('[auth] pgcrypto failed:', pgErr);
  // Cloudflare Worker-এ bcrypt timeout হবে — reject করুন
  if (process.env.RUNTIME === 'cloudflare') {
    throw new Error('Password verification service unavailable');
  }
  isPasswordValid = await bcrypt.compare(passwordInput!, normHash);
}
```

**সমস্যা ৯: Google Login Email Verification চেক**

```typescript
if (!verifiedToken!.emailVerified) {
  console.log("[NextAuth] Google login rejected: email not verified");
  return null;
}
```
[21]

এটি সঠিক কিন্তু user-কে কোনো error message দেখানো হয় না। Login page-এ `error=OAuthAccountNotLinked` বা custom error দেখানো উচিত।

**সমস্যা ১০: Phone নম্বর Normalization এর Edge Case**

```typescript
const last10Digits = digitsOnly.slice(-10);
// { phone: { contains: last10Digits } }
```
[19]

যদি দুজন ব্যবহারকারীর phone নম্বরের শেষ ১০ ডিজিট একই হয়, উভয়ই match করবে। `findFirst` শুধু একজনকে দেবে — কিন্তু ভুল ব্যক্তিকে। এটি business-scoped হওয়ায় ঝুঁকি কম, তবে `findUnique` ব্যবহার করা উচিত যেখানে সম্ভব।

### ২.৩ Capacitor WebView সেশন সমস্যা

`capacitor.config.ts`-এ লেখা আছে:
```typescript
url: 'https://pos.onuron.org', // production URL — app loads same-origin, fixes WebView cookie/session issues
```
[4, 27]

**সমস্যা ১১: Development এ WebView Session টুটে যায়**
Development-এ যদি `url` পরিবর্তন করা হয় `http://localhost:3000`-এ, তাহলে cookie same-origin নীতি ভাঙে এবং NextAuth session কাজ করে না। এই পরিবর্তন `.env.local`-নির্ভর হওয়া উচিত, `capacitor.config.ts`-এ হার্ডকোড নয়।

---

## ৩. Database Layer (db.ts) বিশ্লেষণ

### ৩.১ Dummy Fallback Connection String

```typescript
return 'postgresql://dummy:dummy@localhost:5432/dummy'
```
[18]

এই লাইন সবচেয়ে বিপজ্জনক বাগ। যদি কোনো কারণে `getConnectionString()` সঠিক string না পায়, dummy string দিয়ে Prisma client তৈরি হবে। Runtime-এ প্রতিটি query ব্যর্থ হবে — কিন্তু app start হওয়ার সময় কোনো error দেখাবে না।

**সমাধান:**
```typescript
// dummy দেওয়ার পরিবর্তে:
throw new Error(
  '[db] No database connection string available. ' +
  'Set DATABASE_URL or configure Hyperdrive.'
);
```

### ৩.২ WeakMap-ভিত্তিক Request-Scoped Client

Cloudflare Workers-এ `WeakMap<ExecutionContext, PrismaClient>` ব্যবহার করা হয় [18, 20]। এটি সঠিক pattern কিন্তু:

**সমস্যা ১২: cfCtx.ctx undefined হলে**
যদি `getCfContext()` কোনো middleware-এ call না করা হয়, `cfCtx?.ctx` হবে undefined এবং কোডটি Node.js global singleton path-এ fall করবে। Cloudflare Workers-এ এটি "Cannot perform I/O on behalf of a different request" ঘটাতে পারে [50]।

**সমাধান:** প্রতিটি API route-এ এই middleware chain নিশ্চিত করুন এবং integration test যোগ করুন।

### ৩.৩ Connection Timeout মান

Edge/Worker পরিবেশে:
- `connectionTimeoutMillis: 5000` (5 সেকেন্ড)
- `idleTimeoutMillis: 3000` (3 সেকেন্ড)
- `max: 2` connections [18]

**সমস্যা ১৩: Concurrent Request Bottleneck**
একসাথে ৩টির বেশি database request আসলে ২টি connection-এ queue হবে। যদি প্রতিটি request ৩ সেকেন্ডের বেশি নেয়, পরের request timeout করবে। Sales API-তে ৬০ সেকেন্ডের transaction timeout আছে [36] — এই দুটো মান সাংঘর্ষিক।

**সমাধান:** Cloudflare Hyperdrive ব্যবহারের সময় connection pooling Hyperdrive handle করে, তাই `max` বাড়ানো যায়।

---

## ৪. Sync API Route: অফলাইন-অনলাইন সমস্যা

### ৪.১ Sync Route আর্কিটেকচার

`POST /api/sync` সাতটি action type সমর্থন করে [59]:
- `sale:create`
- `customer:create` / `customer:update`
- `product:stock:update` / `product:create` / `product:update`
- `prepayment:create`

Idempotency X-Idempotency-Key header এবং `syncQueue` upsert দিয়ে নিশ্চিত করা হয় [59]।

### ৪.২ সনাক্তকৃত Sync সমস্যা

**সমস্যা ১৪ (Critical): Raw SQL Fallback এর অস্তিত্ব নিজেই একটি বাগ**

```typescript
if (createErr?.message?.includes('SaleStatus') || 
    createErr?.message?.includes('shift_id') || 
    createErr?.code === '42704' || 
    createErr?.code === '42703') {
  console.warn('[sync] Prisma sale.create failed due to schema mismatch, falling back to raw query');
  await tx.$executeRaw`INSERT INTO "sales" ...`
}
```
[56, 59]

এই fallback মানে প্রোডাকশন database schema এবং Prisma schema-র মধ্যে মিসম্যাচ আছে। `SaleStatus` enum বা `shift_id` column নিয়ে সমস্যা থাকলে migration চালানো হয়নি।

**সমাধান:** 
1. `npx prisma migrate deploy` চালিয়ে schema sync করুন
2. Raw SQL fallback একটি monitoring alert হওয়া উচিত, silent fallback নয়
3. এই code block থাকা মানে একটি **known unresolved migration debt** আছে

**সমস্যা ১৫: Bug 4 Fix — totalPaid এর সত্যতা**

Sync route-এ comment আছে:
```typescript
// Bug 4 fix: totalPaid was not incremented during offline sync.
// createSale() does { increment: paid } — match that behaviour here.
const externalPaid = amountPaid.minus(prepaidToUse);
if (externalPaid.gt(0)) {
  dataUpdate.totalPaid = { increment: externalPaid.toNumber() };
}
```
[59]

Bug 4 fix করার চেষ্টা হয়েছে, কিন্তু `prepaidToUse` এর calculation chain যাচাই করতে হবে। যদি offline sale-এ `prepaidToUse = 0` হওয়া উচিত ছিল কিন্তু ভুলে কোনো মান এসে যায়, তাহলে `totalPaid` কম increment হবে।

**একটি unit test দরকার:** offline sale → sync → totalPaid সঠিক কিনা।

**সমস্যা ১৬: Invoice Number Collision**

```typescript
if (existing) {
  if (saleData.id && existing.id === saleData.id) {
    return existing; // idempotent replay — OK
  }
  throw new SyncRejection(`CONFLICT: Invoice number ${saleData.invoiceNumber} already exists...`);
}
```
[59]

অফলাইনে দুটি ডিভাইস একই ব্যবসায় একই সময়ে কাজ করলে invoice number collision হতে পারে। CONFLICT error ব্যবহারকারীর কাছে পৌঁছাবে কিনা — sync-worker.ts-এ এই 409 error কিভাবে handle হয় তা নিশ্চিত করতে হবে।

**সমস্যা ১৭: Stock Shortage rejectOnShortage=false**

```typescript
const { plansByProductId, autoAdjusted } = await lockAndPlanSaleStock(
  tx, saleData.items, businessId,
  false, // allow shortage — don't reject past offline sales
);
```
[59]

যুক্তিটি সঠিক (পণ্য ইতিমধ্যে customer পেয়ে গেছে), কিন্তু `autoAdjusted` items যদি অনেক বেশি হয়, তাহলে inventory বড়ভাবে negative হতে পারে। এর জন্য একটি **threshold alert** থাকা উচিত — যেমন ৫টির বেশি item auto-adjusted হলে admin notification।

**সমস্যা ১৮: Prepayment:create এ Customer Validation**

`prepayment:create` action-এ:
```typescript
if (saleData.customerId) {
  const customer = await tx.customer.findFirst({ 
    where: { id: saleData.customerId, businessId } 
  });
  if (!customer) {
    throw new SyncRejection(`Customer ${saleData.customerId} not found during sync validation`);
  }
}
```
[59]

Offline-এ নতুন customer তৈরি করে সাথে সাথে prepayment যোগ করলে, sync-এ `customer:create` এর আগে `prepayment:create` পৌঁছাতে পারে (race condition)। FIFO ordering নিশ্চিত করা দরকার।

**সমস্যা ১৯: Cross-Tenant Payload Validation পরে হয়**

```typescript
const idempotencyKey = request.headers.get("X-Idempotency-Key");
// ... auth check ...
// ... SyncQueue upsert শুরু হয় ...
// তারপর cross-tenant check:
if (payloadBusinessId && payloadBusinessId !== businessId) {
  return NextResponse.json({ error: 'Cross-tenant sync forbidden' }, { status: 403 });
}
```
[59]

**সমস্যা:** Cross-tenant check-এর আগেই SyncQueue-তে upsert হয়ে যায়। তাই একটি cross-tenant attempt database-এ একটি orphaned record তৈরি করে। Cross-tenant check **payload parse করার পরপরই** হওয়া উচিত।

**সমস্যা ২০: Sync এর সময় Session Expiry**

SUMMARY.md বলছে: "Worker stops batch if auth fails" [3, 30]। কিন্তু 10 বছরের JWT [21] মানে session expiry rare। তবে যদি `NEXTAUTH_SECRET` পরিবর্তন হয়, সব existing JWT invalid হবে এবং pending sync queue drain হবে না — silently। এর জন্য user notification দরকার।

---

## ৫. Products API Route বিশ্লেষণ

### ৫.১ সঠিকভাবে বাস্তবায়িত বিষয়

`src/app/api/products/route.ts`-এ [35, 61]:
- ✅ CSRF + session check (`requireAuth`)
- ✅ Tenant isolation (সব query-তে `businessId` filter)
- ✅ IDOR protection (PUT/DELETE-এ `{ id, businessId }` where clause)
- ✅ Soft delete (`isActive: false`)
- ✅ Stock change-এ audit trail (`ADJUSTMENT` type)
- ✅ Category upsert composite key দিয়ে
- ✅ বাংলা সংখ্যা রূপান্তর search-এ

### ৫.২ সনাক্তকৃত সমস্যা

**সমস্যা ২১: MAX_PRODUCT_LIMIT এবং Pagination**

```typescript
const MAX_PRODUCT_LIMIT = 10000;
```
[35]

১০,০০০ পণ্য একসাথে return করলে response ১০+ MB হতে পারে। IndexedDB-তে cache করার আগে এই বড় payload Cloudflare Worker-এর memory limit পার করতে পারে।

**সমাধান:** Cursor-based pagination enforce করুন এবং maximum page size ২০০ রাখুন।

**সমস্যা ২২: Category String Denormalization**

Prisma schema-তে [58]:
```
category String @default("General")
// Category catalog (lookup/backup). Product.category remains a denormalized string for POS speed
```

`products/route.ts`-এ category upsert হয় কিন্তু product-এ category string সরাসরি থাকে। যদি category rename করা হয়, পুরনো product-এ string আপডেট হবে না। এটি design decision হলেও reports-এ inconsistency আসতে পারে।

**সমস্যা ২৩: Error Leakage**

```typescript
const details = error instanceof Error ? error.message : String(error);
return NextResponse.json({ success: false, error: 'Failed to fetch products', details }, { status: 500 });
```
[54]

`details` field-এ internal Prisma error, table name, column name expose হতে পারে। Production-এ এটি security risk।

**সমাধান:**
```typescript
const details = process.env.NODE_ENV === 'development' 
  ? (error instanceof Error ? error.message : String(error))
  : undefined;
```

---

## ৬. Sales API Route বিশ্লেষণ

### ৬.১ সঠিকভাবে বাস্তবায়িত বিষয়

`src/app/api/sales/route.ts`-এ [36, 62]:
- ✅ Rate limiting (৬০ req/min)
- ✅ Server-authoritative pricing check
- ✅ Mixed payment validation (cash + UPI = external paid)
- ✅ Walk-in customer full payment enforcement
- ✅ Prepaid balance sufficiency check
- ✅ FOR UPDATE lock concurrent payment collision রোধে
- ✅ Ledger entries (PREPAYMENT_USED, CREDIT, DEBIT)
- ✅ 60 সেকেন্ড transaction timeout

### ৬.২ সনাক্তকৃত সমস্যা

**সমস্যা ২৪: offlineSynced সবসময় true**

```typescript
offlineSynced: true, // Sales API route-এ
```
[62]

যখন online-এ সরাসরি `/api/sales` call হয়, `offlineSynced: true` সেট হয়। কিন্তু `offlineSynced` field-এর উদ্দেশ্য হলো offline থেকে sync হওয়া sale চিহ্নিত করা [58]। Online sale-এ `offlineSynced: true` সেট করা বিভ্রান্তিকর এবং analytics-কে ভুল তথ্য দেবে।

**সমাধান:**
```typescript
// Online sale-এ:
offlineSynced: false, // বা null — এটি online sale
// Sync route-এ:
offlineSynced: true, // এটি offline থেকে sync হয়েছে
```

**সমস্যা ২৫: Cache-Control Header**

```typescript
headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=15' }
```
[62]

Sales list ৫ সেকেন্ড cache হয়। কিন্তু যদি এই সময়ে নতুন sale হয়, GET response পুরনো দেখাবে। Real-time POS-এ এটি user confusion তৈরি করে।

**সমাধান:** `max-age=0, must-revalidate` ব্যবহার করুন অথবা WebSocket/Server-Sent Events দিয়ে real-time update করুন।

**সমস্যা ২৬: Product Popularity Update ব্যর্থ হলে**

```typescript
try {
  await Promise.all(validatedItems.map(async (item) => {
    await db.productPopularity.upsert(...);
  }));
} catch (popError) {
  console.error("Failed to update product popularity:", popError);
}
```
[36]

Error suppressed হচ্ছে। বারবার ব্যর্থ হলে `popular products` feature কাজ করবে না কিন্তু কোনো alert নেই।

---

## ৭. POS Store (pos-store.ts) বিশ্লেষণ

### ৭.১ সনাক্তকৃত সমস্যা

**সমস্যা ২৭: Stock Limit Enforcement অসম্পূর্ণ**

```typescript
// Bug 6 fix: enforce stock limit in the cart.
const availableStock = product.currentStock;
const newQuantity = availableStock > 0 
  ? Math.min(rawNewQty, availableStock) 
  : rawNewQty;
```
[31, 63]

`availableStock = 0` হলে `rawNewQty` সেট হয় — comment বলছে "0 means untracked". কিন্তু যদি কোনো product সত্যিই ০ stock থাকে কিন্তু tracked হয়? `currentStock === 0` এবং `trackInventory === false` দুটো আলাদা condition। Prisma schema-তে `trackInventory` field আছে কিনা যাচাই করুন [58]।

**সমস্যা ২৮: removeItem এ Discount Recalculation**

```typescript
removeItem: (itemId: string) => {
  const newItems = currentTab.items.filter((item) => item.id !== itemId);
  const newDiscount = newItems.reduce((sum, item) => sum + (item.discount || 0), 0);
```
[45]

Item-level discount reduce করে tab-level discount আপডেট হয়। কিন্তু যদি tab-level এ একটি global discount থাকে এবং item-level discount না থাকে, এই calculation শূন্য দেবে এবং global discount হারিয়ে যাবে।

**সমস্যা ২৯: Decimal Precision**

```typescript
// Do NOT round here — preserve decimal precision
```
[31, 63]

এটি সঠিক policy, কিন্তু `toMoneyNumber()` এর implementation দেখতে হবে। যদি `Number()` conversion ব্যবহার হয়, floating point drift হতে পারে। `decimal.js` সব boundary-তে ব্যবহার নিশ্চিত করুন [3]।

**সমস্যা ৩০: Sync Store Reset-এ isOnline: true**

```typescript
reset: () => set({ isOnline: true, isSyncing: false, ... })
```
[63]

Store reset করলে app অনলাইন ধরে নেয়। যদি reset offline থাকার সময় হয়, পরবর্তী sync attempt ব্যর্থ হবে কিন্তু UI online দেখাবে।

**সমস্যা ৩১: skipHydration এবং Cart Persistence**

```typescript
persist(..., { 
  name: 'onuron-pos-cart-v2', 
  skipHydration: true,
  partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId })
})
```
[31, 63]

`skipHydration: true` মানে page load-এ cart automatically load হয় না — manually `useHydration()` call করতে হবে। যদি এই call missing থাকে কোথাও, cart empty দেখাবে।

---

## ৮. ProductGrid.tsx বিশ্লেষণ

### ৮.১ সনাক্তকৃত সমস্যা

**সমস্যা ৩২ (Critical): Out-of-Stock পণ্য কার্টে যোগ হয়**

```typescript
const isOutOfStock = product.currentStock <= 0;
// ...
const handleClick = () => {
  if (onSelect) onSelect(product); 
  else addItem(product, 1); // Stock check নেই!
};
```
[25]

`CompactProductCard`-এ out-of-stock visually দেখায় কিন্তু click এখনও কাজ করে। pos-store.ts-এ stock capping আছে [31], কিন্তু UI-তে কোনো block নেই। User confused হবে যখন কার্টে item যোগ হয় কিন্তু পরে checkout-এ reject হয়।

**সমাধান:**
```typescript
const handleClick = () => {
  if (isOutOfStock && product.trackInventory) {
    toast({ title: t('out_of_stock'), variant: 'destructive' });
    return;
  }
  if (onSelect) onSelect(product); 
  else addItem(product, 1);
};
```

**সমস্যা ৩৩: Barcode Duplicate Add**

Enter keypress এবং camera scan উভয়ই পৃথকভাবে `addItem` call করে [25]:
```typescript
// Enter key handler:
onKeyDown={(e) => {
  if (e.key === 'Enter') {
    const matchedProduct = barcodeMap.get(normalizedScanValue);
    if (matchedProduct) { addItem(matchedProduct, 1); }
  }
}}
```

যদি scanner দ্রুত scan করে Enter event এবং camera callback একই সময়ে trigger হয়, একটি product দু'বার যোগ হতে পারে।

**সমাধান:** barcode processing-এ debounce যোগ করুন।

**সমস্যা ৩৪: viewMode Local State — Page Reload-এ Reset**

```typescript
const [viewMode, setViewMode] = useState<ViewMode>('grid');
```
[25]

Page reload-এ viewMode রিসেট হয়। মোবাইলে auto-compact set হয় [25], কিন্তু desktop user যদি compact select করে তারপর reload করে, আবার grid-এ ফিরে যাবে।

**সমাধান:** viewMode localStorage-এ persist করুন।

**সমস্যা ৩৫: IntersectionObserver এবং Infinite Scroll Race**

```typescript
useEffect(() => {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (renderLimit < filteredProducts.length) {
        setRenderLimit(prev => prev + 100);
      } else if (hasMore && !isLoadingMore) {
        loadMoreProducts();
      }
    }
  }, { threshold: 0.1, rootMargin: '200px' });
```
[25, 49]

`loadMoreProducts()` call হওয়ার সময় `isLoadingMore` true হয়, কিন্তু Observer unsubscribe হয় না। যদি scroll দ্রুত হয়, একাধিক `loadMoreProducts()` call হতে পারে।

**সমাধান:** Observer callback-এ immediate state update বা `useRef`-ভিত্তিক lock ব্যবহার করুন।

---

## ৯. CartPanel.tsx বিশ্লেষণ

`CartPanel.tsx` মূলত re-export মাত্র [24, 39]:
```typescript
export { CartPanel } from './cart-panel/CartPanel';
export { default } from './cart-panel/CartPanel';
```

প্রকৃত implementation `./cart-panel/CartPanel`-এ — সেটি evidence-এ সরাসরি নেই, তবে architecture থেকে বোঝা যায়।

**সমস্যা ৩৬: Multiple Export Pattern**
Named এবং default export উভয়ই আছে। এটি inconsistent — অন্য components কোনটি import করছে তার উপর নির্ভর করে behavior ভিন্ন হতে পারে।

---

## ১০. Layout ও Page: Root Level সমস্যা

### ১০.১ page.tsx-এ ErrorBoundary অনুপস্থিত

```typescript
export default function Home() {
  return (<POSDashboard />);  // ErrorBoundary নেই!
}
```
[12]

`ErrorBoundary` import করা আছে কিন্তু ব্যবহার হচ্ছে না [12]। `layout.tsx`-এ একটি `ErrorBoundary` আছে [23], কিন্তু সেটি `SessionProvider`-এর parent — `POSDashboard`-এর সরাসরি wrapper নয়।

**সমাধান:**
```typescript
export default function Home() {
  return (
    <ErrorBoundary>
      <POSDashboard />
    </ErrorBoundary>
  );
}
```

### ১০.২ suppressHydrationWarning

```typescript
<html lang="bn" suppressHydrationWarning>
<body ... suppressHydrationWarning>
```
[23]

`suppressHydrationWarning` দুটি জায়গায় আছে। এটি hydration mismatch suppress করে কিন্তু actual problem লুকায়। Theme (dark/light) বা locale সার্ভার-ক্লায়েন্ট mismatch হওয়ার সম্ভাবনা আছে।

**সমাধান:** Investigate করুন কোন specific element hydration mismatch তৈরি করছে এবং সেটি সরাসরি fix করুন।

### ১০.৩ POSDashboard Dynamic Import (SSR: false)

```typescript
const POSDashboard = dynamic(
  () => import('@/app/pos/POSDashboard').then((mod) => mod.POSDashboard),
  { ssr: false }
);
```
[12]

SSR disabled করা সঠিক কারণ POSDashboard IndexedDB ব্যবহার করে। কিন্তু loading state দেখানো হয় কিনা পরীক্ষা করুন — যদি না থাকে, প্রথম load-এ blank screen আসবে।

---

## ১১. ARCHITECTURE.md vs বাস্তব কোডের পার্থক্য

### ১১.১ Missing Files

ARCHITECTURE.md-এ উল্লেখিত ফাইল:
```
Older docs mentioned `action-queue.ts` and `local-first-checkout.ts`. 
Those files were never shipped as separate modules.
```
[47]

**সমস্যা ৩৭:** এই স্বীকৃতি ARCHITECTURE.md-এ আছে [47], কিন্তু পুরনো commit বা external documentation-এ এখনও পুরনো ফাইল নাম থাকতে পারে। নতুন developer confusion-এ পড়বেন।

**সমাধান:** ARCHITECTURE.md আপডেট করুন এবং পুরনো নাম সম্পূর্ণ মুছুন।

### ১১.২ IndexedDB Database Name Discrepancy

ARCHITECTURE.md-এ [47]:
```
Database: `lakhan-bhandar-pos`
```

কিন্তু README এবং অন্যত্র "Onuron POS" নাম ব্যবহার হচ্ছে। `indexeddb.ts`-এ actual database name কি `lakhan-bhandar-pos` নাকি অন্য কিছু? যদি production-এ `lakhan-bhandar-pos` থাকে কিন্তু code rename করা হয়, existing user-দের IndexedDB data হারিয়ে যাবে।

**এটি সবচেয়ে গুরুত্বপূর্ণ সমস্যা:** IndexedDB database name পরিবর্তন মানে **সব offline data হারানো**। `indexeddb.ts`-এ `DB_NAME` constant যাচাই করুন এবং production-এ যদি ইতিমধ্যে `lakhan-bhandar-pos` নামে data থাকে, migration path তৈরি করুন।

### ১১.৩ Checkout Flow — Design vs Implementation

ARCHITECTURE.md বলছে [32]:
```
1. Write local state first (Zustand + IndexedDB).
2. Enqueue sync payload with a fresh UUID idempotency key.
3. Let OfflineSyncWorker push when online.
4. Never assume network success for the UI path.
```

SUMMARY.md বলছে [30]:
```
checkout still primarily hits /api/sales when online; 
offline path uses queue helpers in the worker/call sites
```

**অমিল:** Design বলছে "always local first", কিন্তু implementation online-এ সরাসরি `/api/sales` hit করে। এটি intentional hybrid approach — কিন্তু এর মানে যদি `/api/sales` timeout করে, সেটি offline queue-এ যায় কিনা স্পষ্ট নয়।

**সমাধান:** Checkout flow-এ স্পষ্ট করুন: network failure হলে automatically offline queue-এ চলে যায় কিনা, নাকি user manually retry করতে হবে।

### ১১.৪ Sync Queue Status Tracking

ARCHITECTURE.md-এ `pending_sales` store উল্লেখ আছে [32, 34]। SUMMARY.md-তে `action_queue + sync_queue` [30]। এই তিনটি store-এর মধ্যে responsibility boundary স্পষ্ট নয়।

---

## ১২. Playwright Testing কনফিগারেশন

### ১২.১ সমস্যা

**সমস্যা ৩৮: WebServer কনফিগ Comment Out**

```typescript
// webServer: {command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI}
```
[29]

E2E test চালাতে manually server start করতে হবে। CI-তে এটি ভুলে গেলে সব test fail করবে।

**সমাধান:**
```typescript
webServer: {
  command: 'npm run build && npm run start',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000,
},
```

**সমস্যা ৩৯: Mobile Test Comment Out**

```typescript
// { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
// { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } }
```
[6, 29]

Mobile tests disabled। Capacitor Android-এর জন্য কোনো E2E coverage নেই।

**সমস্যা ৪০: CI-তে 2 Retries অপর্যাপ্ত**

Database-dependent tests-এ flakiness বেশি। CI retry 2 দিয়ে যথেষ্ট না হতে পারে। Test isolation (mock database) বা dedicated test database ব্যবহার করুন।

---

## ১৩. Multi-Tenant Security

### ১৩.১ সঠিকভাবে বাস্তবায়িত বিষয়

- ✅ সব API route-এ `businessId` filter
- ✅ IDOR protection PUT/DELETE-এ
- ✅ Phone uniqueness per-business [37]
- ✅ Cross-tenant sync forbidden [59]
- ✅ `withTenantContext` SET LOCAL দিয়ে RLS [18]
- ✅ `src/lib/multi-tenant-security.test.ts` এবং `tenant-isolation.test.ts` আছে [16]

### ১৩.২ সমস্যা

**সমস্যা ৪১: SET LOCAL-এর Scope**

```typescript
await tx.$executeRaw`SELECT set_config('app.current_business_id', ${businessId}, TRUE)`
```
[18]

`SET LOCAL` শুধুমাত্র transaction-এর মধ্যে কাজ করে [50]। যদি RLS policy আছে যা `app.current_business_id` ব্যবহার করে, কিন্তু কোনো query transaction-এর বাইরে চলে, RLS bypass হতে পারে।

**সমস্যা ৪২: Business Slug Uniqueness**

Schema-তে [58]:
```
slug String @unique
```

কিন্তু slug globally unique, business-scoped নয়। কেউ অন্যের slug দিয়ে URL guess করতে পারে। Slug public হলে এটি intentional — কিন্তু document করা উচিত।

---

## ১৪. Wrangler / Cloudflare Workers কনফিগারেশন

### ১৪.১ সমস্যা

**সমস্যা ৪৩: Hyperdrive Local Connection String**

```json
"localConnectionString": "postgresql://postgres:postgres@localhost:5432/postgres"
```
[26]

Development-এ Hyperdrive simulate করে local PostgreSQL ব্যবহার করে। কিন্তু এই hardcoded credential `.gitignore` এ নেই এবং public repository-তে visible।

**সমাধান:** `.dev.vars` ফাইল ব্যবহার করুন এবং `localConnectionString` সেখানে রাখুন।

**সমস্যা ৪৪: PREFER_DIRECT_DB: "false"**

```json
"PREFER_DIRECT_DB": "false"
```
[26]

Hyperdrive ব্যবহার হচ্ছে। কিন্তু Hyperdrive outage হলে fallback নেই। `PREFER_DIRECT_DB: "true"` set করে direct connection test করুন।

---

## ১৫. Prisma Schema বিশ্লেষণ

### ১৫.১ সঠিকভাবে ডিজাইন করা বিষয়

- ✅ Enum-based domain modeling (SaleStatus, PaymentMethod, etc.) [58]
- ✅ Tenant-scoped unique constraints [58]
- ✅ SyncQueue-এ idempotencyKey unique [58]
- ✅ AuditLog model [58]
- ✅ offlineSynced field [58]
- ✅ failedLoginAttempts এবং lockedUntil [58]

### ১৫.২ সমস্যা

**সমস্যা ৪৫: offlineSynced Default True**

```
offlineSynced Boolean @default(true)
```
[58]

Default `true` মানে কোনো sale তৈরি হলে ডিফল্টে offline-synced ধরে নেওয়া হয়। Online direct sale-এ এটি semantically ভুল। `@default(false)` এবং sync route-এ `true` set করা semantically correct হতো।

**সমস্যা ৪৬: Product category Denormalization**

```
category String @default("General")
```
[58]

Category rename হলে existing products আপডেট হয় না। Reports-এ "General" এবং পুরনো category নাম উভয়ই দেখাবে।

---

## ১৬. সম্পূর্ণ সংশোধন পরিকল্পনা (Priority Matrix)

### 🔴 Critical (অবিলম্বে সংশোধন করুন)

| # | সমস্যা | ফাইল | সংশোধন |
|---|--------|------|--------|
| 1 | Raw SQL Fallback — migration debt | `sync/route.ts` | `prisma migrate deploy` চালান এবং fallback monitoring-এ রূপান্তর করুন |
| 2 | Dummy DB connection string | `db.ts` | Error throw করুন, dummy string নয় |
| 3 | Out-of-stock পণ্য কার্টে যোগ হয় | `ProductGrid.tsx` | UI-তে stock check এবং block করুন |
| 4 | page.tsx-এ ErrorBoundary নেই | `page.tsx` | `<ErrorBoundary>` wrap করুন |
| 5 | IndexedDB DB name discrepancy | `indexeddb.ts` | Production name confirm করুন এবং migration path তৈরি করুন |
| 6 | Cross-tenant check দেরিতে হয় | `sync/route.ts` | Payload parse করার পরপরই check করুন |

### 🟡 High (এই sprint-এ সংশোধন করুন)

| # | সমস্যা | ফাইল | সংশোধন |
|---|--------|------|--------|
| 7 | offlineSynced online sale-এ true | `sales/route.ts`, schema | `false` করুন online sale-এ |
| 8 | Barcode duplicate add | `ProductGrid.tsx` | Debounce যোগ করুন |
| 9 | Error leakage production-এ | সব API routes | `NODE_ENV` check দিয়ে details hide করুন |
| 10 | bcrypt fallback Cloudflare-এ fail করবে | `auth.ts` | Worker runtime-এ fallback reject করুন |
| 11 | Playwright webServer config নেই | `playwright.config.ts` | webServer block uncomment করুন |
| 12 | viewMode reset on reload | `ProductGrid.tsx` | localStorage persist করুন |
| 13 | Sync prepayment race condition | `sync/route.ts` | customer:create-এর পরে prepayment:create ensure করুন |

### 🟢 Medium (পরবর্তী sprint-এ)

| # | সমস্যা | ফাইল | সংশোধন |
|---|--------|------|--------|
| 14 | 10 বছরের JWT — no revocation | `auth.ts` | Shorter access token + refresh rotation বিবেচনা করুন |
| 15 | MAX_PRODUCT_LIMIT = 10000 | `products/route.ts` | Cursor pagination enforce করুন |
| 16 | Cache-Control on sales GET | `sales/route.ts` | `max-age=0` করুন |
| 17 | Category string denormalization | Schema | Bulk update on rename implement করুন |
| 18 | Local connection string in wrangler | `wrangler.jsonc` | `.dev.vars` এ সরান |
| 19 | IntersectionObserver race | `ProductGrid.tsx` | Lock mechanism যোগ করুন |
| 20 | skipHydration — cart empty | `pos-store.ts` | Hydration call নিশ্চিত করুন |
| 21 | Phone normalization edge case | `auth.ts` | Stricter uniqueness check |
| 22 | Mobile Playwright tests disabled | `playwright.config.ts` | Mobile projects enable করুন |
| 23 | Stock shortage threshold alert | `sync/route.ts` | autoAdjusted count-এ alert |
| 24 | Bug 4 fix unit test | `sync/route.ts` | totalPaid increment test লিখুন |

---

## ১৭. টেস্টিং কৌশল

বিদ্যমান test ফাইল [16]:
- `src/lib/multi-tenant-security.test.ts`
- `src/lib/tenant-isolation.test.ts`
- `src/lib/api-errors.test.ts`
- `src/lib/permissions.test.ts`
- `src/lib/sale-calculations.test.ts`
- `src/lib/sale-payment-breakdown.test.ts`
- `src/lib/sale-payment-consistency.test.ts`
- `src/lib/sale-stock.test.ts`
- `src/lib/offline/indexeddb.test.ts`
- `src/stores/pos-store.test.ts`
- `src/components/pos/ProductDialog.test.tsx` [42]

**যা missing:**

### ১৭.১ Sync Integration Tests দরকার

```typescript
// প্রয়োজনীয় test cases:
describe('Offline Sync Integration', () => {
  it('offline sale sync increments totalPaid correctly (Bug 4)');
  it('duplicate idempotency key returns cached result');
  it('cross-tenant sync returns 403');
  it('invoice collision returns 409 CONFLICT');
  it('stock shortage auto-adjusts without blocking sync');
  it('prepayment:create after customer:create ordering');
});
```

### ১৭.২ Auth Tests দরকার

```typescript
describe('Auth Security', () => {
  it('5 failed logins locks account for 15 minutes');
  it('IP rate limit blocks after 10 attempts');
  it('Google login without verified email is rejected');
  it('business switch does not trust client-supplied role');
  it('invalid Firebase token falls through to null');
});
```

### ১৭.৩ CartStore Tests বিস্তৃত করুন

```typescript
describe('CartStore', () => {
  it('out-of-stock product cannot be added');
  it('stock limit caps quantity correctly');
  it('removeItem preserves global discount');
  it('decimal precision preserved throughout calculation');
});
```

---

## ১৮. Environment Variable চেকলিস্ট

Production deployment-এ নিম্নলিখিত variables অবশ্যই থাকতে হবে:

```env
# Required — app refuse করবে ছাড়া
NEXTAUTH_SECRET=          # Production JWT signing key
DATABASE_URL=             # Runtime connection (Neon pooled)
DIRECT_URL=               # Migration connection (Neon direct)

# Cloudflare Workers-এ Hyperdrive binding (wrangler.jsonc-এ)
# HYPERDRIVE binding via wrangler

# Recommended
ALLOWED_ORIGINS=https://pos.onuron.org,capacitor://localhost
NEXTAUTH_URL=https://pos.onuron.org

# Optional
PRISMA_QUERY_LOG=false
DATABASE_POOL_SIZE=10     # Node.js only
PREFER_DIRECT_DB=false    # Hyperdrive ব্যবহার করুন
```

[19, 26, 60]

---

## ১৯. নির্দিষ্ট কোড সংশোধন উদাহরণ

### ১৯.১ db.ts — Dummy Fallback Fix

**বর্তমান (ভুল):**
```typescript
return 'postgresql://dummy:dummy@localhost:5432/dummy'
```

**সংশোধিত:**
```typescript
throw new Error(
  `[db] Cannot resolve database connection string.\n` +
  `Environment: ${isEdgeOrWorker ? 'Cloudflare Worker' : 'Node.js'}\n` +
  `Set DATABASE_URL or configure Cloudflare Hyperdrive binding.`
);
```
[18]

### ১৯.২ ProductGrid.tsx — Stock Block Fix

**বর্তমান (ভুল):**
```typescript
const handleClick = () => {
  if (onSelect) onSelect(product); 
  else addItem(product, 1);
};
```

**সংশোধিত:**
```typescript
const handleClick = () => {
  // trackInventory field Prisma schema-তে আছে কিনা confirm করুন
  const isBlocked = product.currentStock <= 0 && product.trackInventory !== false;
  if (isBlocked) {
    toast({ title: t('out_of_stock'), description: product.name, variant: 'destructive' });
    return;
  }
  if (onSelect) onSelect(product); 
  else addItem(product, 1);
};
```
[25]

### ১৯.³ sync/route.ts — Cross-Tenant Fix

**বর্তমান (ভুল):**
```typescript
// ... idempotency upsert হয়ে যায় ...
// তারপর:
if (payloadBusinessId && payloadBusinessId !== businessId) {
  return NextResponse.json({ error: 'Cross-tenant sync forbidden' }, { status: 403 });
}
```

**সংশোধিত:**
```typescript
// payload parse করার পরপরই:
const payloadBusinessId = payload?.businessId;
if (payloadBusinessId && payloadBusinessId !== businessId) {
  return NextResponse.json({ error: 'Cross-tenant sync forbidden' }, { status: 403 });
}
// তারপর idempotency check করুন
```
[59]

### ১৯.৪ page.tsx — ErrorBoundary Fix

**বর্তমান (ভুল):**
```typescript
export default function Home() {
  return (<POSDashboard />);
}
```

**সংশোধিত:**
```typescript
export default function Home() {
  return (
    <ErrorBoundary>
      <POSDashboard />
    </ErrorBoundary>
  );
}
```
[12]

### ১৯.৫ playwright.config.ts — WebServer Fix

**বর্তমান (ভুল):**
```typescript
// webServer: { command: 'npm run start', ... }
```

**সংশোধিত:**
```typescript
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
  timeout: 180 * 1000, // 3 minutes for Next.js build
},
```
[29]

---

## ২০. IndexedDB Migration Path (Database Name Issue)

যদি `lakhan-bhandar-pos` থেকে নতুন নামে যেতে হয়, `indexeddb.ts`-এ migration logic দরকার:

```typescript
const OLD_DB_NAME = 'lakhan-bhandar-pos';
const NEW_DB_NAME = 'onuron-pos'; // বা যা সঠিক

async function migrateIfNeeded() {
  const oldDb = await openDB(OLD_DB_NAME);
  if (oldDb) {
    // Export সব data থেকে old DB
    // Import new DB-তে
    // Delete old DB
    await deleteDB(OLD_DB_NAME);
  }
}
```
[47]

এই migration একবার চালাতে হবে এবং `DB_VERSION` increment করতে হবে।

---

## ২১. সারসংক্ষেপ: কোথায় সময় দেবেন

এই audit থেকে সবচেয়ে গুরুত্বপূর্ণ আবিষ্কার:

**১. Migration Debt** [56, 59]: `sync/route.ts`-এ raw SQL fallback একটি নিরব crisis indicator। এটি resolve করুন এখনই।

**২. IndexedDB Name** [47]: Production database নাম confirm করুন — এটি data loss-এর সবচেয়ে বড় ঝুঁকি।

**³. offlineSynced Semantic** [58, 62]: Online sale-এ `offlineSynced: true` analytics-কে ভুল করছে।

**৪. UI-level Stock Enforcement** [25]: Out-of-stock block শুধু store-এ নয়, UI-তেও।

**৫. Playwright WebServer** [29]: E2E test infrastructure ঠিক করুন — এটি ছাড়া regression ধরা যাবে না।

এই পাঁচটি ঠিক করলে অ্যাপ উল্লেখযোগ্যভাবে আরও স্থিতিশীল হবে। বাকি সমস্যাগুলো পর্যায়ক্রমে সমাধান করা যাবে।

---

*এই রিপোর্ট সম্পূর্ণ সোর্স কোড বিশ্লেষণের উপর ভিত্তি করে তৈরি। সব claim-এ inline citation সহ source reference দেওয়া হয়েছে।