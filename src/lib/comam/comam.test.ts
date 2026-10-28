import { describe, it, expect } from 'vitest';
import {
  bnToAscii,
  toBnDigits,
  formatBnNumber,
  formatBnTaka,
  formatForBengaliSpeech,
  parseNumberAt,
  findNumberPhrases,
} from './bn-parser';
import {
  searchProducts,
  findCustomer,
  extractDueQueryTarget,
  stripBengaliSuffixes,
} from './comam-matcher';
import { parseComamCommand } from './comam-engine';
import type { Product, Customer } from '@/types/pos';

describe('Comam bn-parser tests', () => {
  it('converts Bengali digits to ASCII and vice versa', () => {
    expect(bnToAscii('১২৩৪৫৬৭৮৯০')).toBe('1234567890');
    expect(toBnDigits('1234567890')).toBe('১২৩৪৫৬৭৮৯০');
    expect(formatBnNumber(125)).toBe('১২৫');
    expect(formatBnNumber(2.5)).toBe('২.৫');
    expect(formatBnTaka(340)).toBe('৩৪০ টাকা');
  });

  it('parses written Bengali numbers and fractions', () => {
    const parse = (text: string) => parseNumberAt(text.split(/\s+/), 0)[0];
    expect(parse('এক')).toBe(1);
    expect(parse('দুই')).toBe(2);
    expect(parse('আধা')).toBe(0.5);
    expect(parse('দেড়')).toBe(1.5);
    expect(parse('আড়াই')).toBe(2.5);
    expect(parse('সাড়ে তিন')).toBe(3.5);
    expect(parse('পৌনে চার')).toBe(3.75);
    expect(parse('পোনে চার')).toBe(3.75);
    expect(parse('সোয়া দুই')).toBe(2.25);
    expect(parse('পঁচাত্তর')).toBe(75);
    expect(parse('তিরিশ')).toBe(30);
    expect(parse('তিরিশা')).toBe(30);
    expect(parse('দুইশো')).toBe(200);
    expect(parse('দুইশো পঞ্চাশ')).toBe(250);
    expect(parse('তিনশো')).toBe(300);
    expect(parse('দেড় হাজার')).toBe(1500);
  });

  it('extracts number phrases with char offsets', () => {
    const phrases = findNumberPhrases('দুই কেজি চিনি আর আধা কেজি ডাল');
    expect(phrases.length).toBe(2);
    expect(phrases[0].value).toBe(2);
    expect(phrases[1].value).toBe(0.5);
  });
});

