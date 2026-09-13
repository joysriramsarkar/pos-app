হ্যাঁ। তোমার বর্তমান `pos-app`-কে এই দিকে নেওয়া **একেবারেই সম্ভব**—এবং আমার মতে নতুন করে POS বানানোর দরকার নেই। বরং বর্তমান অ্যাপটাকে **single-store POS → multi-tenant POS SaaS** হিসেবে রূপান্তর করাই সঠিক পথ।

আমি তোমার repository-টা দেখে বলছি: এখনকার অ্যাপের ভিত্তিটা মোটেই খারাপ নয়। এতে Next.js 16, PostgreSQL/Prisma, NextAuth, offline-first IndexedDB sync, RBAC, inventory, sales, ledger, audit log ইত্যাদি ইতিমধ্যে আছে।

কিন্তু সবচেয়ে বড় architectural পরিবর্তন হবে:

> **এখন:** `User → Products/Sales/Customers`
> **তখন:** `User → Membership → Business/Tenant → Products/Sales/Customers`

অর্থাৎ **একটা অ্যাপ, একটা backend, একটা database infrastructure—কিন্তু হাজার হাজার আলাদা দোকানের data logically এবং cryptographically আলাদা।**

---

# ১. আসলে তুমি কী বানাতে চাইছ

ধরো তিনজন দোকানদার:

* রহিম — `Rahim Grocery`
* করিম — `Karim Electronics`
* জয় — `Joy Fashion`

তিনজনই একই app ব্যবহার করবে।

Rahim login করলে:

```text
Rahim
 └── Rahim Grocery
      ├── Products
      ├── Customers
      ├── Sales
      ├── Purchases
      ├── Inventory
      ├── Expenses
      └── Reports
```

Karim login করলে:

```text
Karim
 └── Karim Electronics
      ├── Products
      ├── Customers
      ├── Sales
      ├── Purchases
      ├── Inventory
      └── Reports
```

এবং **Rahim কখনো Karim-এর কোনো row দেখতে পারবে না।**

এটাই হলো **multi-tenancy**।

এটা শুধু UI-তে দোকানের নাম দেখানো নয়। Database level-এ isolation করতে হবে। OWASP-ও cross-tenant data leakage-কে multi-tenant application-এর প্রধান ঝুঁকিগুলোর একটি হিসেবে চিহ্নিত করে। ([OWASP Cheat Sheet Series][1])

---

# ২. সবচেয়ে গুরুত্বপূর্ণ সিদ্ধান্ত: Tenant কী?

আমি তোমার ক্ষেত্রে `Business`/`Organization`-কে tenant হিসেবে ব্যবহার করব।

Schema হবে মোটামুটি:

```text
User
 │
 │ membership
 ▼
Business
 │
 ├── Products
 ├── Categories
 ├── Customers
 ├── Suppliers
 ├── Sales
 ├── SaleItems
 ├── Purchases
 ├── Expenses
 ├── StockHistory
 ├── Settings
 ├── AuditLogs
 └── SyncQueue
```

একজন user একাধিক business-এর member-ও হতে পারে।

যেমন:

```text
User: joy
    │
    ├── Business A: Joy Grocery
    │      role = OWNER
    │
    └── Business B: Joy Electronics
           role = MANAGER
```

এই design ভবিষ্যতের জন্য অনেক বেশি শক্তিশালী।

---

# ৩. বর্তমান database-এর সবচেয়ে বড় সমস্যা

তোমার বর্তমান schema-তে যেমন:

```prisma
model Product {
  id           String @id
  name         String
  sellingPrice Decimal
  ...
}
```

এখানে `Product` কোন দোকানের সেটা বলা নেই।

একইভাবে:

```prisma
model Customer
model Sale
model Purchase
model Supplier
model Category
model Setting
model SyncQueue
model User
```

ইত্যাদিও global।

তাই প্রথম কাজ:

## প্রত্যেক tenant-owned table-এ `businessId` যোগ করা।

উদাহরণ:

```prisma
model Product {
  id         String @id @default(cuid())
  businessId String @map("business_id")

  name          String
  nameBn        String?
  categoryId    String?
  buyingPrice   Decimal
  sellingPrice  Decimal
  currentStock  Decimal @default(0)

  business Business @relation(
    fields: [businessId],
    references: [id],
    onDelete: Cascade
  )

  @@index([businessId])
  @@index([businessId, name])
  @@index([businessId, isActive])
}
```

এবার:

```text
Product #1
businessId = SHOP_A

Product #2
businessId = SHOP_B
```

---

# ৪. নতুন মূল schema

আমি এই structure-টা recommend করব।

## Business

```prisma
model Business {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique

  phone       String?
  email       String?
  address     String?

  currency    String   @default("INR")
  timezone    String   @default("Asia/Kolkata")

  isActive    Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships Membership[]
  products    Product[]
  customers   Customer[]
  suppliers   Supplier[]
  sales       Sale[]
  purchases   Purchase[]
}
```

---

# ৫. User আর Business এক জিনিস হবে না

এটা খুব গুরুত্বপূর্ণ।

বর্তমানে তোমার:

```prisma
User {
   username
   password
   role
}
```

এভাবে role user-এর মধ্যে রাখা আছে।

Multi-tenant SaaS-এ সেটা ভুল design হবে।

কারণ একই user:

```text
Business A → OWNER
Business B → CASHIER
```

হতে পারে।

তাই:

```prisma
model User {
  id           String @id @default(uuid())

  phone        String? @unique
  email        String? @unique
  username     String? @unique

  passwordHash String?

  name         String

  memberships Membership[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

তারপর:

```prisma
enum BusinessRole {
  OWNER
  ADMIN
  MANAGER
  CASHIER
  VIEWER
}

