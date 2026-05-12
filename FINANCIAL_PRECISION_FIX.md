# আর্থিক নির্ভুলতা (Financial Precision) সমাধান ডকুমেন্টেশন
# Financial Precision Fix - Complete Documentation

**Date:** 2026-05-12  
**Issue:** Floating-point precision errors in monetary calculations  
**Solution:** Convert all financial Float fields to Decimal (NUMERIC in PostgreSQL)

---

## সমস্যা (The Problem)

### কী হচ্ছিল (What Was Happening)
```
Input: 74.00 টাকা (Taka)
Stored in Database (DOUBLE PRECISION): 74.0007138047138
Displayed Amount: 74.00

⚠️ Internal Precision Lost!
```

### কেন হচ্ছে (Why It Happens)

কম্পিউটারের মেমরিতে সংখ্যা **বাইনারি** ফরম্যাটে সংরক্ষিত হয়। ডেসিমাল (দশমিক) সংখ্যা যেমন 74.00 বাইনারিতে পুরোপুরি প্রকাশ করা যায় না।

**উদাহরণ:** 0.1 এর কী হয়?
- 0.1 (দশমিক) = 0.0001100110011... (বাইনারি, অসীম পুনরাবৃত্তি)
- Float স্টোর করে শুধুমাত্র প্রথম কয়েকটি বিট → 0.1000000014901...

**Prisma/JavaScript তে:**
```javascript
// Float ডেটা পড়া
const price = 74.0007138047138;  // ❌ ত্রুটিপূর্ণ

// তারপর গণনা
total = quantity * price;  // ❌ ভুল ফলাফল
```

---

## সমাধান (The Solution)

### ১. ডাটাবেস স্কিমা পরিবর্তন (Database Schema Change)

**যা করা হয়েছে:**
```sql
-- পুরানো: ডাবল প্রিসিশন ফ্লোটিং পয়েন্ট
buyingPrice FLOAT

-- নতুন: ডেসিমাল (যথাযথ আর্থিক গণনার জন্য)
buyingPrice DECIMAL
```

**প্রভাব (Impact):**
- ✅ 74.00 → সঠিকভাবে 74.00 সংরক্ষিত হয়
- ✅ সব গণনা নির্ভুল
- ✅ রিপোর্ট এবং অডিট সঠিক

### ২. Prisma Client আপডেট

JavaScript-এ Decimal স্বয়ংক্রিয়ভাবে Decimal অবজেক্ট হিসেবে আসে:

```javascript
// Prisma থেকে পড়া
const product = await db.product.findUnique({
  where: { id: '123' }
});

// buyingPrice এখন Decimal অবজেক্ট
console.log(typeof product.buyingPrice);  // 'object' (Decimal.js)
console.log(product.buyingPrice.toNumber());  // 74.00 (সঠিক)
```

### ৩. বিদ্যমান ডেটা ক্লিনআপ

মাইগ্রেশন স্বয়ংক্রিয়ভাবে সব Float মানকে রাউন্ড করেছে:

```sql
-- মাইগ্রেশনে ব্যবহৃত
ALTER TABLE products 
  ALTER COLUMN buying_price TYPE NUMERIC(10,2) 
  USING ROUND(buying_price::numeric, 2);
```

**ফলাফল:**
- 74.0007138047138 → 74.00 (সঠিকভাবে রাউন্ড করা)
- সব পুরানো ডেটা এখন পরিষ্কার

---

## কোন ফাইলগুলি পরিবর্তিত হয়েছে (What Changed)

### স্কিমা আপডেট (Schema Files)
| মডেল | Float → Decimal পরিবর্তনগুলি |
|--------|--------------------------------|
| **Product** | `buyingPrice`, `sellingPrice` ✅ (ইতিমধ্যে Decimal ছিল) |
| **Customer** | `totalDue`, `totalPaid`, `prepaidBalance` |
| **LedgerEntry** | `amount`, `balanceAfter` |
| **Sale** | `subtotal`, `discount`, `tax`, `totalAmount`, `amountPaid`, `cashAmount`, `upiAmount` |
| **SaleItem** | `unitPrice`, `totalPrice` |
| **SaleReturn** | `refundAmount` |
| **SaleReturnItem** | `unitPrice`, `totalPrice` |
| **Purchase** | `totalAmount` |
| **PurchaseItem** | `buyingPrice`, `totalPrice` |
| **Expense** | `amount` |

### নতুন মাইগ্রেশন ফাইল
```
prisma/migrations/20260512_convert_float_to_decimal/migration.sql
```

