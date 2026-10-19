import json, io, collections

def load(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f, object_pairs_hook=collections.OrderedDict)

def save(p, d):
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')

EN = 'messages/en.json'
BN = 'messages/bn.json'
en = load(EN)
bn = load(BN)

# ---------------------------------------------------------------------------
# 1. English values for keys that only existed in bn.json
# ---------------------------------------------------------------------------
EN_ONLY_IN_BN = {
    'DailySummary': {
        'invoice_footer_default': 'This is a computer generated invoice.',
        'last_7_days_short': '7d:',
    },
    'DueCollection': {
        'due_collection_note': 'Record what customers pay against their outstanding balance.',
    },
    'Expenses': {
        'all_categories': 'All Categories',
        'avg_daily': 'Avg / Day',
        'avg_entry': 'Avg Entry',
        'by_category': 'By Category',
        'categories': 'Categories',
        'categories_map': 'Category Map',
        'category_breakdown': 'Category Breakdown',
        'category_pie_chart': 'Category Pie Chart',
        'count': 'Count',
        'daily': 'Daily',
        'description': 'Description',
        'detailed_report': 'Detailed Report',
        'entries_count': 'Entries',
        'entry': 'Entry',
        'entry_list': 'Entry List',
        'expense': 'Expense',
        'failed_add': 'Could not add the expense.',
        'failed_update': 'Could not update the expense.',
        'hourly': 'Hourly',
        'last_month': 'Last Month',
        'loading': 'Loading...',
        'month': 'Month',
        'monthly': 'Monthly',
        'monthly_list': 'Monthly List',
        'no_data': 'No data',
        'report_analysis': 'Report Analysis',
        'report_title': 'Expense Report',
        'supplier_expenses': 'Supplier Expenses',
        'supplier_label': 'Supplier',
        'this_month': 'This Month',
        'today_label': 'Today',
        'total_filtered_expense': 'Total (filtered)',
        'week': 'Week',
        'weekly': 'Weekly',
        'weekly_list': 'Weekly List',
        'yearly': 'Yearly',
    },
    'ProductDialog': {
        'active': 'Active',
        'add_new_category': 'Add New Category',
        'add_new_subcategory': 'Add New Subcategory',
        'add_product_btn': 'Add Product',
        'barcode': 'Barcode',
        'barcode_placeholder': 'Scan or type the barcode',
        'bengali_name': 'Name in Bangla',
        'bengali_name_placeholder': 'e.g. টাটা লবণ',
        'buying_price': 'Buying Price',
        'buying_price_invalid': 'Buying price is invalid',
        'camera_starting': 'Starting camera...',
        'category': 'Category',
        'category_placeholder': 'Select a category',
        'category_required': 'Category is required',
        'current_stock': 'Current Stock',
        'delete_confirm': 'Delete this product?',
        'delete_failed': 'Could not delete the product.',
        'delete_product': 'Delete Product',
        'delete_success': 'Deleted',
        'delete_success_desc': 'The product was removed.',
        'drag_drop_image': 'Drag & drop an image, or tap to browse',
        'failed_save': 'Could not save the product.',
        'generate_barcode': 'Generate barcode',
        'image_format': 'Only JPG, PNG or WEBP images are allowed',
        'image_too_large': 'Image is too large',
        'inactive_note': 'Inactive products cannot be sold.',
        'invalid_format': 'Invalid format',
        'margin': 'Margin',
        'min_stock': 'Min Stock',
        'name_required': 'Product name is required',
        'new_category_placeholder': 'New category name',
        'new_subcategory_placeholder': 'New subcategory name',
        'no_subcategory': 'No subcategory',
        'position_barcode': 'Barcode position',
        'product_added': 'Product added',
        'product_added_desc': 'The product is now in your inventory.',
        'product_image': 'Product Image',
        'product_name_placeholder': 'e.g. Tata Salt',
        'profit': 'Profit: {amount}',
        'remove_image': 'Remove image',
        'save_failed': 'Could not save the product.',
        'saving': 'Saving...',
        'scan_barcode': 'Scan Barcode',
        'scan_product_barcode': 'Scan the product barcode',
        'selling_price': 'Selling Price',
        'selling_price_invalid': 'Selling price is invalid',
        'subcategory': 'Subcategory',
        'subcategory_placeholder': 'Select a subcategory',
        'unit': 'Unit',
        'unit_placeholder': 'Select a unit',
        'units': 'Units',
        'update_product': 'Update Product',
        'upload_failed': 'Could not upload the image.',
        'upload_image': 'Upload Image',
    },
}

for ns, keys in EN_ONLY_IN_BN.items():
    en[ns] = collections.OrderedDict(en.get(ns, {}))
    for k, v in keys.items():
        if k not in en[ns]:
            en[ns][k] = v

# ---------------------------------------------------------------------------
# 2. Bengali values for keys that only existed in en.json
# ---------------------------------------------------------------------------
BN_ONLY_IN_EN = {
    'Common': {
        'due': 'বকেয়া',
    },
}

for ns, keys in BN_ONLY_IN_EN.items():
    bn[ns] = collections.OrderedDict(bn.get(ns, {}))
    for k, v in keys.items():
        if k not in bn[ns]:
            bn[ns][k] = v

# data maps that only exist in en.json (supplier payment categories etc.)
for ns in ('categories', 'categories_map', 'units'):
    if ns not in bn:
        bn[ns] = json.loads(json.dumps(en[ns]), object_pairs_hook=collections.OrderedDict)