model Membership {
  id         String       @id @default(uuid())

  userId     String
  businessId String

  role       BusinessRole

  isActive   Boolean @default(true)

  user       User     @relation(fields: [userId], references: [id])
  business   Business @relation(fields: [businessId], references: [id])

  @@unique([userId, businessId])
  @@index([businessId])
}
```

এটাই আসল multi-tenant foundation।

---

# ৬. Login system কেমন হবে?

তুমি যেটা বলেছ:

> ফোন নাম্বার / user ID / password / OTP

আমি চারটা authentication method রাখতে বলব।

### Option A

```text
Phone number
+
Password
```

### Option B

```text
Username
+
Password
```

### Option C

```text
Phone
+
OTP
```

### Option D

```text
Email
+
Password
```

কিন্তু **সবকিছুকে একই User account-এর identity হিসেবে ধরতে হবে।**

---

# ৭. Password কখনো plaintext-এ রাখবে না

বর্তমানে তোমার schema-তে:

```prisma
password String
```

আছে।

Production-এ এটা:

```prisma
passwordHash String?
```

হওয়া উচিত।

Password hash:

* Argon2id
* অথবা bcrypt

ব্যবহার করতে পারো।

আমি নতুন implementation হলে **Argon2id** নিতাম।

---

# ৮. OTP আলাদা table

```prisma
model OtpCode {
  id         String   @id @default(uuid())

  userId     String?
  phone      String

  codeHash   String

  purpose    OtpPurpose

  expiresAt  DateTime
  consumedAt DateTime?

  attempts   Int @default(0)

  createdAt  DateTime @default(now())

  @@index([phone, purpose])
}

enum OtpPurpose {
  LOGIN
  SIGNUP
  PHONE_VERIFICATION
  PASSWORD_RESET
}
```

**OTP plaintext database-এ রাখবে না।**

---

# ৯. Registration flow

একজন নতুন দোকানদার app খুলল:

```text
Create account
      ↓
Phone number
      ↓
OTP
      ↓
Name
      ↓
Password অথবা passwordless
      ↓
Create business
```

তারপর:

```text
Business name:
"Rahim Grocery"

Business type:
Grocery

Currency:
INR

GST:
(optional)

Address:
...
```

Backend:

```text
User তৈরি
      ↓
Business তৈরি
      ↓
Membership তৈরি
      ↓
role = OWNER
```

এক transaction-এর মধ্যে।

---

# ১০. তারপর login

ধরো:

```text
Phone: 9876543210
Password: ********
```

Backend authenticate করল।

তারপর server জানবে:

```json
{
  "userId": "usr_123",
  "businessId": "biz_456",
  "role": "OWNER"
}
```

কিন্তু **client-এর পাঠানো `businessId` বিশ্বাস করবে না।**

এটা অত্যন্ত গুরুত্বপূর্ণ।

---

# ১১. এই ভুলটা কখনো করবে না

যেমন:

```http
GET /api/products?businessId=shop_123
```

এবং backend:

```ts
const products = await prisma.product.findMany({
  where: {
    businessId: req.query.businessId
  }
})
```

এটা বিপজ্জনক।

কারণ user লিখতে পারে:

```text
businessId=someone-elses-business
```

এবং data বেরিয়ে যেতে পারে।

OWASP multi-tenant security guidance-এ এই ধরনের cross-tenant access/IDOR-কে গুরুত্বপূর্ণ ঝুঁকি হিসেবে ধরা হয়েছে। ([OWASP Cheat Sheet Series][1])

---

# ১২. সঠিক architecture

Client:

```text
Authorization: Bearer <token>
```

Server:

```text
Token
 ↓
authenticate user
 ↓
find membership
 ↓
resolve business
 ↓
authorize role/permission
 ↓
database query
```

অর্থাৎ:

```text
JWT/session
    ↓
userId
    ↓
membership
    ↓
businessId
```

**Business ID client-এর কথায় নয়, authenticated membership থেকে আসবে।**

---

# ১৩. কিন্তু এখানেও একটা সমস্যা আছে

ধরো developer ভুল করে লিখল:

```ts
prisma.customer.findMany()
```

তাহলে সব দোকানের customer চলে আসবে।

তাই শুধু application-level filtering যথেষ্ট নয়।

এখানেই আসবে:

# PostgreSQL Row Level Security — RLS

এটা আমি তোমার production architecture-এ strongly recommend করব।

AWS-ও pooled multi-tenant PostgreSQL architecture-এ tenant isolation enforce করার জন্য RLS-এর কথা বলে। ([AWS Documentation][2])

---

# ১৪. Database architecture

আমি তোমার জন্য শুরুতে নেব:

```text
ONE PostgreSQL database
        │
        ├── businesses
        ├── users
        ├── memberships
        │
        ├── products
        ├── customers
        ├── sales
        ├── purchases
        └── ...
```

প্রত্যেক tenant table:

```text
business_id
```

ধারণ করবে।

এটাকে বলা যায় pooled/shared-schema multi-tenancy।

AWS-এর terminology-তে এটি pooled model-এর মতো; আলাদা database প্রতি customer দিলে operational complexity দ্রুত বাড়ে। ([Amazon Web Services, Inc.][3])

---

# ১৫. RLS example

ধরো:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

ALTER TABLE products FORCE ROW LEVEL SECURITY;
```

তারপর:

```sql
CREATE POLICY product_tenant_policy
ON products
FOR ALL
USING (
  business_id =
  current_setting('app.current_business_id')::uuid
)
WITH CHECK (
  business_id =
  current_setting('app.current_business_id')::uuid
);
```

তাহলে application যদি ভুল করেও করে:

```sql
SELECT * FROM products;
```

database নিজেই শুধু বর্তমান business-এর products ফেরত দেবে।

`WITH CHECK`-ও গুরুত্বপূর্ণ—নইলে কেউ অন্য business-এর `business_id` দিয়ে row insert করার চেষ্টা করতে পারে। ([OWASP Cheat Sheet Series][1])

---

# ১৬. Request-এর database flow

Production request হবে:

