'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Calculator,
  CheckCircle2,
  AlertCircle,
  Banknote,
  Smartphone,
  Clock,
  Printer,
  Receipt,
  Wallet,
} from 'lucide-react';
import type { PaymentMethod, Sale, Customer } from '@/types/pos';
import { useCartStore, useUIStore, useProductsStore, useCustomersStore } from '@/stores/pos-store';
import { cn } from '@/lib/utils';

interface CheckoutDialogProps {
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
  addChangeAsPrepayment?: boolean;
}

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

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

  const prevOpenRef = useRef(false);

  const showSuccess = !!completedSale && !isProcessing;
  const lastSale = completedSale;

  useEffect(() => {
    if (showSuccess && onCheckoutSuccess && lastSale) {
      onCheckoutSuccess(lastSale);
    }
  }, [showSuccess, lastSale, onCheckoutSuccess]);

  const activeTab = useCartStore((state) => state.getActiveTab());
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
    if (usePrepaid && customer && customer.prepaidBalance > 0) {
      return Math.min(total, customer.prepaidBalance);
    }
    return 0;
  }, [usePrepaid, customer, total]);

  const remainingTotal = useMemo(() => total - prepaidAmountToUse, [total, prepaidAmountToUse]);

  const [amountReceived, setAmountReceived] = useState<string>('');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [upiReceived, setUpiReceived] = useState<string>('');
  const [addAsPrePayment, setAddAsPrePayment] = useState(false);

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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

  // Reset form when dialog opens (using ref to avoid stale closures)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setInputError(null);
      setUsePrepaid(false);
      setAddAsPrePayment(false);
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
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmountReceived(value);
      setInputError(null);
    }
  }, []);

  const handleCashChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setCashReceived(value);
      setInputError(null);
    }
  }, []);

  const handleUpiChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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

  const handleComplete = useCallback(() => {
    if (paymentMethod !== 'Due' && parsedAmount < remainingTotal && !customerId) {
      setInputError(`Insufficient amount. Need ${formatPrice(remainingTotal - parsedAmount)} more or select a customer for partial payment.`);
      return;
    }

    const insufficientStockItems: Array<{ name: string; qty: number; available: number }> = [];
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const cartItem of items) {
      const product = productMap.get(cartItem.productId);
      if (!product) {
        setInputError(`Product "${cartItem.productName}" no longer exists.`);
        return;
      }
      if (cartItem.quantity > product.currentStock) {
        insufficientStockItems.push({
          name: cartItem.productName,
          qty: cartItem.quantity,
          available: product.currentStock,
        });
      }
    }

    if (insufficientStockItems.length > 0) {
      const itemsText = insufficientStockItems
        .map((item) => `${item.name} (Need: ${item.qty}, Available: ${item.available})`)
        .join('\n');
      setInputError(`Insufficient stock for:\n${itemsText}`);
      return;
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
      addChangeAsPrepayment: addAsPrePayment && change > 0 && !!customerId,
    };
    
    onComplete(paymentData);
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
    addAsPrePayment,
  ]);

  const handlePrint = useCallback(() => {
    if (lastSale) {
      setCurrentSale(lastSale);
      setPrintDialogOpen(true);
    }
  }, [lastSale, setCurrentSale, setPrintDialogOpen]);

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

  return (
    <Dialog open={isOpen} onOpenChange={isProcessing ? () => {} : handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] flex flex-col max-h-[90dvh] md:max-h-[85vh] p-0 overflow-hidden" onInteractOutside={isProcessing ? (e) => e.preventDefault() : undefined}>
        {isProcessing && (
          <div className="flex flex-col items-center py-16 gap-4">
            <span className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground font-medium">Processing sale...</p>
          </div>
        )}
        {showSuccess && (
          <div className="flex flex-col items-center py-6 px-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Payment Successful!</h2>
            <p className="text-muted-foreground text-center">Sale completed for {formatPrice(displayedTotal)}</p>
            {(displayedPaymentMethod === 'Cash' || displayedPaymentMethod === 'Mixed') && displayedChange > 0 && (
              <div className="mt-4 p-4 bg-muted rounded-lg w-full text-center">
                <p className="text-sm text-muted-foreground">Change to return</p>
                <p className="text-2xl font-bold text-primary">{formatPrice(displayedChange)}</p>
              </div>
            )}
            <div className="flex gap-3 mt-6 w-full">
              <Button variant="outline" className="flex-1" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />Print
              </Button>
              <Button className="flex-1 bg-blue-600 text-white hover:bg-blue-700" onClick={handleClose}>
                <Receipt className="w-4 h-4 mr-2" />New Sale
              </Button>
            </div>
          </div>
        )}
        {!isProcessing && !showSuccess && (<>
        <DialogHeader className="px-6 pt-6 pb-4 flex-none border-b">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Checkout
          </DialogTitle>
          <DialogDescription>Review your order and complete payment</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {displayedCustomerName && (
            <div className="flex items-center flex-wrap gap-1.5 text-sm bg-muted p-2 rounded-lg w-full overflow-hidden">
              <Badge variant="secondary" className="max-w-full truncate">{displayedCustomerName}</Badge>
              {paymentMethod === 'Due' && <Badge variant="outline" className="text-amber-600 shrink-0">Due Payment</Badge>}
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="truncate flex-1">{item.productName}<span className="text-muted-foreground ml-1">×{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span></span>
                <span className="font-medium ml-2">{formatPrice(item.totalPrice)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t pt-4">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-{formatPrice(discount)}</span></div>}
            {tax > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span>{formatPrice(tax)}</span></div>}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold text-lg"><span>Total</span><span className="text-primary">{formatPrice(total)}</span></div>
          </div>

          {customer && customer.prepaidBalance > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="use-prepaid" className="font-medium flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-green-600" />
                    Use Prepaid Balance
                  </Label>
                  <p className="text-xs text-muted-foreground">Available: {formatPrice(customer.prepaidBalance)}</p>
                </div>
                <Switch id="use-prepaid" checked={usePrepaid} onCheckedChange={setUsePrepaid} />
              </div>
              {usePrepaid && (
                <p className="text-sm text-green-700 font-medium text-center pt-1">
                  Applying {formatPrice(prepaidAmountToUse)} from balance.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Payment Method</span>
            <Badge variant="secondary" className="gap-1 px-2 py-1">
              {paymentMethodIcon}
              {remainingTotal === 0 ? 'Prepaid' : paymentMethod}
            </Badge>
          </div>

          {remainingTotal > 0 && paymentMethod !== 'Due' && (
            <div className="space-y-3">
              <Label htmlFor="amount-received">Amount to Pay</Label>

              {paymentMethod === 'Mixed' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cash</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                      <Input
                        id="cash-received"
                        type="text"
                        inputMode="numeric"
                        value={cashReceived}
                        onChange={handleCashChange}
                        placeholder="0"
                        className="pl-8 text-xl h-12 font-semibold text-right"
                        disabled={isProcessing}
                        readOnly
                        onFocus={e => e.currentTarget.removeAttribute('readonly')}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">UPI</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                      <Input
                        id="upi-received"
                        type="text"
                        inputMode="numeric"
                        value={upiReceived}
                        onChange={handleUpiChange}
                        placeholder="0"
                        className="pl-8 text-xl h-12 font-semibold text-right"
                        disabled={isProcessing}
                        readOnly
                        onFocus={e => e.currentTarget.removeAttribute('readonly')}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id="amount-received"
                    type="text"
                    inputMode="numeric"
                    value={amountReceived}
                    onChange={handleAmountChange}
                    placeholder="0"
                    className="pl-8 text-xl h-12 font-semibold text-right"
                    disabled={isProcessing}
                    readOnly
                    onFocus={e => e.currentTarget.removeAttribute('readonly')}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <Button key={amount} variant="outline" size="sm" onClick={() => handleQuickAmount(amount)} disabled={isProcessing} className="h-9">₹{amount}</Button>
                ))}
              </div>

              {parsedAmount > 0 && (
                <div className={cn('p-3 rounded-lg text-center', change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
                  {change >= 0 ? (
                    <><p className="text-sm">Change</p><p className="text-xl font-bold">{formatPrice(change)}</p></>
                  ) : (
                    <><p className="text-sm flex items-center justify-center gap-1"><AlertCircle className="w-4 h-4" />Balance Due</p><p className="text-xl font-bold">{formatPrice(Math.abs(change))}</p></>
                  )}
                </div>
              )}

              {change > 0 && customerId && (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label htmlFor="add-prepayment" className="font-medium flex items-center gap-2 cursor-pointer">
                    <Wallet className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Add {formatPrice(change)} as prepayment?</span>
                  </Label>
                  <Switch id="add-prepayment" checked={addAsPrePayment} onCheckedChange={setAddAsPrePayment} />
                </div>
              )}

              {change > 0 && !customerId && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-sm text-green-700 font-medium">Return {formatPrice(change)} to customer</p>
                </div>
              )}
            </div>
          )}

          {inputError && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-4 h-4" />{inputError}</p>}

          {paymentMethod === 'Due' && remainingTotal > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {formatPrice(remainingTotal)} will be added to customer's due balance.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-4 flex-none border-t bg-background gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleComplete}
            disabled={!isValidPayment}
            className="min-w-30 bg-blue-600 text-white hover:bg-blue-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />Complete Sale
          </Button>
        </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

export default CheckoutDialog;

