import type { Product } from '@/types/pos';

export interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSubmit?: (data: ProductFormData) => Promise<void> | void;
}

export interface ProductFormData {
  id?: string;
  name: string;
  nameBn?: string;
  barcode?: string;
  category: string;
  subCategory?: string;
  buyingPrice: number;
  sellingPrice: number;
  unit: string;
  currentStock: number;
  minStockLevel: number;
  isActive: boolean;
}

export const UNITS = [
  { value: 'piece', label: 'Piece (পিস)' },
  { value: 'kg', label: 'Kilogram (কেজি)' },
  { value: 'gram', label: 'Gram (গ্রাম)' },
  { value: 'liter', label: 'Liter (লিটার)' },
  { value: 'ml', label: 'Milliliter (মিলি)' },
  { value: 'packet', label: 'Packet (প্যাকেট)' },
  { value: 'bottle', label: 'Bottle (বোতল)' },
  { value: 'dozen', label: 'Dozen (ডজন)' },
  { value: 'box', label: 'Box (বাক্স)' },
];

export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Packaged Snacks',
  'Beverages',
  'Dairy & Frozen',
  'Personal Care',
  'Household & Cleaning',
  'Confectionery',
  'General',
];

/** Generate a 13-digit EAN-like barcode with India prefix. */
export const generateBarcode = (): string => {
  const prefix = '890';
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const random = (array[0] % 1000000000).toString().padStart(9, '0');
  const base = prefix + random;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return base + checkDigit;
};