```text
Android / Browser
       │
       ▼
Next.js
       │
       ▼
Auth middleware
       │
       ▼
User authenticated?
       │
       ▼
Membership valid?
       │
       ▼
Business ID resolved
       │
       ▼
BEGIN TRANSACTION
       │
       ▼
SET LOCAL app.current_business_id = '...'
       │
       ▼
Prisma query
       │
       ▼
PostgreSQL RLS
       │
       ▼
Only tenant rows
       │
       ▼
COMMIT
```

`SET LOCAL`/transaction-local context ব্যবহার করা pooled connections-এর ক্ষেত্রে গুরুত্বপূর্ণ, কারণ session state অন্য request-এ leak করা যাবে না। OWASP-ও pooled request paths-এ transaction-local setting-এর বিষয়ে সতর্ক করে। ([OWASP Cheat Sheet Series][1])

---

# ১৭. শুধু Products নয়

এই সব table tenant-scoped হবে:

```text
products
categories
customers
suppliers

sales
sale_items
sale_returns
sale_return_items

purchases
purchase_items

stock_history
ledger_entries

expenses
payments

settings

audit_logs

sync_queue
```

তোমার বর্তমান schema-তে এই domain model-এর অনেকটাই ইতিমধ্যে আছে।

---

# ১৮. বিশেষভাবে `Setting` বদলাতে হবে

বর্তমানে:

```prisma
model Setting {
  id    String @id
  key   String @unique
  value String
}
```

এটা multi-tenant হলে বিপজ্জনক।

কারণ:

```text
currency = INR
store_name = ...
invoice_prefix = ...
```

সব business-এর global হয়ে যাবে।

এটা হবে:

```prisma
model BusinessSetting {
  id         String @id @default(uuid())

  businessId String
  key        String
  value      String

  business Business @relation(...)

  @@unique([businessId, key])
  @@index([businessId])
}
```

---

# ১৯. Invoice number-ও পরিবর্তন করতে হবে

বর্তমানে:

```prisma
invoiceNumber String @unique
```

এটা global।

Multi-business system-এ দুটো দোকানই:

```text
INV-000001
```

ব্যবহার করতে পারে।

তাই:

```prisma
invoiceNumber String
businessId    String

@@unique([businessId, invoiceNumber])
```

অর্থাৎ:

```text
Rahim Grocery
INV-000001

Karim Electronics
INV-000001
```

দুটোই বৈধ।

---

# ২০. Barcode-ও সাবধানে

বর্তমানে:

```prisma
barcode String? @unique
```

এটাও global unique।

কিন্তু দুই দোকানে একই barcode-এর product থাকা সম্পূর্ণ স্বাভাবিক।

তাই:

```prisma
barcode String?
businessId String

@@unique([businessId, barcode])
```

তবে nullable unique constraint PostgreSQL-এ কীভাবে কাজ করবে সেটা migration-এ ঠিকভাবে handle করতে হবে।

---

# ২১. Customer phone-ও global unique রাখা যাবে না

বর্তমানে:

```prisma
phone String? @unique
```

এটা multi-tenant-এর জন্য ভুল।

একই customer:

```text
Rahim Grocery → 9876543210
Karim Store   → 9876543210
```

হতে পারে।

তাই:

```prisma
@@unique([businessId, phone])
```

অথবা phone-কে unique না করে index।

---

# ২২. User-এর ক্ষেত্রে কিন্তু আলাদা

User authentication identity global হবে।

যেমন:

```text
+919876543210
```

একবার User হিসেবে register করবে।

তারপর:

```text
User
 │
 ├── Business A → OWNER
 ├── Business B → MANAGER
 └── Business C → CASHIER
```

এটা ভবিষ্যতে বিশাল সুবিধা দেবে।

---

# ২৩. Role system আরও ভালো করতে হবে

তোমার বর্তমান:

```text
ADMIN
MANAGER
CASHIER
VIEWER
```

ভালো starting point। README-তেও per-permission checks-এর কথা আছে।

কিন্তু SaaS version-এ role হবে **business-specific**।

আর আমি permission system রাখব:

```text
products.view
products.create
products.update
products.delete

sales.create
sales.view
sales.cancel
sales.refund

customers.view
customers.create
customers.update

purchases.create
purchases.view

reports.view
reports.export

settings.view
settings.update

users.invite
users.remove
users.change_role
```

---

# ২৪. Owner role আলাদা

```text
OWNER
ADMIN
MANAGER
CASHIER
VIEWER
```

Owner:

```text
billing
subscription
business deletion
ownership transfer
team management
```

এসব করতে পারবে।

Cashier পারবে:

```text
POS
sales
customer lookup
payment
```

কিন্তু:

```text
business settings
subscription
database export
user deletion
```

পারবে না।

---

# ২৫. Super Admin-ও থাকবে

তুমি SaaS operator হিসেবে আলাদা admin portal পাবে।

```text
/admin
```

এখানে:

```text
Businesses
Users
Subscriptions
Usage
System health
Audit logs
Support
Suspended accounts
```

থাকবে।

কিন্তু খুব গুরুত্বপূর্ণ:

> **তোমার Super Admin যেন customer-এর data অকারণে দেখতে না পারে।**

Support access হলে:

```text
Support session
   ↓
explicit reason
   ↓
temporary access
   ↓
audit log
```

এই ধরনের ব্যবস্থা করাই production-grade।

---

# ২৬. Business onboarding

Landing page:

```text
[ Start Free ]
```

↓

```text
Create account

Phone
[___________]

[Send OTP]
```

↓

```text
Enter OTP
[_ _ _ _ _ _]
```

↓

```text
Create password
```

↓

```text
Create your store

Business name
Business type
Currency
Country
```

↓

```text
Welcome to your POS
```

---

# ২৭. প্রথম login-এর পরে

User-কে সরাসরি empty POS-এ ফেলবে না।

একটা onboarding wizard:

```text
1. Store information       ✓
2. Add first product       ✓
3. Add opening stock       ✓
4. Add payment methods     ✓
5. Configure invoice       ✓
6. Invite staff            ✓
7. Start selling           ✓
```

