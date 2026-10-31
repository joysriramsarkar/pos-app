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
  hasWordMatch,
  findCustomer,
  extractDueQueryTarget,
  stripBengaliSuffixes,
  correctTranscriptWithCatalog,
} from './comam-matcher';
import { parseComamCommand, splitByKnownProducts } from './comam-engine';
import type { Product, Customer } from '../../types/pos';

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
    {
      id: 'p17',
      barcode: '1717',
      name: 'Amul Chocolate Syrup',
      nameBn: 'আমুল চকলেট সিরাপ',
      category: 'Confectionery',
      buyingPrice: 120,
      sellingPrice: 150,
      unit: 'piece',
      currentStock: 12,
      minStockLevel: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p18',
      barcode: '1818',
      name: 'Amul Dark Chocolate',
      nameBn: 'আমুল ডার্ক চকলেট',
      category: 'Confectionery',
      buyingPrice: 70,
      sellingPrice: 90,
      unit: 'piece',
      currentStock: 12,
      minStockLevel: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p19',
      barcode: '1919',
      name: 'Amul Shakti Milk',
      nameBn: 'আমুল শক্তি দুধ',
      category: 'Dairy & Frozen',
      buyingPrice: 28,
      sellingPrice: 35,
      unit: 'piece',
      currentStock: 12,
      minStockLevel: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p21',
      barcode: '2121',
      name: 'Soap',
      nameBn: 'সাবান',
      category: 'Household',
      buyingPrice: 28,
      sellingPrice: 35,
      unit: 'piece',
      currentStock: 60,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p22',
      barcode: '2222',
      name: 'Egg',
      nameBn: 'ডিম',
      category: 'Dairy',
      buyingPrice: 6,
      sellingPrice: 7,
      unit: 'piece',
      currentStock: 120,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p23',
      barcode: '2323',
      name: 'Maggi Noodles',
      nameBn: 'ম্যাগি নুডলস',
      category: 'Packaged Snacks',
      buyingPrice: 12,
      sellingPrice: 15,
      unit: 'piece',
      currentStock: 40,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p24',
      barcode: '2424',
      name: 'Navy Cut Cigarette',
      nameBn: 'নেভিকাট সিগারেট',
      category: 'Tobacco',
      buyingPrice: 14,
      sellingPrice: 18,
      unit: 'piece',
      currentStock: 100,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p25',
      barcode: '2525',
      name: 'Gold Flake Cigarette',
      nameBn: 'গোল্ড ফ্ল্যাক সিগারেট',
      category: 'Tobacco',
      buyingPrice: 12,
      sellingPrice: 15,
      unit: 'piece',
      currentStock: 100,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p26',
      barcode: '2626',
      name: 'Shikhar Cigarette',
      nameBn: 'শিখর সিগারেট',
      category: 'Tobacco',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 100,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p27',
      barcode: '2727',
      name: 'Paper Boat Jeera Rs. 20',
      nameBn: 'পেপার বোট জিরা ২০ টাকা',
      category: 'Beverages',
      buyingPrice: 16,
      sellingPrice: 20,
      unit: 'piece',
      currentStock: 30,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p28',
      barcode: '2828',
      name: 'Paper Boat Litchi Rs. 20',
      nameBn: 'পেপার বোট লিচু ২০ টাকা',
      category: 'Beverages',
      buyingPrice: 16,
      sellingPrice: 20,
      unit: 'piece',
      currentStock: 30,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p20',
      barcode: '2020',
      name: 'Pepsi Black Rs. 10',
      nameBn: 'পেপসি কালো ১০ টাকা',
      category: 'Beverages',
      buyingPrice: 8,
      sellingPrice: 10,
      unit: 'piece',
      currentStock: 24,
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
      name: 'লক্ষণ সরকার',
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
        barcode: `b_${i}`,
        category: 'General',
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

    it('Scenario 7 (reported 28 Oct): repeated একটা-led items without commas + ASR আমূল variant + 1:10 Pepsi', () => {
      // No commas between the first three items; ASR wrote আমূল (long ূ) for আমুল.
      // Every item must be found separately — never one merged unknown blob.
      const draft = parseComamCommand(
        'একটা আমূল চকলেট সিরাপ একটা আমুল ডার্ক চকলেট একটা আমুল শক্তি দুধ এবং 1:10 টাকা দামের পেপসি।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.customer).toBeNull();
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(4);

      const syrup = draft.items.find((it) => it.product.id === 'p17');
      expect(syrup).toBeDefined();
      expect(syrup?.qty).toBe(1);

      const dark = draft.items.find((it) => it.product.id === 'p18');
      expect(dark).toBeDefined();
      expect(dark?.qty).toBe(1);

      const shaktiMilk = draft.items.find((it) => it.product.id === 'p19');
      expect(shaktiMilk).toBeDefined();
      expect(shaktiMilk?.qty).toBe(1);

      const pepsi = draft.items.find((it) => it.product.id === 'p20');
      expect(pepsi).toBeDefined();
      expect(pepsi?.qty).toBe(1);
      expect(pepsi?.unitPrice).toBe(10);

      expect(draft.total).toBe(150 + 90 + 35 + 10);
    });

    it('Scenario 8: quantity-led list with mixed leading/trailing quantities stays split per item', () => {
      const draft = parseComamCommand(
        'দুইটা আমুল ডার্ক চকলেট, একটা আমুল চকলেট সিরাপ আর আমুল শক্তি দুধ তিনটা',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(3);
      expect(draft.items.find((it) => it.product.id === 'p18')?.qty).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p17')?.qty).toBe(1);
      expect(draft.items.find((it) => it.product.id === 'p19')?.qty).toBe(3);
    });

    it('Scenario 9: Bengali query matches English-only catalog names (Amul)', () => {
      const englishOnly: Product[] = [
        {
          id: 'e1',
          barcode: 'e1',
          name: 'Amul Dark Chocolate',
          category: 'Confectionery',
          buyingPrice: 70,
          sellingPrice: 90,
          unit: 'piece',
          currentStock: 10,
          minStockLevel: 2,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'e2',
          barcode: 'e2',
          name: 'Amul Chocolate Syrup',
          category: 'Confectionery',
          buyingPrice: 120,
          sellingPrice: 150,
          unit: 'piece',
          currentStock: 10,
          minStockLevel: 2,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const draft = parseComamCommand(
        'একটা আমুল ডার্ক চকলেট একটা আমুল চকলেট সিরাপ',
        englishOnly,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'e1')?.qty).toBe(1);
      expect(draft.items.find((it) => it.product.id === 'e2')?.qty).toBe(1);
    });

    it('Scenario 10: product-first items with trailing quantities and no commas', () => {
      const draft = parseComamCommand(
        'চিনি দুই কেজি সাবান তিনটা ডিম এক ডজন',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(3);
      expect(draft.items.find((it) => it.product.id === 'p1')?.qty).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p21')?.qty).toBe(3);
      expect(draft.items.find((it) => it.product.id === 'p22')?.qty).toBe(12);
    });

    it('Scenario 11: trailing-then-leading Amul items without commas', () => {
      const draft = parseComamCommand(
        'আমুল ডার্ক চকলেট দুইটা আমুল চকলেট সিরাপ একটা',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.ambiguities.length).toBe(0);
      expect(draft.items.length).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p18')?.qty).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p17')?.qty).toBe(1);
    });

    it('Scenario 12: brand-only speech matches the branded product ("ম্যাগি" = Maggi Noodles)', () => {
      const draft = parseComamCommand(
        'একটা ম্যাগি একটা আমুল ডার্ক চকলেট',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(2);
      const maggi = draft.items.find((it) => it.product.id === 'p23');
      expect(maggi).toBeDefined();
      expect(maggi?.qty).toBe(1);
      expect(draft.items.find((it) => it.product.id === 'p18')).toBeDefined();

      const fullName = parseComamCommand('দুইটা ম্যাগি নুডলস', mockProducts, mockCustomers);
      expect(fullName.items.length).toBe(1);
      expect(fullName.items[0].product.id).toBe('p23');
      expect(fullName.items[0].qty).toBe(2);
    });

    it('Scenario 13: a spoken item truly missing from the catalog stays unknown, neighbours still bill', () => {
      const draft = parseComamCommand(
        'একটা হরলিক্স একটা আমুল ডার্ক চকলেট',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.items.length).toBe(1);
      expect(draft.items[0].product.id).toBe('p18');
      expect(draft.unknownItems.length).toBe(1);
      expect(draft.unknownItems[0].text).toContain('হরলিক্স');
    });

    it('Scenario 14 (reported 28 Oct): correctly spoken cigarette brands bill exactly', () => {
      const draft = parseComamCommand(
        'নেভিকাট সিগারেট ৫টা আর গোল্ড ফ্ল্যাক সিগারেট ১০টা।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p24')?.qty).toBe(5);
      expect(draft.items.find((it) => it.product.id === 'p25')?.qty).toBe(10);
    });

    it('Scenario 15 (reported 28 Oct): garbled ASR transcript of the same sentence still bills correctly', () => {
      // What bn-BD speech recognition actually produced on the shop device:
      // নেভিকাট -> নেভিকাড (ট/ড), গোল্ড ফ্ল্যাক -> গোল্ডফ্রেক (joined, ল/র),
      // with the generic word and quantities reordered across pauses.
      const draft = parseComamCommand(
        'নেভিকাড। সিগারেট পাঁচটা গোল্ডফ্রেক, সিগারেট দশটা।',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p24')?.qty).toBe(5);
      expect(draft.items.find((it) => it.product.id === 'p25')?.qty).toBe(10);
      // The generic word alone must never bill a random cigarette brand.
      expect(draft.items.find((it) => it.product.id === 'p26')).toBeUndefined();
    });

    it('Scenario 16: joined ASR brand token (পেপারবোর্ড for পেপার বোট) matches the right flavour', () => {
      const draft = parseComamCommand(
        'পেপারবোর্ড জিরা দুইটা',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(1);
      expect(draft.items[0].product.id).toBe('p27');
      expect(draft.items[0].qty).toBe(2);
    });

    it('Scenario 17: catalog-aware transcript correction repairs ASR brand spellings for display', () => {
      const fixed = correctTranscriptWithCatalog(
        'নেভিকাড সিগারেট পাঁচটা গোল্ডফ্রেক সিগারেট দশটা',
        mockProducts
      );
      expect(fixed).toContain('নেভিকাট');
      expect(fixed).toContain('গোল্ড ফ্ল্যাক');
      expect(fixed).not.toContain('নেভিকাড');
      expect(fixed).not.toContain('গোল্ডফ্রেক');
    });

    it('Scenario 18 (reported 28 Oct): the sentence the shopkeeper actually said bills exactly', () => {
      const draft = parseComamCommand(
        'দুইটা নেভিকাট সিগারেট, গোল্ডফ্ল্যাক এবং আমুল শক্তি তিনটা',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(3);
      expect(draft.items.find((it) => it.product.id === 'p24')?.qty).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p25')?.qty).toBe(1);
      const shakti = draft.items.find((it) => it.product.id === 'p10' || it.product.id === 'p19');
      expect(shakti).toBeDefined();
      expect(shakti?.qty).toBe(3);
    });

    it('Scenario 19 (reported 28 Oct): the garbled Muse transcript of that sentence still bills the same', () => {
      // What Muse ASR actually returned: garbage tokens (রাস্কইট, ক্যাপচার),
      // stuttered duplicates (গোল্ড গোল্ড, আমূল আমূল), a hallucinated ৫,
      // and a trailing descriptor দুধ that must not become a second milk item.
      const draft = parseComamCommand(
        'দুইটা নেভিকাট রাস্কইট গোল্ড গোল্ড ফ্ল্যাক ক্যাপচার সিগারেট ৫ এবং আমূল আমূল শক্তি ৩টা দুধ',
        mockProducts,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(3);
      expect(draft.items.find((it) => it.product.id === 'p24')?.qty).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p25')?.qty).toBe(1);
      const shakti = draft.items.find((it) => it.product.id === 'p10' || it.product.id === 'p19');
      expect(shakti).toBeDefined();
      expect(shakti?.qty).toBe(3);
      expect(draft.total).toBeLessThan(500);
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

    it('Scenario 20 (reported 28 Oct): user screenshot sentence with cigarette quantities and prices', () => {
      const prods = [
        ...mockProducts,
        {
          id: 'p35',
          barcode: '3535',
          name: 'Navy Cut Small Rs. 6',
          nameBn: 'নেভিকাট ছোটো ৬ টাকা',
          category: 'Tobacco',
          buyingPrice: 5,
          sellingPrice: 6,
          unit: 'piece' as const,
          currentStock: 100,
          minStockLevel: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p36',
          barcode: '3636',
          name: 'Capture Cigarette Rs. 5',
          nameBn: 'ক্যাপচার সিগারেট ৫ টাকা',
          category: 'Tobacco',
          buyingPrice: 4,
          sellingPrice: 5,
          unit: 'piece' as const,
          currentStock: 100,
          minStockLevel: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const draft = parseComamCommand(
        'নেভিকাট ছোটো ৬ ক্যাপচার সিগারেট ৫ ক্যাপচার সিগারেট',
        prods,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(3);
      expect(draft.items[0].product.id).toBe('p35');
      expect(draft.items[0].qty).toBe(1);
      expect(draft.items[0].unitPrice).toBe(6);
      expect(draft.items[1].product.id).toBe('p36');
      expect(draft.items[1].qty).toBe(1);
      expect(draft.items[2].product.id).toBe('p36');
      expect(draft.items[2].qty).toBe(1);
      expect(draft.total).toBe(16);
    });

    it('Scenario 21 (reported 28 Oct): rapid unpunctuated multi-product speech with "টু" quantity', () => {
      const prods = [
        ...mockProducts,
        {
          id: 'p30',
          barcode: '3030',
          name: 'Good Knight Oil Rs. 90',
          nameBn: 'গুড নাইট অয়েল ৯০ টাকা',
          category: 'Household',
          buyingPrice: 70,
          sellingPrice: 90,
          unit: 'piece' as const,
          currentStock: 10,
          minStockLevel: 2,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p31',
          barcode: '3131',
          name: 'Kelloggs Multigrain Chocos Rs. 20',
          nameBn: "কেলোগ'স মাল্টিগ্রেইন চকোস ২০ টাকা",
          category: 'Packaged Snacks',
          buyingPrice: 16,
          sellingPrice: 20,
          unit: 'piece' as const,
          currentStock: 20,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p32',
          barcode: '3232',
          name: 'Amul Kool Coffee Rs. 60',
          nameBn: 'আমুল কুল কফি ৬০ টাকা',
          category: 'Beverages',
          buyingPrice: 48,
          sellingPrice: 60,
          unit: 'piece' as const,
          currentStock: 15,
          minStockLevel: 3,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const draft = parseComamCommand(
        'টু গুড নাইট অয়েল কেলোগ স মাল্টিগ্রেইন চকোস আমুল কোজ কফি আমুল শক্তি',
        prods,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.unknownItems.length).toBe(0);
      expect(draft.items.length).toBe(4);
      const gn = draft.items.find((it) => it.product.id === 'p30');
      expect(gn).toBeDefined();
      expect(gn?.qty).toBe(2);
      expect(draft.items.find((it) => it.product.id === 'p31')).toBeDefined();
      expect(draft.items.find((it) => it.product.id === 'p32')).toBeDefined();
      expect(draft.items.find((it) => it.product.id === 'p10' || it.product.id === 'p19')).toBeDefined();
    });

    it('Scenario 22 (reported 28 Oct): rapid unpunctuated multi-product speech with colloquial tokens', () => {
      const prods = [
        ...mockProducts,
        {
          id: 'p33',
          barcode: '3333',
          name: 'Biskfarm Butter Ruskit Rs. 10',
          nameBn: 'বিস্কফার্ম বাটার রাস্কইট দাম ১০',
          category: 'Confectionery',
          buyingPrice: 8,
          sellingPrice: 10,
          unit: 'piece' as const,
          currentStock: 30,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p34',
          barcode: '3434',
          name: 'Pepsi Rs. 20',
          nameBn: 'পেপসি ২০ টাকা',
          category: 'Beverages',
          buyingPrice: 16,
          sellingPrice: 20,
          unit: 'piece' as const,
          currentStock: 30,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const draft = parseComamCommand(
        'আমল সিরাম আমুল স্লিম দুধ টাকা বাটার রাইডেন্ট দাম পেপসি',
        prods,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      // No concatenated multi-word unknown items!
      expect(draft.unknownItems.every((u) => u.text.split(/\s+/).length <= 2)).toBe(true);
      expect(draft.items.length).toBeGreaterThanOrEqual(2);
      expect(draft.items.find((it) => it.product.id === 'p34')).toBeDefined();
      expect(draft.items.find((it) => it.product.id === 'p33')).toBeDefined();
    });

    it('Scenario 23 (reported 29 Oct): ৳১৩ দামের একটা গোল্ড ফ্লেক্স সিগারেট।', () => {
      const prods: Product[] = [
        {
          id: 'p1',
          barcode: '101',
          name: 'Gol Morich Rs. 10',
          nameBn: 'গোল মরিচ ১০ টাকা',
          category: 'Groceries',
          buyingPrice: 8,
          sellingPrice: 10,
          unit: 'piece' as const,
          currentStock: 20,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p2',
          barcode: '102',
          name: 'Deepti Gol Khasta Biscuit Rs. 60',
          nameBn: 'দীপ্তি গোল খাস্তা বিস্কুট ৬০ টাকা',
          category: 'Packaged Snacks',
          buyingPrice: 50,
          sellingPrice: 60,
          unit: 'piece' as const,
          currentStock: 20,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p3',
          barcode: '103',
          name: 'City Gold 100g',
          nameBn: 'সিটি গোল্ড ১০০ গ্রাম',
          category: 'General',
          buyingPrice: 40,
          sellingPrice: 54,
          unit: 'piece' as const,
          currentStock: 10,
          minStockLevel: 2,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p4',
          barcode: '104',
          name: "Kellogg's Corn Flakes Rs. 20",
          nameBn: 'কেলগস কর্ন ফ্লেক্স ২০ টাকা',
          category: 'Packaged Snacks',
          buyingPrice: 16,
          sellingPrice: 20,
          unit: 'piece' as const,
          currentStock: 15,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p4b',
          barcode: '104b',
          name: "Kellogg's Corn Flakes Rs. 95",
          nameBn: 'কেলগস কর্ন ফ্লেক্স ৯৫ টাকা',
          category: 'Packaged Snacks',
          buyingPrice: 80,
          sellingPrice: 95,
          unit: 'piece' as const,
          currentStock: 15,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p4c',
          barcode: '104c',
          name: "Kellogg's Corn Flakes Rs. 10",
          nameBn: 'কেলগস কর্ন ফ্লেক্স ১০ টাকা',
          category: 'Packaged Snacks',
          buyingPrice: 8,
          sellingPrice: 10,
          unit: 'piece' as const,
          currentStock: 15,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p5',
          barcode: '105',
          name: 'Gold Flake King Rs. 20',
          nameBn: 'গোল্ড ফ্ল্যাক কিং ২০ টাকা',
          category: 'Cigarettes',
          buyingPrice: 16,
          sellingPrice: 20,
          unit: 'piece' as const,
          currentStock: 50,
          minStockLevel: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p5b',
          barcode: '105b',
          name: 'Gold Flake King Rs. 25',
          nameBn: 'গোল্ড ফ্ল্যাক কিং ২৫ টাকা',
          category: 'Cigarettes',
          buyingPrice: 20,
          sellingPrice: 25,
          unit: 'piece' as const,
          currentStock: 50,
          minStockLevel: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p5c',
          barcode: '105c',
          name: 'Gold Flake Light Rs. 20',
          nameBn: 'গোল্ড ফ্ল্যাক লাইট ২০ টাকা',
          category: 'Cigarettes',
          buyingPrice: 16,
          sellingPrice: 20,
          unit: 'piece' as const,
          currentStock: 50,
          minStockLevel: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p6',
          barcode: '106',
          name: 'Gold Flake Rs. 13',
          nameBn: 'গোল্ড ফ্ল্যাক ১৩ টাকা',
          category: 'Cigarettes',
          buyingPrice: 10,
          sellingPrice: 13,
          unit: 'piece' as const,
          currentStock: 50,
          minStockLevel: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const fixedText = correctTranscriptWithCatalog(
        '৳১৩ দামের একটা গোল্ড ফ্লেক্স সিগারেট।',
        prods
      );
      expect(fixedText).toContain('গোল্ড ফ্ল্যাক');
      expect(fixedText).not.toContain('ফ্লেক্স');

      const draft = parseComamCommand(
        fixedText,
        prods,
        mockCustomers
      );
      expect(draft.kind).toBe('sale');
      expect(draft.items.length).toBe(1);
      expect(draft.items[0].product.id).toBe('p6');
      expect(draft.items[0].qty).toBe(1);
      expect(draft.unknownItems.length).toBe(0);

      // Edge case: if exact 13 Tk pack does not exist in store, it bills the closest Gold Flake variant with ambiguity options
      const prodsWithout13 = prods.filter((p) => p.id !== 'p6');
      const draft2 = parseComamCommand(
        '৳১৩ দামের একটা গোল্ড ফ্লেক্স সিগারেট।',
        prodsWithout13,
        mockCustomers
      );
      expect(draft2.kind).toBe('sale');
      expect(draft2.items.length).toBe(1);
      expect(draft2.items[0].product.nameBn).toContain('গোল্ড ফ্ল্যাক');
      expect(draft2.items[0].ambiguous).toBe(true);
      expect(draft2.items[0].options?.every((opt) => opt.nameBn?.includes('গোল্ড ফ্ল্যাক'))).toBe(true);
      expect(draft2.unknownItems.length).toBe(0);
    });

    it('Scenario 24 (current_problems verification): due queries for specific customers vs general due', () => {
      // 1. Specific customer due queries with spelling/suffix variants
      const draftRahim = parseComamCommand('রহিমের বাকি কত?', mockProducts, mockCustomers);
      expect(draftRahim.kind).toBe('due_query');
      expect(draftRahim.customer?.name).toBe('রহিম');
      expect(draftRahim.summaryBn).toContain('৩৫০ টাকা');

      const draftSushil = parseComamCommand('সুশীল সিংহ এর বাকি কত?', mockProducts, mockCustomers);
      expect(draftSushil.kind).toBe('due_query');
      expect(draftSushil.customer?.name).toBe('সুশীল সিংহ');
      expect(draftSushil.summaryBn).toContain('২৫০ টাকা');

      const draftLakhan = parseComamCommand('লক্ষণ সরকারের বাকি কত টাকা?', mockProducts, mockCustomers);
      expect(draftLakhan.kind).toBe('due_query');
      expect(draftLakhan.customer?.name).toBe('লক্ষণ সরকার');

      // General due queries
      const draftGeneral = parseComamCommand('কার কত বাকি?', mockProducts, mockCustomers);
      expect(draftGeneral.kind).toBe('due_query');
      expect(draftGeneral.customer).toBeNull();
      expect(draftGeneral.summaryBn).toContain('সকল ক্রেতার');

      const draftGeneral2 = parseComamCommand('মোট বাকি কত?', mockProducts, mockCustomers);
      expect(draftGeneral2.kind).toBe('due_query');
      expect(draftGeneral2.customer).toBeNull();
    });

    it('Scenario 25 (current_problems verification): sales reports & product sales inquiries', () => {
      // 1. "কোন পণ্য কয়টা বিক্রি হয়েছে?" -> top_products report
      const draftTop = parseComamCommand('কোন পণ্য কয়টা বিক্রি হয়েছে?', mockProducts, mockCustomers);
      expect(draftTop.kind).toBe('report');
      expect(draftTop.report).toBe('top_products');
      expect(draftTop.unknownItems.length).toBe(0);

      // 2. "আজকের রিপোর্ট দেখাও" -> sales_summary report
      const draftReport = parseComamCommand('আজকের রিপোর্ট দেখাও', mockProducts, mockCustomers);
      expect(draftReport.kind).toBe('report');
      expect(draftReport.report).toBe('sales_summary');
      expect(draftReport.unknownItems.length).toBe(0);

      // 3. Specific product sales query: "আজ চিনি কতটুকু বিক্রি হলো?"
      const draftChini = parseComamCommand('আজ চিনি কতটুকু বিক্রি হলো?', mockProducts, mockCustomers);
      expect(draftChini.kind).toBe('report');
      expect(draftChini.report).toBe('product_sales');
      expect(draftChini.targetProduct?.nameBn).toBe('চিনি');
    });

    it('Scenario 26 (current_problems verification): decimal pronunciation in TTS speech text', () => {
      const speech1 = formatForBengaliSpeech('মোট বাকি ১০২৩.৫ টাকা');
      expect(speech1).toContain('দশমিক');
      expect(speech1).not.toContain('১০২৩.৫');

      const speech2 = formatForBengaliSpeech('পুঁটকি দিয়ে হিসাব হবে না');
      expect(speech2).toContain('দশমিক');
      expect(speech2).not.toContain('পুঁটকি');
    });
  });
});

describe('Voice master plan (MP-40/MP-41)', () => {
  const products: Product[] = [
    {
      id: 'vp1', barcode: '1', name: 'Sugar', nameBn: 'চিনি', category: 'Grocery',
      buyingPrice: 50, sellingPrice: 60, unit: 'kg', currentStock: 100,
      minStockLevel: 10, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: 'vp2', barcode: '2', name: 'Soap', nameBn: 'সাবান', category: 'Care',
      buyingPrice: 28, sellingPrice: 35, unit: 'piece', currentStock: 100,
      minStockLevel: 10, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    },
  ];

  it('flags a large heard quantity but never remaps it (পনেরো stays 15)', () => {
    const d = parseComamCommand('পনেরো কেজি চিনি', products, []);
    expect(d.items[0]?.qty).toBe(15);
    expect(d.warnings?.length).toBe(1);
  });

  it('stays silent for ordinary quantities', () => {
    const d = parseComamCommand('দুই কেজি চিনি', products, []);
    expect(d.warnings).toEqual([]);
  });

  it('flags >=100 pieces (field regression FR-1 shape)', () => {
    const d = parseComamCommand('দুইশোটা সাবান', products, []);
    expect(d.items[0]?.qty).toBe(200);
    expect(d.warnings?.length).toBe(1);
  });

  it('builds deduped ASR keywords from the catalog', async () => {
    const { buildAsrKeywords } = await import('./comam-transcribe');
    const words = buildAsrKeywords(
      [{ name: 'Sugar', nameBn: 'চিনি' }, { name: 'Sugar', nameBn: 'চিনি' }],
      [{ name: 'রহিম' }]
    );
    expect(new Set(words).size).toBe(words.length);
    expect(words).toContain('চিনি');
    expect(words).toContain('পৌনে');
    expect(words.length).toBeLessThanOrEqual(200);
  });

  it('rejects non-WAV audio before any network call', async () => {
    const { transcribeAudio, TranscribeError } = await import('./comam-transcribe');
    const prev = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = 'test-key';
    try {
      await expect(transcribeAudio(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
        TranscribeError
      );
    } finally {
      if (prev === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = prev;
    }
  });

  it('picks recording mime types in order and gates silent clips', async () => {
    const { pickMimeType, assessClip } = await import('./audio-utils');
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(assessClip(200, 0.5)).toBe('too_short');
    expect(assessClip(2000, 0.001)).toBe('too_quiet');
    expect(assessClip(2000, 0.4)).toBe('ok');
  });
});

