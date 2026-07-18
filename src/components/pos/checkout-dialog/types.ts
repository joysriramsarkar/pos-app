import type { PaymentMethod, Sale } from '@/types/pos';

export interface CheckoutDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onComplete: (paymentData: PaymentData) => void;
  onPrint?: (paymentData: PaymentData) => void;
  isProcessing?: boolean;
  onCheckoutSuccess?: (sale: Sale) => void;
  onCheckoutError?: (error: string) => void;
  completedSale?: Sale | null;
}

export interface PaymentData {
  amountReceived: number;
  amountPaid: number;
  change: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  upiAmount?: number;
  customerId?: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  usePrepaid: boolean;
  prepaidAmountUsed: number;
  changeAsPrepayment?: number;
  debtRepaymentAmount?: number;
}

export const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];