---

# ২৮. Multiple shops

ভবিষ্যতে:

```text
Joy's Account
      │
      ├── Joy Grocery
      │      ├── Main Branch
      │      └── Station Road
      │
      └── Joy Electronics
```

এখানে একটা নতুন abstraction আসবে:

```text
User
Business
Branch
```

আমি এখন থেকেই schema এমনভাবে রাখতাম যাতে পরে branch যোগ করা যায়।

---

# ২৯. Branch architecture

```prisma
model Branch {
  id         String @id @default(uuid())
  businessId String

  name       String
  code       String

  address    String?
  phone      String?

  business Business @relation(...)

  @@unique([businessId, code])
}
```

তারপর product:

```text
Business
   │
   ├── Branch A
   │      └── stock
   │
   └── Branch B
          └── stock
```

তবে **প্রথম version-এ branch feature না বানালেও চলবে**। Schema future-proof রাখলেই যথেষ্ট।

---

# ৩০. Offline-first অংশটা তোমার বড় advantage

এটা তোমার existing POS-এর খুব গুরুত্বপূর্ণ feature।

README অনুযায়ী বর্তমানে IndexedDB action queue এবং `/api/sync` ভিত্তিক offline sync আছে, সঙ্গে idempotency key-ও আছে।

এটা ফেলে দেবে না।

বরং tenant-aware করতে হবে।

Offline device-এ:

```text
businessId
userId
deviceId
operationId
```

সংরক্ষণ করতে হবে।

---

# ৩১. Offline sync-এর সবচেয়ে বড় security সমস্যা

ধরো:

```text
Device A
Rahim Grocery
```

logout করল।

তারপর Karim login করল।

পুরনো Rahim-এর offline queue যদি sync হয়:

```text
BAD
```

তাই queue-তে থাকতে হবে:

```text
tenant/business ID
user ID
device ID
idempotency key
createdAt
```

এবং server authentication থেকে business resolve করে verify করবে:

```text
queue.businessId === authenticated user's business
```

না হলে:

```text
403
```

---

# ৩২. Device registration

আমি production version-এ device model যোগ করব:

```prisma
model Device {
  id         String @id @default(uuid())

  businessId String
  userId     String?

  name       String
  platform   String
  appVersion String

  lastSeenAt DateTime?
  revokedAt  DateTime?

  createdAt DateTime @default(now())

  @@index([businessId])
}
```

এতে দোকানদার দেখতে পারবে:

```text
My Devices

✓ Main Counter Android
✓ Shop Laptop
✓ Billing PC

[Revoke]
```

---

# ৩৩. Offline POS-এর জন্য এটা খুব গুরুত্বপূর্ণ

ধরো employee-এর ফোন চুরি হলো।

তুমি:

```text
Revoke device
```

করলে ওই device আর sync করতে পারবে না।

এটা production-grade POS-এর জন্য অত্যন্ত দরকারি।

---

# ৩৪. Data migration

এখন সবচেয়ে কঠিন অংশ।

তোমার existing database-এ যদি already data থাকে, সরাসরি:

```sql
ALTER TABLE products ADD business_id ...
```

করলেই হবে না।

প্রথমে একটা default business তৈরি:

```text
Lakhan Bhandar
```

তারপর existing সব records:

```text
business_id = default_business
```

করবে।

তারপর:

```sql
ALTER TABLE products
ALTER COLUMN business_id SET NOT NULL;
```

এইভাবে migration।

---

# ৩৫. Migration sequence

আমি এমন করতাম:

### Migration 1

```text
businesses
memberships
devices
otp_codes
```

যোগ।

### Migration 2

Existing tenant:

```text
Lakhan Bhandar
```

create।

### Migration 3

সব existing tables-এ:

```text
business_id nullable
```

যোগ।

### Migration 4

সব existing rows:

```text
business_id = Lakhan Bhandar
```

### Migration 5

সব foreign key/index।

### Migration 6

```text
business_id NOT NULL
```

### Migration 7

RLS।

### Migration 8

Old global unique constraints পরিবর্তন।

---

# ৩৬. Unique constraints-এর তালিকা

এই জায়গায় তোমার schema-তে অনেক পরিবর্তন লাগবে।

### Product

আগে:

```text
barcode UNIQUE
```

পরে:

```text
business_id + barcode UNIQUE
```

### Customer

আগে:

```text
phone UNIQUE
```

পরে:

```text
business_id + phone UNIQUE
```

### Invoice

আগে:

```text
invoiceNumber UNIQUE
```

পরে:

```text
business_id + invoiceNumber UNIQUE
```

### Category

আগে:

```text
name UNIQUE
```

পরে:

```text
business_id + name UNIQUE
```

---

# ৩৭. API architecture

আমি routes-গুলোও clean করব।

```text
/api/auth/*
/api/business/*
/api/members/*
/api/products/*
/api/customers/*
/api/sales/*
/api/purchases/*
/api/inventory/*
/api/reports/*
/api/settings/*
/api/sync/*
```

প্রত্যেক authenticated route-এর flow:

```ts
const session = await requireAuth();

const membership =
  await requireBusinessMembership(
    session.user.id
  );

const businessId = membership.businessId;
```

তারপর:

```ts
requirePermission(
  membership,
  "products.create"
);
```

তারপর DB।

---

# ৩৮. একটা central middleware বানাও

প্রতিটি route-এ এই জিনিস manually লিখতে চাই না।

যেমন:

```ts
withBusinessContext({
  permission: "products.create"
}, async ({
  user,
  business,
  membership,
  db
}) => {
   ...
});
```

এতে developer ভুল করার সম্ভাবনা কমবে।

---

# ৩৯. সবচেয়ে গুরুত্বপূর্ণ rule

**কখনো client থেকে আসা এই জিনিস authorization হিসেবে ব্যবহার করবে না:**

```text
businessId
userId
role
```

Client বলতে পারে:

```json
{
  "businessId": "victim-business",
  "role": "OWNER"
}
```

