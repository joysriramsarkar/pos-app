import { z } from 'zod';
import { toMoneyNumber } from '@/lib/money';

const money = () => z.coerce.number().finite().transform((value) => toMoneyNumber(value));

export const ProductInputSchema = z.object({
  id: z.string().optional(),
  barcode: z.string().nullable().optional(),
  name: z.string().min(1, 'Product name is required'),
  nameBn: z.string().nullable().optional(),
  category: z.string().min(1, 'Category is required'),
  buyingPrice: money().pipe(z.number().min(0, 'Valid buying price is required')),
  sellingPrice: money().pipe(z.number().min(0, 'Valid selling price is required')),
  unit: z.string().default('piece'),
  currentStock: z.coerce.number().default(0),
  minStockLevel: z.coerce.number().default(5),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof ProductInputSchema>;

export const SaleItemInputSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.coerce.number().positive(),
  unitPrice: money().pipe(z.number().nonnegative()),
  totalPrice: money().pipe(z.number().nonnegative()),
});

export const SaleInputSchema = z.object({
  id: z.string().optional(),
  invoiceNumber: z.string().optional(),
  userId: z.string().nullable().optional(),
  items: z.array(SaleItemInputSchema).min(1, 'Items must be a non-empty array'),
  customerId: z.string().nullable().optional(),
  paymentMethod: z.string().optional().default('Cash'),
  amountReceived: money().pipe(z.number().nonnegative()).optional().default(0),
  amountPaid: money().pipe(z.number().nonnegative()).optional().default(0),
  cashAmount: money().pipe(z.number().nonnegative()).optional(),
  upiAmount: money().pipe(z.number().nonnegative()).optional(),
  discount: money().pipe(z.number().nonnegative()).optional().default(0),
  tax: money().pipe(z.number().nonnegative()).optional().default(0),
  notes: z.string().nullable().optional(),
  subtotal: money().pipe(z.number().nonnegative()).optional(),
  totalAmount: money().pipe(z.number().nonnegative()).optional(),
  paymentStatus: z.string().optional(),
  status: z.string().optional(),
  usePrepaid: z.boolean().optional().default(false),
  prepaidAmountUsed: money().pipe(z.number().nonnegative()).optional().default(0),
  changeAsPrepayment: money().pipe(z.number().nonnegative()).optional().default(0),
});

export type SaleItemInput = z.infer<typeof SaleItemInputSchema>;
export type SaleInput = z.infer<typeof SaleInputSchema>;

export const CustomerInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().nullable().optional().transform(v => v === '' ? null : v),
  address: z.string().nullable().optional().transform(v => v === '' ? null : v),
  notes: z.string().nullable().optional().transform(v => v === '' ? null : v),
  totalDue: money().optional(),
  totalPaid: money().optional(),
});

export type CustomerInput = z.infer<typeof CustomerInputSchema>;

export const StockAdjustmentInputSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  adjustmentType: z.enum(['home_consumption', 'damaged', 'expired', 'other']),
  reason: z.string().min(1, 'Reason is required'),
});

export type StockAdjustmentInput = z.infer<typeof StockAdjustmentInputSchema>;

export const StockEntryInputSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  purchasePrice: money().pipe(z.number().nonnegative('Purchase price must be non-negative')),
  date: z.string().optional(),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
});

export type StockEntryInput = z.infer<typeof StockEntryInputSchema>;

export const SupplierInputSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  phone: z.string().nullable().optional().transform(v => v === '' ? null : v),
  address: z.string().nullable().optional().transform(v => v === '' ? null : v),
  email: z.string().email('Invalid email').nullable().optional().transform(v => v === '' ? null : v),
  gstNumber: z.string().nullable().optional().transform(v => v === '' ? null : v),
  notes: z.string().nullable().optional().transform(v => v === '' ? null : v),
});

export type SupplierInput = z.infer<typeof SupplierInputSchema>;

export const ExpenseInputSchema = z.object({
  amount: money().pipe(z.number().positive('Amount must be positive')),
  category: z.string().min(1, 'Category is required'),
  notes: z.string().nullable().optional(),
  date: z.string().optional(),
  supplierId: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
});

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
