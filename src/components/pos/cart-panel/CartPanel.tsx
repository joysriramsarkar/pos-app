'use client';

import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { toMoneyNumber } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CartItem } from '../CartItem';
import {
  ShoppingCart,
  Trash2,
  User,
  ChevronDown,
  UserPlus,
  ScanLine,
  Plus,
  X,
} from 'lucide-react';
import type { Customer } from '@/types/pos';
import { useCartStore, useUIStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals, convertEnglishToBengaliNumerals } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useTranslations, useLocale } from 'next-intl';
import type { CartPanelProps } from './types';
import { normalizeAndValidatePhone } from './utils';
import { toast as sonnerToast } from 'sonner';
import { AddCustomerDialog } from './AddCustomerDialog';
import { CartTotals } from './CartTotals';

export type { CartPanelProps } from './types';

export function CartPanel({ onCheckout, customers = [], onScan }: CartPanelProps) {
  const t = useTranslations('Cart');
  const tc = useTranslations('Common');
  const locale = useLocale();

  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [searchedCustomers, setSearchedCustomers] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddPartyDialog, setShowAddPartyDialog] = useState(false);
  const [newParty, setNewParty] = useState({
    name: '',
    nameEn: '',
    phone: '',
    address: '',
    notes: '',
  });
  const [isNameEnTouched, setIsNameEnTouched] = useState(false);
  const [isSubmittingParty, setIsSubmittingParty] = useState(false);

  const tabs = useCartStore((state) => state.tabs);
  const activeTabId = useCartStore((state) => state.activeTabId);
  const addTab = useCartStore((state) => state.addTab);
  const removeTab = useCartStore((state) => state.removeTab);
  const setActiveTab = useCartStore((state) => state.setActiveTab);

  const activeTab = useCartStore((state) => state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0]);
  const items = activeTab.items;
  const discount = activeTab.discount;
  const tax = activeTab.tax;
  const customerName = activeTab.customerName;
  const paymentMethod = activeTab.paymentMethod;
  const getSubtotal = useCartStore((state) => state.getSubtotal);
  const getTotal = useCartStore((state) => state.getTotal);
  const getItemCount = useCartStore((state) => state.getItemCount);
  const clearCart = useCartStore((state) => state.clearCart);
  const setCustomer = useCartStore((state) => state.setCustomer);
  const setPaymentMethod = useCartStore((state) => state.setPaymentMethod);

  const setCheckoutOpen = useUIStore((state) => state.setCheckoutOpen);
  const { formatPrice } = useNumberFormat();

  // Auto-translate name to English using Google Translate API directly
  useEffect(() => {
    if (!newParty.name.trim()) {
      setNewParty(prev => ({ ...prev, nameEn: '' }));
      return;
    }
    if (isNameEnTouched) return;

    const timeoutId = setTimeout(async () => {
      const detected = /^[a-zA-Z\s]+$/.test(newParty.name.trim());
      if (detected) {
        setNewParty(prev => ({ ...prev, nameEn: newParty.name.trim() }));
      } else {
        try {
          const res = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=bn&tl=en&dt=t&q=${encodeURIComponent(newParty.name.trim())}`
          );
          const data = await res.json();
          const translated = data?.[0]?.[0]?.[0];
          if (translated) {
            setNewParty(prev => {
              if (isNameEnTouched) return prev;
              return { ...prev, nameEn: translated };
            });
          }
        } catch (err) {
          console.error("Auto-translate customer name failed:", err);
        }
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [newParty.name, isNameEnTouched]);

  const subtotal = getSubtotal();
  const total = getTotal();
  const itemCount = getItemCount();

  const handleClearCart = useCallback(() => {
    if (items.length > 0) {
      clearCart();
    }
  }, [items.length, clearCart]);

  const handleCheckout = useCallback(() => {
    if (items.length > 0 && total > 0) {
      setCheckoutOpen(true);
      onCheckout();
    }
  }, [items.length, total, setCheckoutOpen, onCheckout]);

  const handleCustomerSelect = useCallback(
    (customer: Customer | null) => {
      setCustomer(customer);
      setCustomerSearchOpen(false);
      setCustomerSearchQuery('');
      setSearchedCustomers([]);
      if (!customer && paymentMethod === 'Due') {
        setPaymentMethod('Cash');
      }
    },
    [setCustomer, paymentMethod, setPaymentMethod]
  );

  useEffect(() => {
    const searchCustomers = async () => {
      const query = customerSearchQuery.trim();
      if (!query) {
        setSearchedCustomers([]);
        return;
      }

      const normalizedPhoneQuery = convertBengaliToEnglishNumerals(query);
      const localResults = customers.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.nameEn && c.nameEn.toLowerCase().includes(query.toLowerCase())) ||
        c.phone?.includes(normalizedPhoneQuery)
      );

      setSearchedCustomers(localResults);
      setIsSearching(true);

      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}`);
        if (res.ok) {
          const { data } = await res.json();
          setSearchedCustomers(data);
        }
      } catch {
        // keep local results if the API call fails
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearchQuery, customers]);

  const { toast } = useToast();

  const handleAddPartyFromCart = async () => {
    if (!newParty.name || isSubmittingParty) return;

    // Normalize and validate phone number
    let normalizedPhone: string | null = null;
    if (newParty.phone.trim()) {
      normalizedPhone = normalizeAndValidatePhone(newParty.phone);
      if (!normalizedPhone) {
        toast({
          title: t('invalid_phone'),
          description: t('phone_digits'),
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSubmittingParty(true);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newParty, phone: normalizedPhone || '' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create customer');
      }

      const { data: newCustomer } = await response.json();
      // Select the newly created customer
      handleCustomerSelect(newCustomer);
      setShowAddPartyDialog(false);
      setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' });
      setIsNameEnTouched(false);
      sonnerToast.success('নতুন গ্রাহক তৈরি হয়েছে', {
        description: `${newCustomer.name} কার্টে যোগ করা হয়েছে`,
      });
      toast({
        title: t('customer_added'),
        description: t('customer_added_desc', { name: newCustomer.name }),
      });
    } catch (error) {
      console.error('Failed to add customer:', error);
      toast({
        title: t('failed_create_customer'),
        description: error instanceof Error ? error.message : t('unexpected_error'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingParty(false);
    }
  };

  const displayCustomers = customerSearchQuery
    ? (searchedCustomers.length > 0 || isSearching
        ? searchedCustomers
        : customers.filter(
            (c) =>
              c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
              (c.nameEn && c.nameEn.toLowerCase().includes(customerSearchQuery.toLowerCase())) ||
              c.phone?.includes(customerSearchQuery)
          )
      )
    : customers.slice(0, 20);

  const isCartEmpty = items.length === 0;
  const isBn = locale === 'bn';
  const displayCount = isBn ? convertEnglishToBengaliNumerals(itemCount) : itemCount;
  const itemCountDisplay = itemCount === 0 ? t('empty') : `${displayCount}${isBn ? '' : ' '}${itemCount === 1 ? t('item') : t('items')}`;

  return (
    <div className="flex flex-col h-full bg-background min-h-0">
      {/* Tabs UI */}
      <div className="flex flex-col border-b shrink-0 bg-muted/20">
        <div className="flex items-center px-1 pt-1 overflow-hidden w-full">
          <ScrollArea className="w-full max-w-full">
            <div className="flex w-full items-center">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center px-3 py-1.5 min-w-20 max-w-30 text-xs font-medium cursor-pointer border-t border-x rounded-t-lg mr-1 transition-colors select-none",
                    activeTabId === tab.id
                      ? "bg-background border-b-transparent text-primary relative z-10 -mb-px"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span className="truncate flex-1" title={tab.name}>{tab.name}</span>
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                      className="ml-1 opacity-60 hover:opacity-100 hover:text-destructive shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={addTab}
                className="h-7 px-2 ml-1 text-muted-foreground shrink-0 rounded-full"
                title={t('new_bill')}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-1.5 py-1 md:p-2 border-b shrink-0 bg-emerald-50/20 dark:bg-emerald-950/5">
        <div className="flex items-center gap-1.5 min-w-0">
          <ShoppingCart className="w-3.5 h-3.5 md:w-5 md:h-5 text-emerald-600 dark:text-emerald-500 shrink-0" />
          <h2 className="font-semibold text-sm md:text-base truncate">{t('title')}</h2>
          <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5 shrink-0">
            {itemCountDisplay}
          </Badge>
        </div>
        {!isCartEmpty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCart}
            className="text-muted-foreground hover:text-destructive h-7 px-1.5 text-xs shrink-0"
          >
            <Trash2 className="w-3 h-3 mr-0.5" />
            {t('clear')}
          </Button>
        )}
      </div>

      {/* Customer Selector */}
      <div className="px-1.5 md:px-2 border-b shrink-0 py-1 md:py-2">
        <Label className="text-[10px] md:text-xs text-muted-foreground mb-0.5 md:mb-1 block">{t('customer')}</Label>
        <div className="relative" ref={customerDropdownRef}>
          <Button
            variant="outline"
            className="w-full justify-between h-8 md:h-9 text-xs touch-manipulation"
            onClick={() => setCustomerSearchOpen(!customerSearchOpen)}
          >
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 md:w-4 md:h-4 text-emerald-600 dark:text-emerald-500" />
              {customerName || t('walk_in')}
            </div>
            <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
          </Button>

          {customerSearchOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50">
              <div className="p-2 border-b">
                <label htmlFor="customer-search" className="sr-only">{t('search_customer')}</label>
                <Input
                  id="customer-search"
                  name="customer-search"
                  placeholder={t('search_customer')}
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                {isSearching && <p className="text-xs text-muted-foreground px-1 pt-1">{t('searching')}</p>}
              </div>
              <div className="max-h-48 overflow-y-auto">
                <div className="p-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-9 text-sm"
                    onClick={() => handleCustomerSelect(null)}
                  >
                    {t('walk_in')}
                  </Button>
                  {displayCustomers.map((customer) => (
                    <Button
                      key={customer.id}
                      variant="ghost"
                      className="w-full justify-start h-auto py-1.5 text-sm"
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      <div className="flex flex-col items-start leading-tight">
                        <span>{customer.name}</span>
                        {customer.nameEn && customer.nameEn !== customer.name && (
                          <span className="text-[10px] text-muted-foreground/80 font-medium">{customer.nameEn}</span>
                        )}
                        {customer.phone && (
                          <span className="text-[10px] text-muted-foreground mt-0.5">{customer.phone}</span>
                        )}
                      </div>
                      {toMoneyNumber(customer.totalDue) > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs">
                          {t('due')}: {formatPrice(customer.totalDue)}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="p-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    setShowAddPartyDialog(true);
                    setCustomerSearchOpen(false);
                  }}
                >
                  <UserPlus className="w-4 h-4 mr-1 text-emerald-600" />
                  {t('new_customer')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-1 md:p-2 space-y-1 md:space-y-1.5 pb-2">
          {isCartEmpty ? (
            <div className="flex flex-col items-center justify-center py-6 md:py-12 text-center px-4">
              <ShoppingCart className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground/50 mb-1.5" />
              <p className="text-muted-foreground text-xs md:text-sm">{t('empty')}</p>
              <p className="text-[11px] md:text-xs text-muted-foreground/70 mt-0.5 mb-2">
                {t('empty_desc')}
              </p>
              {onScan && (
                <Button variant="outline" size="sm" onClick={onScan} className="gap-1.5 h-9 px-3 md:hidden touch-manipulation">
                  <ScanLine className="w-3.5 h-3.5" />
                  {t('scan_barcode')}
                </Button>
              )}
            </div>
          ) : (
            items.map((item) => <CartItem key={item.id} item={item} />)
          )}
        </div>
      </div>

      <CartTotals
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        customerName={customerName}
        subtotal={subtotal}
        discount={discount}
        tax={tax}
        total={total}
        isCartEmpty={isCartEmpty}
        onCheckout={handleCheckout}
        formatPrice={formatPrice}
        t={t}
      />

      <AddCustomerDialog
        open={showAddPartyDialog}
        onOpenChange={setShowAddPartyDialog}
        newParty={newParty}
        setNewParty={setNewParty}
        setIsNameEnTouched={setIsNameEnTouched}
        onSubmit={handleAddPartyFromCart}
        isSubmitting={isSubmittingParty}
        onCancel={() => {
          setShowAddPartyDialog(false);
          setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' });
          setIsNameEnTouched(false);
        }}
        labels={{
          addNewCustomer: t('add_new_customer'),
          enterCustomerDetails: t('enter_customer_details'),
          customerName: t('customer_name'),
          enterName: t('enter_name'),
          customerNameEn: t('customer_name_en'),
          enterNameEn: t('enter_name_en'),
          customerPhone: t('customer_phone'),
          enterPhone: t('enter_phone'),
          customerAddress: t('customer_address'),
          enterAddress: t('enter_address'),
          customerNotes: t('customer_notes'),
          cancel: tc('cancel'),
          createCustomer: t('create_customer'),
        }}
      />
    </div>
  );
}

export default CartPanel;