এগুলো শুধু input।

Trusted source:

```text
authenticated session
        ↓
server-side membership lookup
        ↓
server-derived businessId + role
```

---

# ৪০. Database-এ defense in depth

আমি তিন স্তরের security রাখব:

```text
                 ┌───────────────┐
                 │ Authentication│
                 └───────┬───────┘
                         ↓
                 ┌───────────────┐
                 │ Authorization │
                 │ RBAC/ACL      │
                 └───────┬───────┘
                         ↓
                 ┌───────────────┐
                 │ PostgreSQL RLS│
                 └───────────────┘
```

অর্থাৎ:

### Layer 1

User কে?

### Layer 2

সে কী করতে পারবে?

### Layer 3

সে কোন business-এর data দেখতে পারবে?

এই তিনটি আলাদা concern।

---

# ৪১. Audit log-ও tenant-aware

বর্তমানে তোমার audit logging আছে।

এটা হবে:

```prisma
model AuditLog {
  id         String @id @default(uuid())

  businessId String?
  userId     String?

  action     String
  entityType String
  entityId   String?

  metadata   Json?

  ipAddress  String?
  userAgent  String?

  createdAt  DateTime @default(now())

  @@index([businessId, createdAt])
  @@index([userId, createdAt])
}
```

উদাহরণ:

```text
12:31 PM
Rahim
CASHIER
SALE_CREATED
INV-00052
₹540
```

অথবা:

```text
Admin
PRODUCT_PRICE_CHANGED
Rice 5kg
₹320 → ₹350
```

---

# ৪২. Financial data-তে soft delete

Sales কখনো সরাসরি:

```sql
DELETE FROM sales
```

করবে না।

বরং:

```text
Completed
    ↓
Cancelled
```

বা:

```text
Completed
    ↓
Refunded
```

তোমার বর্তমান status model ইতিমধ্যে এই ধারণা ব্যবহার করছে।

Production POS-এ auditability অত্যন্ত গুরুত্বপূর্ণ।

---

# ৪৩. Money handling

তোমার existing `decimal.js` ব্যবহারটা রাখো। README-তে decimal-safe money calculation ইতিমধ্যে আছে।

কখনো:

```ts
0.1 + 0.2
```

ধরনের JavaScript floating-point arithmetic-এর ওপর financial calculation ছেড়ে দেবে না।

Database-এ:

```text
DECIMAL / NUMERIC
```

ব্যবহার করো।

---

# ৪৪. Subscription system

যেহেতু তুমি SaaS বানাতে চাইছ, ভবিষ্যতে:

```text
Free
Pro
Business
Enterprise
```

রাখতে পারো।

Schema:

```prisma
enum Plan {
  FREE
  PRO
  BUSINESS
  ENTERPRISE
}

model Subscription {
  id         String @id @default(uuid())
  businessId String @unique

  plan       Plan

  status     String
  startedAt  DateTime
  expiresAt  DateTime?

  business Business @relation(...)
}
```

---

# ৪৫. Free plan-এ কী থাকবে?

প্রথমে আমি টাকা নেওয়ার চিন্তা করতাম না।

যেহেতু তোমার লক্ষ্য সবাইকে ব্যবহার করতে দেওয়া, শুরুতে:

```text
FREE

1 business
1 branch
3 users
1,000 products
5,000 sales/month
basic reports
offline POS
```

এরকম সীমা দিতে পারো।

কিন্তু infrastructure usage-এর ওপর নজর রাখতে হবে।

---

# ৪৬. Abuse prevention

Free মানেই unlimited নয়।

প্রতিটি business-এর:

```text
max users
max products
max sales/month
max storage
max API requests
max devices
```

থাকতে পারে।

এগুলো enforce করবে backend।

Client UI শুধু limitation দেখাবে।

---

# ৪৭. Storage

Product images-এর জন্য database-এ image binary রাখবে না।

ব্যবহার করো:

```text
Object Storage
```

যেমন:

```text
business/
   biz_123/
      products/
      invoices/
      logos/
```

Storage path-ও tenant scoped হবে।

---

# ৪৮. Backup

Production POS-এ backup optional নয়।

কমপক্ষে:

```text
Daily automated backup
Point-in-time recovery
Database snapshots
```

এবং গুরুত্বপূর্ণ:

> backup restore করে মাঝে মাঝে test করতে হবে।

Backup আছে কিন্তু restore হয় না—এমন backup কার্যত backup নয়।

---

# ৪৯. Observability

Production হলে তোমাকে জানতে হবে:

```text
কত business active?
কত sales হচ্ছে?
কোন API slow?
কত sync failure?
কত offline conflict?
কত login failure?
কত 500 error?
```

তাই:

```text
Error tracking
Structured logs
Metrics
Health checks
```

যোগ করো।

---

# ৫০. Health endpoint

```text
/api/health
```

check করবে:

```text
Database ✓
Auth ✓
Storage ✓
Queue ✓
```

---

# ৫১. Rate limiting

বিশেষ করে:

```text
/login
/otp
/password-reset
/api/*
```

rate limit করো।

যেমন OTP:

```text
5 attempts / 15 minutes / phone
```

এর মতো policy।

Exact limits পরে বাস্তব usage দেখে tune করবে।

---

# ৫২. Security headers

Production deployment-এ:

```text
HTTPS
Secure cookies
HttpOnly cookies
SameSite
CSRF protection
CSP
HSTS
X-Content-Type-Options
Referrer-Policy
```

ঠিকভাবে configure করবে।

---

# ৫৩. Session security

Session/token-এ minimum:

```text
userId
```

থাকবে।

Business ID রাখলেও সেটা **authorization-এর একমাত্র source হবে না**।

যদি membership বদলে যায়:

```text
User removed from business
```

তাহলে session stale হয়ে গেলে authorization layer আবার membership check করবে বা session invalidation করবে।

---

# ৫৪. Staff invitation

Owner:

```text
Settings
 → Team
 → Invite member
```