### ডকুমেন্টেশন ফাইলগুলি
```
prisma/cleanup-floating-point-errors.sql    # ভেরিফিকেশন স্ক্রিপ্ট
prisma/insert-standard-categories.sql       # ক্যাটাগরি সেটআপ
prisma/setup-categories.sh                  # ক্যাটাগরি মাইগ্রেশন গাইড
```

---

## ক্যাটাগরি ট্যাক্সোনমি নিয়ম (Category Taxonomy Rules)

### মূল নীতি (Core Principle)
```
❌ মিশ্রিত করবেন না: বাংলা এবং ইংরেজি ক্যাটাগরি একসাথে
✅ ব্যবহার করুন: মান্যকৃত ব্রড ক্যাটাগরি
```

### প্রমিত মূল ক্যাটাগরি (Standard Master Categories)

| ইংরেজি (Code) | বাংলা (Display) | উপবিভাগ উদাহরণ |
|-----------------|-----------------|-------------------|
| **Groceries** | মুদি ও চাল-ডাল | চাল, ডাল, তেল, আটা, ময়দা, মসলা |
| **Packaged Snacks** | প্যাকেটজাত খাবার | বিস্কুট, চানাচুর, চিপস, নুডলস, কেক |
| **Beverages** | পানীয় | কোল্ড ড্রিংকস, জুস, জল, চা, কফি |
| **Dairy & Frozen** | দুগ্ধজাত ও হিমায়িত | দুধ, পনির, মাখন, ঘি, আইসক্রিম |
| **Personal Care** | ব্যক্তিগত যত্ন | সাবান, শ্যাম্পু, টুথপেস্ট, তেল |
| **Household & Cleaning** | গৃহস্থালি ও পরিষ্কার | ডিটারজেন্ট, ফিনাইল, ডিশওয়াশ, টিস্যু |
| **Confectionery** | মিষ্টান্ন ও চকোলেট | চকোলেট, লজেন্স, চুইংগাম, ক্যান্ডি |
| **General** | সাধারণ | অন্যান্য পণ্য |

### ক্যাটাগরি এন্ট্রি নিয়ম (Data Entry Rules)

#### ✅ সঠিক উপায়

**পণ্য উদাহরণ:**
```
Name:     "Tata Tea Gold 250g"
Category: "Beverages"
```

**কেন?**
- বিস্তারিত তথ্য (Tea Gold, 250g) → পণ্যের নামে
- ব্রড ক্যাটাগরি (Beverages) → ডাটাবেসে
- ফলাফল: রিপোর্ট করা সহজ, বিশ্লেষণ করা সম্ভব

#### ❌ ভুল উপায়

```
Name:     "Tea Gold"
Category: "চা পাতা"  ← মিশ্রিত বাংলা/ইংরেজি
```

```
Name:     "Tea"
Category: "চা পাতা"
```

**সমস্যা:**
- আগামীকাল "চা" খুঁজলে "চা পাতা" পাবেন না
- রিপোর্টে "চা", "চা পাতা", "Tea" মিশে যাবে
- বিক্রয় বিশ্লেষণ অসম্ভব

---

## ক্যাটাগরি মাইগ্রেশন কীভাবে করবেন (How to Migrate Categories)

### ধাপ ১: বর্তমান ক্যাটাগরি দেখুন
```bash
# শেল থেকে চালান
cd "c:\Users\joysr\Documents\POS Apps\POS app by Z"
bash prisma/setup-categories.sh view
```

**আউটপুট উদাহরণ:**
```
📊 Current Categories:
 id | name         | name_bn     | product_count
----|--------------|-------------|---------------
  1 | চা পাতা      | (null)      |        45
  2 | বিস্কুট      | (null)      |        32
  3 | Beverages    | পানীয়      |        15
...
```

### ধাপ ২: স্টান্ডার্ড ক্যাটাগরি সেটআপ করুন
```bash
bash prisma/setup-categories.sh insert
```

**ফলাফল:**
```
✅ Standard categories inserted
```

### ধাপ ৩: পুরানো ক্যাটাগরি নতুন ক্যাটাগরিতে ম্যাপ করুন

```sql
-- বেভারেজ মানচিত্র করুন
UPDATE products SET category = 'Beverages' 
WHERE category IN ('চা পাতা', 'পানীয়', 'কোল্ড ড্রিংক');

-- প্যাকেজড স্ন্যাকস মানচিত্র করুন
UPDATE products SET category = 'Packaged Snacks' 
WHERE category IN ('বিস্কুট', 'চিপস', 'নুডলস', 'ক্র্যাকার');

-- ব্যক্তিগত যত্ন মানচিত্র করুন
UPDATE products SET category = 'Personal Care' 
WHERE category IN ('সাবান', 'শ্যাম্পু', 'টুথপেস্ট');
```

