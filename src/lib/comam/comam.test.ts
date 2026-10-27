import { describe, it, expect } from 'vitest';
import {
  bnToAscii,
  toBnDigits,
  formatBnNumber,
  formatBnTaka,
  parseNumberAt,
  findNumberPhrases,
} from './bn-parser';
import { searchProducts, findCustomer, stringSimilarity } from './comam-matcher';
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
  ];

  it('matches products and detects ambiguity', () => {
    const resChini = searchProducts(mockProducts, 'চিনি');
    expect(resChini.matches.length).toBeGreaterThan(0);
    expect(resChini.matches[0].product.nameBn).toBe('চিনি');
    expect(resChini.isAmbiguous).toBe(false);

    // 'বিস্কুট' matches two biscuit products closely -> ambiguous
    const resBiscuit = searchProducts(mockProducts, 'বিস্কুট');
    expect(resBiscuit.matches.length).toBe(2);
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
});