তারপর:

```text
Phone
Role
```

দেবে।

SMS:

```text
You have been invited to Rahim Grocery.
```

User accept করলে:

```text
membership
```

create হবে।

---

# ৫৫. User-এর business switcher

যদি একজন user একাধিক দোকানে থাকে:

```text
┌──────────────────────┐
│ Rahim Grocery     ▼  │
├──────────────────────┤
│ Rahim Grocery        │
│ Rahim Electronics    │
│ + Create business    │
└──────────────────────┘
```

Business change করলে:

```text
active business
```

change হবে।

কিন্তু backend আবার membership validate করবে।

---

# ৫৬. Android app

তোমার বর্তমান Capacitor architecture রাখো।

README অনুযায়ী Android shell deployed Next.js server load করতে পারে এবং barcode scanning-এর জন্য ML Kit ব্যবহার করছে।

Production architecture:

```text
                 ┌──────────────┐
                 │ Next.js SaaS │
                 └──────┬───────┘
                        │
             ┌──────────┴──────────┐
             │                     │
        Web Browser           Android App
                              Capacitor
```

একই backend।

---

# ৫৭. Offline architecture

একটা দোকান internet হারাল:

```text
POS
 ↓
IndexedDB
 ↓
Sale recorded locally
 ↓
Receipt printed
```

Internet ফিরলে:

```text
Sync queue
 ↓
Server
 ↓
Authenticate
 ↓
Validate business
 ↓
Idempotency check
 ↓
Transaction
 ↓
Commit
```

---

# ৫৮. Idempotency অত্যন্ত গুরুত্বপূর্ণ

ধরো:

```text
Sale ₹500
```

offline থেকে sync হলো।

Server response আসার আগেই network কেটে গেল।

Client আবার পাঠাল।

তুমি যদি idempotency না রাখো:

```text
₹500 sale
₹500 sale
```

দুবার তৈরি হবে।

তোমার বর্তমান architecture-এ idempotency key আছে—এটা খুব ভালো foundation।

এটাকে tenant-aware করে শক্ত করতে হবে।

---

# ৫৯. Idempotency schema

```prisma
model IdempotencyKey {
  id         String @id @default(uuid())

  businessId String
  userId     String

  key        String
  endpoint   String

  response   Json?
  statusCode Int?

  createdAt  DateTime @default(now())

  @@unique([businessId, key])
}
```

---

# ৬০. Concurrency

POS-এ এটা অত্যন্ত গুরুত্বপূর্ণ।

দুজন cashier একই product কিনল:

```text
Stock = 1

Cashier A → 1
Cashier B → 1
```

দুজনের sale যেন successful না হয়।

তোমার বর্তমান architecture-এ atomic stock update ইতিমধ্যে আছে। README-তে conditional stock update-এর কথা আছে।

এটা preserve করতে হবে।

---

# ৬১. Multi-tenant migration-এর পরে test

এটা সবচেয়ে গুরুত্বপূর্ণ অংশগুলোর একটি।

ধরো:

```text
Business A
Product A1

Business B
Product B1
```

Test:

```text
User A → Product A1 ✓
User A → Product B1 ✗
User B → Product B1 ✓
User B → Product A1 ✗
```

শুধু GET নয়।

সব:

```text
SELECT
INSERT
UPDATE
DELETE
```

test করতে হবে।

RLS-এর negative tests বিশেষভাবে রাখতে হবে; tenant isolation-কে CI-তে adversarialভাবে পরীক্ষা করা ভালো practice। ([GitHub][4])

---

# ৬২. এমন test লিখবে

```text
tenant-a.test.ts

✓ can read own products
✓ cannot read other tenant products
✓ can create own product
✓ cannot create product for another tenant
✓ can update own product
✓ cannot update another tenant product
✓ can delete own product
✓ cannot delete another tenant product
```

তারপর:

```text
customers
sales
purchases
expenses
settings
audit logs
sync queue
```

সব।

---

# ৬৩. সবচেয়ে ভয়ংকর test

API-তে:

```http
GET /api/products/<TENANT_B_PRODUCT_ID>
```

User A দিয়ে।

Expected:

```text
404
```

অথবা এমন response যা resource existence leak করে না।

এটা **IDOR test**।

---

# ৬৪. Cache-ও tenant-aware হতে হবে

ধরো Redis ব্যবহার করলে:

খারাপ:

```text
products:all
```

ভালো:

```text
business:{businessId}:products
```

আর session cache:

```text
user:{userId}:memberships
```

Tenant isolation শুধু PostgreSQL-এ করলেই হবে না—OWASP explicitly cache/storage/compute boundary-ও consider করতে বলে। ([OWASP Cheat Sheet Series][1])

---

# ৬৫. Search index-ও tenant-aware

ভবিষ্যতে যদি Elasticsearch/Meilisearch/Typesense ব্যবহার করো:

```text
tenantId
```

document-এ অবশ্যই থাকবে।

---

# ৬৬. Queue-ও tenant-aware

Background job:

```json
{
  "businessId": "...",
  "type": "GENERATE_REPORT"
}
```

কিন্তু শুধু businessId পেলেই worker বিশ্বাস করবে না।

Producer এবং authorization path trusted হতে হবে।

OWASP এটাও explicitly সতর্ক করেছে—queued message-এর tenant identifier নিজে authorization proof নয়। ([OWASP Cheat Sheet Series][1])

---

# ৬৭. Reporting architecture

আজকে:

```text
SELECT sales...
```

কাল 10,000 দোকান হলে reporting query heavy হতে পারে।

তখন:

```text
Transactional DB
        ↓
events
        ↓
analytics pipeline
        ↓
reporting tables
```

করতে পারো।

কিন্তু এখনই সেটা বানানোর দরকার নেই।

---

# ৬৮. প্রথমে monolith রাখো

আমি তোমাকে **microservices করতে বলব না।**

এখন:

```text
Next.js
+
Prisma
+
PostgreSQL
+
Object Storage
+
Auth
```