### ধাপ ৪: ভেরিফাই করুন
```bash
bash prisma/setup-categories.sh verify
```

**প্রত্যাশিত আউটপুট:**
```
✅ Verifying Category Assignment:
 category               | product_count
------------------------|---------------
 Groceries              |        120
 Packaged Snacks        |         85
 Beverages              |         62
 Dairy & Frozen         |         45
 Personal Care          |         38
 Household & Cleaning   |         42
 Confectionery          |         28
 General                |         12
```

---

## যা এখন সঠিক (What's Fixed Now)

### বিক্রয় রিপোর্ট ✅
```
Total Sales Today:     ৳ 15,450.00  (পরিষ্কার, কোনো অতিরিক্ত দশমিক নেই)
Average Sale:          ৳ 1,038.57   (সঠিক গণনা)
```

### লাভ/ক্ষতি গণনা ✅
```
Cost Price:    ৳ 500.00
Selling Price: ৳ 750.00
Profit:        ৳ 250.00 (সবসময় সঠিক)
```

### ক্যাটাগরি রিপোর্ট ✅
```
Beverages Revenue:     ৳ 8,450.00   (সব পানীয় পণ্য)
Personal Care Sales:   ৳ 3,200.00   (সব যত্ন পণ্য)
```

### ইনভেন্টরি অডিট ✅
```
Stock Count:  850.5 kg     (সঠিক)
Valuation:    ৳ 42,750.50  (নির্ভুল মূল্য)
```

---

## পরবর্তী পদক্ষেপ (Next Steps)

### অবিলম্বে
- [ ] ডাটাবেস মাইগ্রেশন সম্পূর্ণ (✅ সম্পন্ন)
- [ ] ক্যাটাগরি মাস্টার তালিকা তৈরি করুন
- [ ] বিদ্যমান পণ্য মাইগ্রেশন শুরু করুন
- [ ] প্রতিটি ক্যাটাগরি যাচাই করুন

### আগামী সপ্তাহে
- [ ] সমস্ত পণ্য মাইগ্রেশন সম্পূর্ণ করুন
- [ ] বিক্রয় রিপোর্ট চালান এবং যাচাই করুন
- [ ] ব্যবহারকারীদের নতুন ক্যাটাগরি সম্পর্কে প্রশিক্ষণ দিন

### চলমান (Ongoing)
- সব নতুন পণ্য স্ট্যান্ডার্ড ক্যাটাগরি ব্যবহার করে তৈরি করুন
- মাসিক বিক্রয় বিশ্লেষণে ক্যাটাগরি অন্তর্ভুক্ত করুন

---

## ট্রাবলশুটিং (Troubleshooting)

### সমস্যা: "ক্যাটাগরি তালিকা অপ্টিমাইজ করতে পারছি না"

**সমাধান:**
```bash
# স্কিমা রিফ্রেশ করুন
npx prisma generate

# নতুন ক্যাটাগরি পুনরায় সন্নিবেশ করুন
bash prisma/setup-categories.sh insert
```

### সমস্যা: "পুরানো মূল্য এখনও ত্রুটিপূর্ণ দেখাচ্ছে"

**সমাধান:**
```sql
-- পরীক্ষা করুন কি ডেটা ভুল আছে
SELECT * FROM products 
WHERE CAST(buying_price AS TEXT) LIKE '%.%_%_%';

-- ম্যানুয়ালি পরিষ্কার করুন
UPDATE products 
SET buying_price = ROUND(buying_price, 2) 
WHERE id IN (...);
```

### সমস্যা: "আবেদন চালু হচ্ছে না"

**কারণ:** Prisma ক্লায়েন্ট নতুন স্কিমার সাথে তাল মিলাতে পারে না

**সমাধান:**
```bash
# পুনরায় তৈরি করুন
npx prisma generate
npm run build
npm run dev
```

---

## যোগাযোগ ও সহায়তা (Support)

প্রতিটি সমস্যার জন্য নিম্নোক্ত সম্পদ রয়েছে:
- 📋 Prisma ডকুমেন্টেশন: https://www.prisma.io/docs/
- 📊 PostgreSQL NUMERIC: https://www.postgresql.org/docs/current/datatype-numeric.html
- 💡 Decimal.js: https://mikemcl.github.io/decimal.js/
- 🐛 সমস্যা ট্র্যাকার: [GitHub Issues](../../../issues)

---

**সংস্করণ:** 1.0  
**শেষ আপডেট:** 2026-05-12  
**অবস্থা:** ✅ প্রয়োগ করা হয়েছে