describe('Comam matcher and search tests', () => {
  const mockProducts: Product[] = [
    {
      id: 'p1',
      barcode: '111',
      name: 'Sugar',
      nameBn: 'চিনি',
      category: 'Grocery',
      buyingPrice: 50,
      sellingPrice: 60,
      unit: 'kg',
      currentStock: 100,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p2',
      barcode: '222',
      name: 'Red Lentil',
      nameBn: 'মসুর ডাল',
      category: 'Grocery',
      buyingPrice: 100,
      sellingPrice: 120,
      unit: 'kg',
      currentStock: 50,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p3',
      barcode: '333',
      name: 'Biscuit Big Pack',
      nameBn: 'বিস্কুট বড় প্যাকেট',
      category: 'Snacks',
      buyingPrice: 16,
      sellingPrice: 20,
      unit: 'piece',
      currentStock: 40,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p4',
      barcode: '444',
      name: 'Biscuit Small Pack',
      nameBn: 'বিস্কুট ছোট প্যাকেট',
      category: 'Snacks',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 40,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p5',
      barcode: '555',
      name: '7 UP Rs. 10',
      nameBn: '৭ আপ ১০ টাকা',
      category: 'Beverages',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 20,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p6',
      barcode: '666',
      name: '7 Up Rs. 20',
      nameBn: '৭ আপ ২০ টাকা',
      category: 'Beverages',
      buyingPrice: 16,
      sellingPrice: 20,
      unit: 'piece',
      currentStock: 15,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p7',
      barcode: '777',
      name: 'Sunrise Haldi Rs. 10',
      nameBn: 'সানরাইজ হলুদ গুড়ো ১০ টাকা',
      category: 'Groceries',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 30,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p8',
      barcode: '888',
      name: 'Sunrise Haldi g',
      nameBn: 'সানরাইজ হলুদ ৫০ গ্রাম',
      category: 'Groceries',
      buyingPrice: 15,
      sellingPrice: 18,
      unit: 'piece',
      currentStock: 25,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p9',
      barcode: '999',
      name: 'Bisk Farm Marie Biscuit Rs. 10',
      nameBn: 'বিস্কফার্ম মেরি বিস্কুট ১০ টাকা',
      category: 'Snacks',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 50,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p10',
      barcode: '1010',
      name: 'Amul Shakti',
      nameBn: 'আমুল শক্তি',
      category: 'Dairy',
      buyingPrice: 25,
      sellingPrice: 30,
      unit: 'piece',
      currentStock: 15,
      minStockLevel: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p11',
      barcode: '1111',
      name: 'Britannia Marie Biscuit Rs. 10',
      nameBn: 'ব্রিটানিয়া মেরি ১০ টাকা',
      category: 'Snacks',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 50,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p12',
      barcode: '1212',
      name: 'Britannia Milk Bikis Rs. 10',
      nameBn: 'ব্রিটানিয়া মিল্ক বিকিস ১০ টাকা',
      category: 'Snacks',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 50,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p13',
      barcode: '1313',
      name: 'Sugar Loose',
      nameBn: 'চিনি খোলা',
      category: 'Groceries',
      buyingPrice: 55,
      sellingPrice: 65,
      unit: 'kg',
      currentStock: 100,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p14',
      barcode: '1414',
      name: 'Maida Loose',
      nameBn: 'ময়দা খোলা',
      category: 'Groceries',
      buyingPrice: 32,
      sellingPrice: 40,
      unit: 'kg',
      currentStock: 80,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p15',
      barcode: '1515',
      name: 'Coca Cola 750ml',
      nameBn: 'কোকাকোলা ৭৫০ মিলি',
      category: 'Beverages',
      buyingPrice: 32,
      sellingPrice: 40,
      unit: 'piece',
      currentStock: 25,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p16',
      barcode: '1616',
      name: 'Sprite 1L',
      nameBn: 'স্প্রাইট ১০০ টাকা',
      category: 'Beverages',
      buyingPrice: 85,
      sellingPrice: 100,
      unit: 'piece',
      currentStock: 20,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockCustomers: Customer[] = [
    {
      id: 'c1',
      name: 'রহিম',
      nameEn: 'Rahim',
      phone: '01700000001',
      totalDue: 350,
      totalPaid: 1000,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c2',
      name: 'সুমিতা',
      nameEn: 'Sumita',
      phone: '01700000002',
      totalDue: 0,
      totalPaid: 500,
      prepaidBalance: 100,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c3',
      name: 'Lakhan Sarkar',
      nameBn: 'লক্ষণ সরকার',
      nameEn: 'Lakhan Sarkar',
      phone: '01700000003',
      totalDue: 1023.5,
      totalPaid: 5000,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c4',
      name: 'অনির্বাণ বি',
      nameEn: 'Anirban B',
      phone: '01700000004',
      totalDue: 0,
      totalPaid: 0,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c5',
      name: 'আপসি সে (সোমরু)',
      nameEn: 'Apsi Se',
      phone: '01700000005',
      totalDue: 0,
      totalPaid: 0,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c6',
      name: 'সাধীর মা',
      nameEn: 'Sadhir Ma',
      phone: '01700000006',
      totalDue: 0,
      totalPaid: 0,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c7',
      name: 'মৌটু একটা লোক',
      nameEn: 'Motu Ekta Lok',
      phone: '01700000007',
      totalDue: 0,
      totalPaid: 0,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c8',
      name: 'সুশীল সিংহ',
      nameBn: 'সুশীল সিংহ',
      nameEn: 'Sushil Singha',
      phone: '01700000008',
      totalDue: 250,
      totalPaid: 500,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('matches products and detects ambiguity', () => {
    const resChini = searchProducts(mockProducts, 'চিনি');
    expect(resChini.matches.length).toBeGreaterThan(0);
    expect(resChini.matches[0].product.nameBn).toBe('চিনি');
    expect(resChini.isAmbiguous).toBe(false);

    // 'বিস্কুট' matches biscuit products closely -> ambiguous
    const resBiscuit = searchProducts(mockProducts, 'বিস্কুট');
    expect(resBiscuit.matches.length).toBeGreaterThanOrEqual(2);
    expect(resBiscuit.isAmbiguous).toBe(true);
  });

  it('finds customer by name in free text', () => {
    const cust = findCustomer(mockCustomers, 'রহিমদার নামে বাকি রাখো');
    expect(cust).not.toBeNull();
    expect(cust?.name).toBe('রহিম');
  });

  it('parses a multi-item bill command accurately', () => {
    const draft = parseComamCommand(
      'দুই কেজি চিনি, আধা কেজি মসুর ডাল — রহিমদার নামে বাকি',
      mockProducts,
      mockCustomers
    );

    expect(draft.kind).toBe('sale');
    expect(draft.items.length).toBe(2);
    expect(draft.items[0].nameBn).toBe('চিনি');
    expect(draft.items[0].qty).toBe(2);
    expect(draft.items[0].lineTotal).toBe(120); // 2 * 60

    expect(draft.items[1].nameBn).toBe('মসুর ডাল');
    expect(draft.items[1].qty).toBe(0.5);
    expect(draft.items[1].lineTotal).toBe(60); // 0.5 * 120

    expect(draft.total).toBe(180);
    expect(draft.paymentType).toBe('Due');
    expect(draft.customer?.name).toBe('রহিম');
  });

  it('picks stated price variant without ambiguity', () => {
    const draft = parseComamCommand(
      'একটা ১০ টাকা দামের বিস্কুট দাও',
      mockProducts,
      mockCustomers
    );

    expect(draft.kind).toBe('sale');
    expect(draft.items.length).toBe(1);
    expect(draft.items[0].unitPrice).toBe(10);
    expect(draft.items[0].qty).toBe(1);
    expect(draft.ambiguities.length).toBe(0);
  });

  it('handles due query intent', () => {
    const draft = parseComamCommand('রহিমদার কত বাকি?', mockProducts, mockCustomers);
    expect(draft.kind).toBe('due_query');
    expect(draft.customer?.name).toBe('রহিম');
    expect(draft.summaryBn).toContain('রহিম-এর বাকি হিসাব: ৩৫০ টাকা');
  });

  it('handles sales report intent', () => {
    const draft = parseComamCommand('আজ কত বিক্রি হলো?', mockProducts, mockCustomers);
    expect(draft.kind).toBe('report');
    expect(draft.report).toBe('sales_summary');
  });

  it('handles due payment intent', () => {
    const draft = parseComamCommand('রহিমদা ৫০০ টাকা জমা দিলেন', mockProducts, mockCustomers);
    expect(draft.kind).toBe('due_payment');
    expect(draft.customer?.name).toBe('রহিম');
    expect(draft.duePaymentAmount).toBe(500);
  });

  it('handles undo last sale intent', () => {
    const draft = parseComamCommand('শেষ বিক্রিটা বাতিল করো', mockProducts, mockCustomers);
    expect(draft.kind).toBe('undo');
  });

  it('converts gram to kg unit correctly (e.g. 500 গ্রাম চিনি = 0.5 kg)', () => {
    const draft = parseComamCommand('৫০০ গ্রাম চিনি', mockProducts, mockCustomers);
    expect(draft.kind).toBe('sale');
    expect(draft.items[0].nameBn).toBe('চিনি');
    expect(draft.items[0].qty).toBe(0.5);
    expect(draft.items[0].lineTotal).toBe(30); // 0.5 * 60
  });

  it('handles speech self-correction within an item (e.g. দুটি দুই ডজন)', () => {
    const draft = parseComamCommand('দুই ডজন বিস্কুট বড় প্যাকেট', mockProducts, mockCustomers);
    expect(draft.kind).toBe('sale');
    expect(draft.items[0].qty).toBe(24); // 2 * 12
  });

  it('accurately parses user complex command: ৳10 দামের সেভেন আপ 2টা 01 কেজি চিনি এবং একটা সানরাইজ হলুদ ৳10 দামের।', () => {
    const draft = parseComamCommand(
      '৳10 দামের সেভেন আপ 2টা 01 কেজি চিনি এবং একটা সানরাইজ হলুদ ৳10 দামের।',
      mockProducts,
      mockCustomers
    );

    expect(draft.kind).toBe('sale');
    expect(draft.unknownItems.length).toBe(0);
    expect(draft.ambiguities.length).toBe(0);
    expect(draft.items.length).toBe(3);

    // Item 1: 7 Up Rs. 10 (qty 2)
    const sevenUp = draft.items.find((i) => i.nameBn?.includes('৭ আপ') || i.name.includes('7 UP'));
    expect(sevenUp).toBeDefined();
    expect(sevenUp?.qty).toBe(2);
    expect(sevenUp?.unitPrice).toBe(10);
    expect(sevenUp?.lineTotal).toBe(20);

    // Item 2: Sugar 1 kg (qty 1)
    const chini = draft.items.find((i) => i.nameBn?.includes('চিনি') || i.name.includes('Sugar'));
    expect(chini).toBeDefined();
    expect(chini?.qty).toBe(1);
    expect(chini?.unit).toBe('kg');
    expect(chini?.unitPrice).toBe(60);
    expect(chini?.lineTotal).toBe(60);

    // Item 3: Sunrise Haldi Rs. 10 (qty 1, picked the 10-taka variant over 18-taka 50g variant)
    const haldi = draft.items.find((i) => i.nameBn?.includes('সানরাইজ হলুদ') || i.name.includes('Sunrise Haldi'));
    expect(haldi).toBeDefined();
    expect(haldi?.qty).toBe(1);
    expect(haldi?.unitPrice).toBe(10);
    expect(haldi?.lineTotal).toBe(10);

    // Total: 20 + 60 + 10 = 90
    expect(draft.total).toBe(90);
  });

  it('handles biskfarm marie input without hanging or freezing on 1000 products', () => {
    const manyProducts: Product[] = [];
    for (let i = 0; i < 1000; i++) {
      manyProducts.push({
        id: `p_${i}`,
        name: `Product ${i} pack Rs. ${i % 100}`,
        nameBn: `পণ্য ${i} প্যাকেট ${i % 100} টাকা`,
        sellingPrice: (i % 100) + 10,
        buyingPrice: (i % 100) + 5,
        unit: i % 2 === 0 ? 'piece' : 'kg',
        currentStock: 10,
        minStockLevel: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    // Also include Sugar and BiskFarm
    manyProducts.push(...mockProducts);

    const t0 = performance.now();
    const draft = parseComamCommand(
      'এক কেজি চিনি 10 টাকার বিস্কফার্মেরি বিস্কুট 1:10 টাকা',
      manyProducts,
      mockCustomers
    );
    const elapsed = performance.now() - t0;
    console.log(`Elapsed for 1000 products: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(1500);
    expect(draft).toBeDefined();
  });

  it('accurately parses user input: এক কেজি চিনি 10 টাকার বিস্কফার মেরি বিস্কুট 1:10 টাকা', () => {
    const draft = parseComamCommand(
      'এক কেজি চিনি 10 টাকার বিস্কফার মেরি বিস্কুট 1:10 টাকা',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('sale');
    expect(draft.unknownItems.length).toBe(0);
    expect(draft.ambiguities.length).toBe(0);
    expect(draft.items.length).toBe(2);

    // Item 1: Sugar 1 kg (Rs. 60)
    const chini = draft.items.find((i) => i.nameBn?.includes('চিনি'));
    expect(chini).toBeDefined();
    expect(chini?.qty).toBe(1);
    expect(chini?.unitPrice).toBe(60);
    expect(chini?.lineTotal).toBe(60);

    // Item 2: Bisk Farm Marie 10 Tk (1 pc)
    const biscuit = draft.items.find((i) => i.nameBn?.includes('মেরি') || i.name.includes('Marie'));
    expect(biscuit).toBeDefined();
    expect(biscuit?.qty).toBe(1);
    expect(biscuit?.unitPrice).toBe(10);
    expect(biscuit?.lineTotal).toBe(10);

    // Total: 60 + 10 = 70
    expect(draft.total).toBe(70);
  });

  it('tests customer billing: এক কেজি খোলা চিনি লক্ষণ সরকারের নামে বিল করো', () => {
    const draft = parseComamCommand(
      'এক কেজি খোলা চিনি লক্ষণ সরকারের নামে বিল করো',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('sale');
    expect(draft.customerName).toBe('লক্ষণ সরকার');
    expect(draft.items.length).toBe(1);
    expect(draft.items[0].nameBn).toBe('চিনি');
    expect(draft.items[0].qty).toBe(1);
    expect(draft.unknownItems.length).toBe(0);
    expect(draft.total).toBe(60);
  });

  it('tests customer billing with registered customer: রহিমদার নামে ১ কেজি চিনি বিল করো', () => {
    const draft = parseComamCommand(
      'রহিমদার নামে ১ কেজি চিনি বিল করো',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('sale');
    expect(draft.customer?.name).toBe('রহিম');
    expect(draft.items.length).toBe(1);
    expect(draft.items[0].nameBn).toBe('চিনি');
    expect(draft.items[0].qty).toBe(1);
    expect(draft.unknownItems.length).toBe(0);
    expect(draft.hasUnknownCustomer).toBe(false);
  });

  it('detects unknown customer in sale and flags hasUnknownCustomer', () => {
    const draft = parseComamCommand(
      '১০ টাকার বিস্কুট ৩ প্যাকেট — কামাল হোসেনের নামে বাকি',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('sale');
    expect(draft.customer).toBeNull();
    expect(draft.customerName).toBe('কামাল হোসেন');
    expect(draft.hasUnknownCustomer).toBe(true);
    expect(draft.paymentType).toBe('Due');
  });

  it('tests product sales report: আজকে আমুল শক্তি কয়টা বিক্রি হয়েছে?', () => {
    const draft = parseComamCommand(
      'আজকে আমুল শক্তি কয়টা বিক্রি হয়েছে?',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('report');
    expect(draft.report).toBe('product_sales');
    expect(draft.targetProduct).toBeDefined();
    expect(draft.targetProduct?.id).toBe('p10');
    expect(draft.targetProduct?.nameBn).toBe('আমুল শক্তি');
  });

  it('tests specific customer due query: লক্ষণ সরকারের বাকি কত?', () => {
    const draft = parseComamCommand(
      'লক্ষণ সরকারের বাকি কত?',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('due_query');
    expect(draft.customer).toBeDefined();
    expect(draft.customer?.id).toBe('c3');
    expect(draft.summaryBn).toContain('লক্ষণ সরকার');
  });

  it('tests specific customer due query when customer is not registered', () => {
    const draft = parseComamCommand(
      'সুধীরকাকার কত বাকি?',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('due_query');
    expect(draft.customer).toBeNull();
    expect(draft.customerName).toBe('সুধীর');
    expect(draft.summaryBn).toContain('"সুধীর" নামে কোনো গ্রাহক খুঁজে পাওয়া যায়নি');
  });

  it('tests general due query: কার কত বাকি?', () => {
    const draft = parseComamCommand(
      'কার কত বাকি?',
      mockProducts,
      mockCustomers
    );
    expect(draft.kind).toBe('due_query');
    expect(draft.customer).toBeNull();
    expect(draft.customerName).toBeNull();
    expect(draft.summaryBn).toBe('সকল ক্রেতার বাকি হিসাব দেখা হচ্ছে।');
  });

  it('formats text for Bengali speech without "পুঁটকি" for decimal points', () => {
    const speech1 = formatForBengaliSpeech('রবিন তামাং ১০২৩.৫ টাকা।');
    expect(speech1).toContain('১০২৩ দশমিক ৫ টাকা');
    expect(speech1).not.toContain('পুঁটকি');

    const speech2 = formatForBengaliSpeech('মোট বাকি ১৮৭৯৬.৫০ টাকা।');
    expect(speech2).toContain('১৮৭৯৬ দশমিক ৫০ টাকা');

    const speech3 = formatForBengaliSpeech('১ piece × ১০ টাকা');
    expect(speech3).toContain('১ piece গুণ ১০ টাকা');

    const speech4 = formatForBengaliSpeech('৳২০ দামের বিস্কুট');
    expect(speech4).toContain('২০ টাকা');
  });

  describe('User-reported screenshots & voice billing edge cases', () => {
    it('Scenario 1: 1:10 টাকা দামের ব্রিটানিয়া মেরী বিস্কুট এবং এক কেজি খোলা চিনি।', () => {
      // Must NOT match customer "অনির্বাণ বি"
      // Must match "ব্রিটানিয়া মেরি ১০ টাকা" (NOT মিল্ক বিকিস)
      // Must match "খোলা চিনি" 1 kg
      const draft = parseComamCommand(
        '1:10 টাকা দামের ব্রিটানিয়া মেরী বিস্কুট এবং এক কেজি খোলা চিনি।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.customer).toBeNull();
      expect(draft.customerName).toBeNull();
      expect(draft.items.length).toBe(2);

      const marie = draft.items.find((it) => it.product.id === 'p11');
      expect(marie).toBeDefined();
      expect(marie?.qty).toBe(1);
      expect(marie?.unitPrice).toBe(10);

      const chini = draft.items.find((it) => it.product.id === 'p13' || it.product.id === 'p1');
      expect(chini).toBeDefined();
      expect(chini?.qty).toBe(1);

      expect(draft.unknownItems.length).toBe(0);
    });

    it('Scenario 2: আধা কেজি চিনি খোলা এক কেজি খোলা ময়দা এবং হল ৳10 দামের দুটো হলুদের প্যাকেট।', () => {
      // Must NOT match customer "আপসি সে (সোমরু)"
      // Must match চিনি খোলা (0.5 kg), খোলা ময়দা (1 kg), and হলুদ (2 piece @ 10 Tk)
      // Must NOT have "হলুদের" in unknown items
      const draft = parseComamCommand(
        'আধা কেজি চিনি খোলা এক কেজি খোলা ময়দা এবং হল ৳10 দামের দুটো হলুদের প্যাকেট।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.customer).toBeNull();
      expect(draft.customerName).toBeNull();
      expect(draft.items.length).toBe(3);

      const chini = draft.items.find((it) => it.nameBn?.includes('চিনি'));
      expect(chini).toBeDefined();
      expect(chini?.qty).toBe(0.5);

      const maida = draft.items.find((it) => it.nameBn?.includes('ময়দা'));
      expect(maida).toBeDefined();
      expect(maida?.qty).toBe(1);

      const haldi = draft.items.find((it) => it.nameBn?.includes('হলুদ') || it.nameBn?.includes('হলু'));
      expect(haldi).toBeDefined();
      expect(haldi?.qty).toBe(2);

      expect(draft.unknownItems.length).toBe(0);
    });

    it('Scenario 3: এক পোয়া চিনি খোলা কমা এক।', () => {
      // Bengali unit "পোয়া" / "পোয়া" must equal 0.25 kg
      // Spoken punctuation "কমা" must NOT be treated as unknown product
      // Must NOT match customer "সাধীর মা"
      const draft = parseComamCommand(
        'এক পোয়া চিনি খোলা কমা এক।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.customer).toBeNull();
      expect(draft.customerName).toBeNull();
      expect(draft.items.length).toBe(1);

      const chini = draft.items[0];
      expect(chini.nameBn).toContain('চিনি');
      expect(chini.qty).toBe(0.25);
      expect(draft.unknownItems.length).toBe(0);
    });

    it('Scenario 4: ৳40 দামের কোকাকোলা দুইটা একটা ৳100 দামের স্প্রাইট।', () => {
      // "দুইটা" and "একটা" must NOT end up in unknownItems!
      // Must NOT match customer "মৌটু একটা লোক"
      const draft = parseComamCommand(
        '৳40 দামের কোকাকোলা দুইটা একটা ৳100 দামের স্প্রাইট।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.customer).toBeNull();
      expect(draft.customerName).toBeNull();
      expect(draft.items.length).toBe(2);

      const coke = draft.items.find((it) => it.nameBn?.includes('কোকাকোলা'));
      expect(coke).toBeDefined();
      expect(coke?.qty).toBe(2);

      const sprite = draft.items.find((it) => it.nameBn?.includes('স্প্রাইট'));
      expect(sprite).toBeDefined();
      expect(sprite?.qty).toBe(1);

      expect(draft.unknownItems.length).toBe(0);
    });

    it('Scenario 5: আমুল শক্তি তিনটা সুশীল সিংহের নামে।', () => {
      // Backward token scanner must stop at "তিনটা"
      // Customer must be "সুশীল সিংহ", NOT "তিনটা সুশীল সিংহ"
      // Item must be Amul Shakti with qty 3
      const draft = parseComamCommand(
        'আমুল শক্তি তিনটা সুশীল সিংহের নামে।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.customer).toBeDefined();
      expect(draft.customer?.name).toBe('সুশীল সিংহ');
      expect(draft.customerName).toBe('সুশীল সিংহ');
      expect(draft.paymentType).toBe('Due');
      expect(draft.items.length).toBe(1);

      const amul = draft.items[0];
      expect(amul.nameBn).toContain('আমুল শক্তি');
      expect(amul.qty).toBe(3);
      expect(draft.unknownItems.length).toBe(0);
    });

    it('Scenario 6: Traditional Bengali fraction units with পোয়া (আধা পোয়া, দেড় পোয়া, তিন পোয়া)', () => {
      // ১ পোয়া = 0.25 kg
      // আধা পোয়া = 0.125 kg
      // দেড় পোয়া = 0.375 kg
      // দুই পোয়া = 0.5 kg
      const draft1 = parseComamCommand('আধা পোয়া চিনি খোলা', mockProducts, mockCustomers);
      expect(draft1.items[0].qty).toBe(0.125);

      const draft2 = parseComamCommand('দেড় পোয়া চিনি খোলা', mockProducts, mockCustomers);
      expect(draft2.items[0].qty).toBe(0.375);

      const draft3 = parseComamCommand('দুই পোয়া চিনি খোলা', mockProducts, mockCustomers);
      expect(draft3.items[0].qty).toBe(0.5);
    });
  });
});