একটা modular monolith হিসেবে রাখো।

কারণ তোমার current scale-এ microservices করলে লাভের চেয়ে operational complexity বাড়বে।

---

# ৬৯. Architecture

আমি মোটামুটি এমন করতাম:

```text
                 Internet
                    │
              Cloudflare/CDN
                    │
             Next.js App
                    │
        ┌───────────┼───────────┐
        │           │           │
       Auth       API        Web UI
        │           │
        │      Business Context
        │           │
        │       RBAC/ACL
        │           │
        │      Tenant Context
        │           │
        └───────────┼───────────┘
                    │
              PostgreSQL
                    │
                  RLS
                    │
       ┌────────────┼────────────┐
       │            │            │
    Storage       Queue       Backups
```

---

# ৭০. তোমার repository structure-ও বদলানো দরকার

বর্তমান codebase বড় হয়ে গেলে সব logic `src/`-এ ছড়িয়ে পড়া কঠিন হবে।

আমি এমন structure নিতাম:

```text
src/
├── app/
│   ├── (auth)/
│   ├── onboarding/
│   ├── pos/
│   ├── settings/
│   └── admin/
│
├── modules/
│   ├── auth/
│   ├── businesses/
│   ├── memberships/
│   ├── products/
│   ├── inventory/
│   ├── sales/
│   ├── purchases/
│   ├── customers/
│   ├── suppliers/
│   ├── reports/
│   ├── billing/
│   └── audit/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── tenant/
│   ├── permissions/
│   ├── security/
│   ├── money/
│   └── offline/
│
└── middleware.ts
```

---

# ৭১. `tenant/` module

এখানে থাকবে:

```text
getCurrentUser()
getCurrentBusiness()
requireMembership()
requirePermission()
withTenantContext()
```

যাতে tenant logic এক জায়গায় থাকে।

---

# ৭২. সবচেয়ে গুরুত্বপূর্ণ abstraction

আমি চাই তোমার codebase-এ একটা central function থাকুক:

```ts
requireBusinessContext()
```

এটা return করবে:

```ts
{
  user,
  business,
  membership,
  role,
  permissions
}
```

তারপর সব protected API এই context ব্যবহার করবে।

---

# ৭৩. Production deployment

শুরুতে:

```text
Vercel / similar
       +
Supabase PostgreSQL
       +
Object Storage
       +
SMS/OTP provider
```

চলবে।

তোমার README-তে Supabase PostgreSQL ইতিমধ্যে architecture-এর অংশ।

তবে production যাওয়ার আগে Supabase-এর service role বা privileged DB credentials যেন user request path-এ RLS bypass না করে—এটা বিশেষভাবে নিশ্চিত করতে হবে। OWASP এ ধরনের privileged/BYPASSRLS path-এর বিরুদ্ধে সতর্ক করে। ([OWASP Cheat Sheet Series][1])

---

# ৭৪. Environment separation

তিনটি environment:

```text
development
staging
production
```

আলাদা database।

কখনো:

```text
local → production DB
```

করবে না।

---

# ৭৫. CI/CD

GitHub:

```text
push
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
RLS tenant isolation tests
 ↓
build
 ↓
deploy staging
 ↓
smoke test
 ↓
production
```

---

# ৭৬. Production-এর আগে অবশ্যই

### Security

* [ ] password hashing
* [ ] OTP hashing
* [ ] brute-force protection
* [ ] rate limiting
* [ ] secure cookies
* [ ] CSRF protection
* [ ] CSP
* [ ] audit logs
* [ ] RLS
* [ ] RBAC
* [ ] tenant isolation tests
* [ ] IDOR tests
* [ ] device revocation

### Database

* [ ] migrations
* [ ] indexes
* [ ] foreign keys
* [ ] unique constraints tenant-aware
* [ ] RLS policies
* [ ] backups
* [ ] restore test

### POS

* [ ] offline sales
* [ ] idempotency
* [ ] stock concurrency
* [ ] refunds
* [ ] returns
* [ ] due
* [ ] prepaid
* [ ] split payments
* [ ] invoice numbering

---

# ৭৭. তোমার existing feature-গুলোর কী হবে?

ভালো খবর হলো, অনেক কিছু নতুন করে বানাতে হবে না।

| বর্তমান   | Multi-tenant version     |
| --------- | ------------------------ |
| Products  | `businessId` যোগ         |
| Inventory | `businessId` যোগ         |
| Customers | `businessId` যোগ         |
| Suppliers | `businessId` যোগ         |
| Sales     | `businessId` যোগ         |
| Purchases | `businessId` যোগ         |
| Ledger    | `businessId` যোগ         |
| Settings  | business-scoped          |
| Audit     | business-scoped          |
| Sync      | business + device scoped |
| RBAC      | membership-scoped        |
| NextAuth  | global user identity     |
| Offline   | tenant-aware             |
| Android   | একই backend              |
| Reports   | business-scoped          |

অর্থাৎ **তোমার বর্তমান POS-এর business logic-এর বড় অংশ reuse করা যাবে।**

---

# ৭৮. আমি development order এভাবে করতাম

এটাই সবচেয়ে গুরুত্বপূর্ণ।

## Phase 0 — Freeze

বর্তমান working version-এর একটা tag:

```text
v0.1-single-store
```

করো।

তারপর নতুন branch:

```text
feat/multi-tenant
```

---

## Phase 1 — Tenant foundation

প্রথমে শুধু:

```text
Business
User
Membership
```

বানাও।

তারপর existing User model migrate করো।

---

## Phase 2 — Authentication

Implement:

```text
phone login
username login
password
OTP
password reset
session
logout
```

---

## Phase 3 — Tenant migration

সব domain table-এ:

```text
businessId
```

যোগ।

Existing data migrate।

---

## Phase 4 — Tenant middleware

```text
requireAuth()
requireBusiness()
requirePermission()
```

বানাও।

সব API migrate করো।

---

