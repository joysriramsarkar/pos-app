'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Banknote,
  Smartphone,
  Clock,
  Wallet,
} from 'lucide-react';
import type { PaymentMethod, Sale, Customer } from '@/types/pos';
import { useCartStore, useUIStore, useProductsStore, useCustomersStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTranslations } from 'next-intl';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';
import PrintDialog from '../PrintDialog';
import { useNumberFormat } from '@/hooks/use-number-format';
import {
  type CheckoutDialogProps,
  type PaymentData,
} from './types';
import { CheckoutSuccess } from './CheckoutSuccess';
import { CheckoutForm } from './CheckoutForm';

export type { CheckoutDialogProps, PaymentData } from './types';

export function CheckoutDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onComplete,
  onPrint,
  isProcessing = false,
  onCheckoutSuccess,
  onCheckoutError,
  completedSale,
}: CheckoutDialogProps) {
  const [inputError, setInputError] = useState<string | null>(null);
  const [usePrepaid, setUsePrepaid] = useState(false);
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);

  const prevOpenRef = useRef(false);

  const t = useTranslations('Checkout');
  const tc = useTranslations('Common');
  const { formatPrice, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol);
  const { data: session } = useSession();
  const cashierName = (session?.user as any)?.name || (session?.user as any)?.username || 'অ্যাডমিন';

  const isCurrentlyProcessing = isProcessing || isLocalProcessing;
  const showSuccess = !!completedSale && !isCurrentlyProcessing;
  const lastSale = completedSale;

  useEffect(() => {
    if (showSuccess && onCheckoutSuccess && lastSale) {
      onCheckoutSuccess(lastSale);
    }
  }, [showSuccess, lastSale, onCheckoutSuccess]);

  const activeTab = useCartStore((state) => state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0]);
  const items = activeTab.items;
  const discount = activeTab.discount;
  const tax = activeTab.tax;
  const customerId = activeTab.customerId;
  const paymentMethod = activeTab.paymentMethod;
  const getSubtotal = useCartStore((state) => state.getSubtotal);
  const getTotal = useCartStore((state) => state.getTotal);
  const clearCart = useCartStore((state) => state.clearCart);
  
  const customer = useCustomersStore((state) => state.customers.find(c => c.id === customerId));
  const displayedCustomerName = customer?.name || activeTab.customerName;

  const products = useProductsStore((state) => state.products);
  const isCheckoutOpen = useUIStore((state) => state.isCheckoutOpen);
  const setCheckoutOpen = useUIStore((state) => state.setCheckoutOpen);
  const setPrintDialogOpen = useUIStore((state) => state.setPrintDialogOpen);
  const setCurrentSale = useUIStore((state) => state.setCurrentSale);

  const isOpen = controlledOpen !== undefined ? controlledOpen : isCheckoutOpen;
  const setOpen = controlledOnOpenChange || setCheckoutOpen;

  const subtotal = getSubtotal();
  const total = getTotal();

  const prepaidAmountToUse = useMemo(() => {
    if (usePrepaid && customer && toMoneyNumber(customer.prepaidBalance) > 0) {
      return Math.min(total, toMoneyNumber(customer.prepaidBalance));
    }
    return 0;
  }, [usePrepaid, customer, total]);

  const remainingTotal = useMemo(() => total - prepaidAmountToUse, [total, prepaidAmountToUse]);

  const [amountReceived, setAmountReceived] = useState<string>('');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [upiReceived, setUpiReceived] = useState<string>('');
  const [prepaymentAmount, setPrepaymentAmount] = useState<string>('');
  const [debtRepaymentAmount, setDebtRepaymentAmount] = useState<string>('');

  // Auto-update amount when remainingTotal changes (usePrepaid toggle)
  const updateAmountFields = useCallback(() => {
    if (paymentMethod === 'Mixed') {
      setCashReceived(remainingTotal.toString());
      setUpiReceived('');
      setAmountReceived('');
    } else {
      setAmountReceived(remainingTotal.toString());
      setCashReceived('');
      setUpiReceived('');
    }
  }, [remainingTotal, paymentMethod]);

  useEffect(() => {
    if (!isOpen) return;
    updateAmountFields();
  }, [isOpen, updateAmountFields]);

  const parsedAmount = useMemo(() => {
    if (paymentMethod === 'Mixed') {
      const c = parseFloat(cashReceived);
      const u = parseFloat(upiReceived);
      const cv = isNaN(c) ? 0 : c;
      const uv = isNaN(u) ? 0 : u;
      return cv + uv;
    }
    const parsed = parseFloat(amountReceived);
    return isNaN(parsed) ? 0 : parsed;
  }, [amountReceived, cashReceived, upiReceived, paymentMethod]);

  const change = useMemo(() => {
    return parsedAmount - remainingTotal;
  }, [parsedAmount, remainingTotal]);

  const isValidPayment = useMemo(() => {
    if (remainingTotal === 0) return true; // Fully paid by prepaid balance
    if (paymentMethod === 'Due') return true;
    if (customerId && parsedAmount < remainingTotal) return true; // Partial payments
    return parsedAmount >= remainingTotal;
  }, [paymentMethod, parsedAmount, remainingTotal, customerId]);



  // Reset form when dialog opens (using ref to avoid stale closures)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setInputError(null);
      setUsePrepaid(false);
      setPrepaymentAmount('');
      setDebtRepaymentAmount('');
      setIsLocalProcessing(false);
      updateAmountFields();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, updateAmountFields]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) setCheckoutOpen(false);
    },
    [setOpen, setCheckoutOpen]
  );

  const handleClose = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = convertBengaliToEnglishNumerals(e.target.value);
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmountReceived(value);
      setInputError(null);
    }
  }, []);

  const handleCashChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = convertBengaliToEnglishNumerals(e.target.value);
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setCashReceived(value);
      setInputError(null);
    }
  }, []);

  const handleUpiChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = convertBengaliToEnglishNumerals(e.target.value);
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setUpiReceived(value);
      setInputError(null);
    }
  }, []);

  const handleQuickAmount = useCallback((amount: number) => {
    if (paymentMethod === 'Mixed') {
      setCashReceived(amount.toString());
      setUpiReceived('');
    } else {
      setAmountReceived(amount.toString());
    }
    setInputError(null);
  }, [paymentMethod]);

  const handleExactAmount = useCallback(() => {
    if (paymentMethod === 'Mixed') {
      setCashReceived(Math.ceil(remainingTotal).toString());
      setUpiReceived('');
    } else {
      setAmountReceived(Math.ceil(remainingTotal).toString());
    }
    setInputError(null);
  }, [remainingTotal, paymentMethod]);

  const handleComplete = useCallback(async () => {
    if (paymentMethod !== 'Due' && parsedAmount < remainingTotal && !customerId) {
      setInputError(t('insufficient_amount', { amount: formatPrice(remainingTotal - parsedAmount) }));
      return;
    }

    const pAmt = Number(prepaymentAmount) || 0;
    const dAmt = Number(debtRepaymentAmount) || 0;
    if (pAmt + dAmt > Math.max(0, change)) {
      setInputError(t('allocation_exceeds_change') || 'Allocation exceeds change amount');
      return;
    }

    if (customer && dAmt > toMoneyNumber(customer.totalDue)) {
      setInputError(t('repayment_exceeds_due', { max: formatPrice(toMoneyNumber(customer.totalDue)) }) || `Debt repayment cannot exceed customer's outstanding due balance of ${formatPrice(toMoneyNumber(customer.totalDue))}`);
      return;
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const cartItem of items) {
      const product = productMap.get(cartItem.productId);
      if (!product) {
        setInputError(t('product_no_longer_exists', { name: cartItem.productName }));
        return;
      }
    }

    const finalPaymentMethod = remainingTotal === 0 ? 'Prepaid' : paymentMethod;
    const changeAmount = finalPaymentMethod === 'Due' ? 0 : Math.max(0, change);
    const externalAmountApplied = finalPaymentMethod === 'Due'
      ? 0
      : Math.min(parsedAmount, remainingTotal);

    const amountPaidForSale = prepaidAmountToUse + externalAmountApplied;

    let finalCashAmount = 0;
    let finalUpiAmount = 0;

    if (finalPaymentMethod === 'Mixed') {
      const cashTendered = Number(cashReceived) || 0;
      const upiTendered = Number(upiReceived) || 0;
      finalCashAmount = Math.min(cashTendered, externalAmountApplied);
      finalUpiAmount = Math.min(upiTendered, Math.max(0, externalAmountApplied - finalCashAmount));
    } else if (finalPaymentMethod === 'Cash') {
      finalCashAmount = externalAmountApplied;
    } else if (finalPaymentMethod === 'UPI') {
      finalUpiAmount = externalAmountApplied;
    }

    const paymentData: PaymentData = {
      amountReceived: parsedAmount,
      amountPaid: amountPaidForSale,
      change: changeAmount,
      paymentMethod: finalPaymentMethod,
      cashAmount: finalCashAmount,
      upiAmount: finalUpiAmount,
      customerId,
      subtotal,
      discount,
      tax,
      total,
      usePrepaid,
      prepaidAmountUsed: prepaidAmountToUse,
      changeAsPrepayment: pAmt,
      debtRepaymentAmount: dAmt,
    };
    
    setIsLocalProcessing(true);
    try {
      await onComplete(paymentData);
    } finally {
      setIsLocalProcessing(false);
    }
  }, [
    paymentMethod,
    parsedAmount,
    total,
    remainingTotal,
    items,
    products,
    customerId,
    subtotal,
    discount,
    tax,
    onComplete,
    change,
    usePrepaid,
    prepaidAmountToUse,
    cashReceived,
    upiReceived,
    prepaymentAmount,
    debtRepaymentAmount,
  ]);

  const [showReceiptPrint, setShowReceiptPrint] = useState(false);
  const handlePrint = useCallback(() => {
    if (lastSale) {
      setShowReceiptPrint(true);
    }
  }, [lastSale]);

  const paymentMethodIcon = useMemo(() => {
    const finalPaymentMethod = remainingTotal === 0 ? 'Prepaid' : paymentMethod;
    switch (finalPaymentMethod) {
      case 'Cash': return <Banknote className="w-2 h-2" />;
      case 'UPI': return <Smartphone className="w-2 h-2" />;
      case 'Mixed': return (<div className="flex items-center gap-1"><Banknote className="w-2 h-2" /><Smartphone className="w-2 h-2" /></div>);
      case 'Due': return <Clock className="w-4 h-4" />;
      case 'Prepaid': return <Wallet className="w-4 h-4 text-green-600" />;
      default: return null;
    }
  }, [paymentMethod, remainingTotal]);

  const displayedTotal = lastSale ? (lastSale.totalAmount ?? total) : total;
  const displayedPaymentMethod = lastSale ? (lastSale.paymentMethod as string) : paymentMethod;
  const displayedChange = lastSale
    ? Math.max(0, (Number(lastSale.amountPaid || 0) - Number(lastSale.totalAmount || 0)))
    : change;

  const saleForPrint = lastSale ? {
    ...lastSale,
    customer: (lastSale.customer || customer) ? {
      id: customerId || lastSale.customerId || '',
      name: customer?.name || activeTab.customerName || lastSale.customer?.name || '',
      phone: customer?.phone || lastSale.customer?.phone || '',
      address: customer?.address || lastSale.customer?.address || '',
      totalDue: customer?.totalDue || 0,
      totalPaid: customer?.totalPaid || 0,
      prepaidBalance: customer?.prepaidBalance || 0,
      isActive: customer?.isActive ?? true,
      createdAt: customer?.createdAt || new Date(),
      updatedAt: customer?.updatedAt || new Date()
    } : undefined
  } : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={isCurrentlyProcessing ? () => {} : handleOpenChange}>
        <DialogContent 
          className="w-[calc(100vw-0.75rem)] sm:max-w-106.25 flex flex-col max-h-[92dvh] md:max-h-[85vh] p-0 overflow-hidden gap-0 rounded-2xl sm:rounded-lg" 
          onInteractOutside={isCurrentlyProcessing ? (e) => e.preventDefault() : undefined}
          onOpenAutoFocus={(e) => {
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              e.preventDefault();
            }
          }}
        >
          {isCurrentlyProcessing && (
            <div className="flex flex-col items-center py-16 gap-4">
              <span className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-muted-foreground font-medium">{t('processing')}</p>
            </div>
          )}
          {showSuccess && (
            <CheckoutSuccess
              displayedTotal={displayedTotal}
              displayedPaymentMethod={displayedPaymentMethod}
              displayedChange={displayedChange}
              formatPrice={formatPrice}
              onPrint={handlePrint}
              onClose={handleClose}
              labels={{
                paymentSuccessful: t('payment_successful'),
                saleCompleted: t('sale_completed', { amount: formatPrice(displayedTotal) }),
                changeToReturn: t('change_to_return'),
                print: t('print'),
                newSale: t('new_sale'),
              }}
            />
          )}
          {!isCurrentlyProcessing && !showSuccess && (
            <CheckoutForm
              items={items}
              displayedCustomerName={displayedCustomerName}
              paymentMethod={paymentMethod}
              paymentMethodIcon={paymentMethodIcon}
              subtotal={subtotal}
              discount={discount}
              tax={tax}
              total={total}
              customer={customer}
              customerId={customerId}
              usePrepaid={usePrepaid}
              setUsePrepaid={setUsePrepaid}
              prepaidAmountToUse={prepaidAmountToUse}
              remainingTotal={remainingTotal}
              currencySymbol={currencySymbol}
              cashReceived={cashReceived}
              upiReceived={upiReceived}
              amountReceived={amountReceived}
              handleCashChange={handleCashChange}
              handleUpiChange={handleUpiChange}
              handleAmountChange={handleAmountChange}
              handleQuickAmount={handleQuickAmount}
              isProcessing={isProcessing}
              parsedAmount={parsedAmount}
              change={change}
              debtRepaymentAmount={debtRepaymentAmount}
              setDebtRepaymentAmount={setDebtRepaymentAmount}
              prepaymentAmount={prepaymentAmount}
              setPrepaymentAmount={setPrepaymentAmount}
              setInputError={setInputError}
              inputError={inputError}
              isValidPayment={isValidPayment}
              onCancel={() => handleOpenChange(false)}
              onComplete={handleComplete}
              formatPrice={formatPrice}
              formatStringNumbers={formatStringNumbers}
              t={t}
              tc={tc}
            />
          )}
        </DialogContent>
      </Dialog>
      {saleForPrint && (
        <PrintDialog
          open={showReceiptPrint}
          onOpenChange={setShowReceiptPrint}
          sale={saleForPrint}
        />
      )}
    </>
  );
}

export default CheckoutDialog;