# ---------------------------------------------------------------------------
# 3. New keys used by the fixes
# ---------------------------------------------------------------------------
NEW = {
    'Common': {
        'clear': ('Clear', 'মুছুন'),
        'unlock_success': ('Counter unlocked', 'কাউন্টার আনলক সফল'),
        'welcome_back': ('Welcome, {name}', 'স্বাগতম, {name}'),
        'wrong_pin': ('Wrong PIN', 'ভুল পিন!'),
        'pin_hint': ('Enter the correct 4-digit PIN.', 'সঠিক ৪ ডিজিটের পিন প্রদান করুন।'),
        'counter_locked': ('Counter is locked', 'কাউন্টার লক করা আছে'),
        'enter_pin_to_unlock': (
            '{name} — press the 4-digit PIN to unlock (you can also use the number keys)',
            '{name} — আনলক করতে ৪ ডিজিট পিন চাপুন (কীবোর্ডের সংখ্যা দিয়েও দেওয়া যাবে)',
        ),
        'unlock_counter': ('Counter unlocked', 'কাউন্টার আনলক সফল'),
        'ready_now': ('{name} is ready', '{name} প্রস্তুত'),
    },
    'Navigation': {
        'tools_register': ('Tools & Register', 'টুলস ও রেজিস্টার'),
        'shift_register': ('Shift Register', 'শিফট রেজিস্টার'),
        'shift_open': ('Open', 'চালু'),
        'shift_closed': ('Closed', 'বন্ধ'),
        'day_close': ('Day Close (Z-Report)', 'ডে ক্লোজ (Z-রিপোর্ট)'),
        'csv_import': ('Product CSV Import', 'পণ্য CSV ইম্পোর্ট'),
        'barcode_sticker': ('Barcode Sticker', 'বারকোড স্টিকার'),
        'counter_lock_pin': ('Counter Lock (PIN)', 'কাউন্টার লক (PIN)'),
        'toggle_theme': ('Toggle theme', 'থিম বদলান'),
        'toggle_language': ('Toggle language', 'ভাষা বদলান'),
        'bill_label': ('Bill', 'বিল'),
    },
    'PrintDialog': {
        'print_failed': (
            'Could not open the print dialog',
            'প্রিন্ট ডায়ালগ খোলা যায়নি',
        ),
        'print_failed_desc': (
            'Use Share PDF and pick a printer app from the share sheet.',
            'Share PDF ব্যবহার করে শেয়ার শিট থেকে প্রিন্টার অ্যাপ বেছে নিন।',
        ),
        'opening_print': ('Opening print dialog…', 'প্রিন্ট ডায়ালগ খোলা হচ্ছে…'),
    },
    'Checkout': {
        'mixed_split_hint': (
            'Enter the cash and UPI parts separately. Together they must cover the amount.',
            'নগদ ও ইউপিআই আলাদা আলাদা লিখুন। দুটোর যোগফল মোট পরিশোধের পরিমাণের সমান হতে হবে।',
        ),
        'mixed_total': ('Cash + UPI', 'নগদ + ইউপিআই'),
        'mixed_short': (
            'Cash + UPI ({total}) is less than the due amount ({amount}).',
            'নগদ + ইউপিআই ({total}) পরিশোধযোগ্য ({amount})-এর চেয়ে কম।',
        ),
        'split_half': ('Split 50/50', 'সমান দুই ভাগ'),
        'default_discount_applied': (
            'Default discount {percent}% applied',
            'ডিফল্ট ডিসকাউন্ট {percent}% প্রয়োগ হয়েছে',
        ),
    },
    'Settings': {
        'about_legal': ('About & Legal', 'পরিচিতি ও আইনি'),
        'store_profile_saved': (
            'Store information saved',
            'দোকানের তথ্য সংরক্ষণ হয়েছে',
        ),
        'store_profile_failed': (
            'Could not save the store information',
            'দোকানের তথ্য সংরক্ষণ করা যায়নি',
        ),
        'language_switched': (
            'Language switched to English',
            'ভাষা পরিবর্তন করে বাংলা করা হয়েছে',
        ),
        'language_switched_bn': (
            'Language switched to Bangla',
            'ভাষা পরিবর্তন করে বাংলা করা হয়েছে',
        ),
    },
    'Billing': {
        'default_discount_hint': (
            'Applied automatically to every new bill. You can still change it per bill.',
            'প্রতিটি নতুন বিলে স্বয়ংক্রিয়ভাবে প্রয়োগ হয়। প্রয়োজনে প্রতি বিলে আলাদা করে বদলাতে পারবেন।',
        ),
    },
}

for ns, keys in NEW.items():
    en[ns] = collections.OrderedDict(en.get(ns, {}))
    bn[ns] = collections.OrderedDict(bn.get(ns, {}))
    for k, (ev, bv) in keys.items():
        en[ns].setdefault(k, ev)
        bn[ns].setdefault(k, bv)

save(EN, en)
save(BN, bn)

# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------
en = load(EN)
bn = load(BN)
missing = []
for ns in sorted(set(en) & set(bn)):
    ek, bk = set(en[ns]), set(bn[ns])
    if ek != bk:
        missing.append((ns, sorted(ek - bk), sorted(bk - ek)))
print('namespaces out of sync:', missing if missing else 'none')
print('en namespaces:', len(en), '| bn namespaces:', len(bn))