## Phase 5 — RLS

প্রথমে:

```text
products
customers
sales
```

তারপর বাকি সব।

---

## Phase 6 — Isolation testing

এখানে থামবে।

দুই tenant বানাবে:

```text
Tenant A
Tenant B
```

এবং automated attack tests চালাবে।

---

## Phase 7 — Onboarding

```text
Signup
OTP
Create business
Setup wizard
```

---

## Phase 8 — Team management

```text
Invite employee
roles
permissions
remove employee
device management
```

---

## Phase 9 — Offline multi-tenancy

```text
business-aware IndexedDB
business-aware sync
device identity
idempotency
conflict handling
```

---

## Phase 10 — Production infrastructure

```text
backup
monitoring
logging
rate limiting
error tracking
CI/CD
staging
```

---

## Phase 11 — SaaS

সবশেষে:

```text
Free plan
subscription
billing
usage limits
upgrade
downgrade
```

---

# ৭৯. MVP-তে কী বাদ দেবে

সবকিছু একসাথে বানাতে যেও না।

প্রথম public version:

```text
✓ signup
✓ OTP
✓ login
✓ create business
✓ products
✓ inventory
✓ customers
✓ sales
✓ payments
✓ invoice
✓ reports
✓ staff
✓ offline POS
✓ multi-tenant isolation
✓ Android
```

এইটুকুই যথেষ্ট।

---

# ৮০. ভবিষ্যতে

তারপর:

```text
branches
GST
barcode printers
thermal printers
WhatsApp invoices
UPI integration
supplier ledger
purchase orders
advanced reports
cloud backup
multi-device
multi-branch
API
webhooks
integrations
subscription billing
```

---

# ৮১. একটা গুরুত্বপূর্ণ বাস্তব কথা

তুমি যখন বলছ:

> "সবাই যাতে নিজেদের দোকানের জন্য ব্যবহার করতে পারে"

তখন আসলে তুমি আর শুধু একটা POS application বানাচ্ছ না।

তুমি বানাচ্ছ:

> **POS SaaS platform**

এটার সবচেয়ে গুরুত্বপূর্ণ feature কিন্তু POS screen নয়।

সবচেয়ে গুরুত্বপূর্ণ হলো:

```text
Tenant Isolation
+
Authentication
+
Authorization
+
Data Integrity
+
Offline Reliability
+
Backup
```

একজন দোকানদার যদি ভুল করে অন্য দোকানের customer দেখে ফেলে—সেটা UI bug নয়, **security incident**।

তাই multi-tenancy-কে শেষের feature হিসেবে যোগ করা যাবে না। এখন থেকেই architecture-এর কেন্দ্র করতে হবে। OWASP-ও multi-tenant system-এ cross-tenant leakage, broken isolation, IDOR এবং shared-resource contention-কে core risks হিসেবে চিহ্নিত করে। ([OWASP Cheat Sheet Series][1])

---

# ৮২. শেষ পর্যন্ত architecture হবে এমন

```text
                         POS SaaS
                            │
              ┌─────────────┴─────────────┐
              │                           │
          Web App                    Android App
              │                           │
              └─────────────┬─────────────┘
                            │
                         Next.js
                            │
                 ┌──────────┴──────────┐
                 │                     │
             Authentication        API Layer
                 │                     │
                 │              ┌──────┴──────┐
                 │              │             │
                 │             RBAC       Tenant Context
                 │              │             │
                 └──────────────┴──────┬──────┘
                                       │
                                  PostgreSQL
                                       │
                                      RLS
                                       │
       ┌───────────────────────────────┼──────────────────────────────┐
       │                               │                              │
   Business A                     Business B                    Business C
       │                               │                              │
 Products/Sales/...             Products/Sales/...            Products/Sales/...
```

**এটাই আমি তোমার `pos-app`-এর জন্য target architecture ধরতাম।**

আর একটা জিনিস বিশেষভাবে বলি: তোমার বর্তমান codebase-এ offline sync, atomic stock update, RBAC, audit log, decimal-safe money calculation ইত্যাদি ইতিমধ্যেই আছে—তাই এটাকে ফেলে নতুন POS লেখার দরকার নেই।  বরং **database schema + authentication + tenant context + RLS**-কে কেন্দ্র করে refactor করাই সবচেয়ে বুদ্ধিমান পথ।

### তোমার জন্য সবচেয়ে কার্যকর পরের ধাপ

আমি হলে এখন সরাসরি **`pos-app`-এর বর্তমান Prisma schema ধরে একটি সম্পূর্ণ multi-tenant migration blueprint** বানাতাম—অর্থাৎ কোন কোন existing model-এ ঠিক কী field যোগ হবে, কোন relation বদলাবে, কোন `@unique` ভাঙতে হবে, কোন নতুন model লাগবে, PostgreSQL RLS-এর exact SQL, NextAuth/session flow, API middleware, OTP tables, migration order, এবং দুই দোকানের cross-tenant security test—**file-by-file implementation plan সহ**। তখন সেটা ধরে Claude/Codex-কে দিয়ে repository-তেই ধাপে ধাপে implement করানো যাবে।

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html?utm_source=chatgpt.com "Multi Tenant Security - OWASP Cheat Sheet Series"
[2]: https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/saas-multitenant-managed-postgresql.pdf?utm_source=chatgpt.com "AWS Prescriptive Guidance - Implementing managed PostgreSQL for multi-tenant SaaS applications on AWS"
[3]: https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/?utm_source=chatgpt.com "Multi-tenant data isolation with PostgreSQL Row Level Security | AWS Database Blog"
[4]: https://github.com/gastonlopezl/supabase-rls-multi-tenant?utm_source=chatgpt.com "GitHub - gastonlopezl/supabase-rls-multi-tenant: Postgres Row Level Security for multi-tenant SaaS, done so it does not leak. Membership-based isolation, all four ops, USING vs WITH CHECK, and a test suite that proves one tenant cannot touch another tenant's rows. · GitHub"
