'use client';

import { useCallback, useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { toMoneyNumber } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CartItem } from './CartItem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ShoppingCart,
  Trash2,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  ChevronDown,
  Check,
  UserPlus,
  ScanLine,
  Plus,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { PaymentMethod, Customer } from '@/types/pos';
import { useCartStore, useUIStore } from '@/stores/pos-store';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface CartPanelProps {
  onCheckout: () => void;
  customers?: Customer[];
  onScan?: () => void;
}

const paymentMethods: { method: PaymentMethod; icon: React.ReactNode; label: string; color: string }[] = [
  { method: 'Cash', icon: <Banknote className="w-2 h-2" />, label: 'Cash', color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
  { method: 'UPI', icon: <Smartphone className="w-2 h-2" />, label: 'UPI', color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' },
  { method: 'Mixed', icon: (<div className="flex items-center gap-1"><Banknote className="w-2 h-2" /><Smartphone className="w-2 h-2" /></div>), label: 'Mixed', color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' },
  { method: 'Due', icon: <Clock className="w-5 h-5" />, label: 'Due', color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
];

export function CartPanel({ onCheckout, customers = [], onScan }: CartPanelProps) {
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [searchedCustomers, setSearchedCustomers] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddPartyDialog, setShowAddPartyDialog] = useState(false);
  const [newParty, setNewParty] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });

  const tabs = useCartStore((state) => state.tabs);
  const activeTabId = useCartStore((state) => state.activeTabId);
  const addTab = useCartStore((state) => state.addTab);
  const removeTab = useCartStore((state) => state.removeTab);
  const setActiveTab = useCartStore((state) => state.setActiveTab);

  // Note: These getters and primitive values now react to active tab changes naturally
  const activeTab = useCartStore((state) => state.getActiveTab());
  const items = activeTab.items;
  const discount = activeTab.discount;
  const tax = activeTab.tax;
  const customerName = activeTab.customerName;
  const paymentMethod = activeTab.paymentMethod;
  const getSubtotal = useCartStore((state) => state.getSubtotal);
  const getTotal = useCartStore((state) => state.getTotal);
  const getItemCount = useCartStore((state) => state.getItemCount);
  const clearCart = useCartStore((state) => state.clearCart);
  const setDiscount = useCartStore((state) => state.setDiscount);
  const setCustomer = useCartStore((state) => state.setCustomer);
  const setPaymentMethod = useCartStore((state) => state.setPaymentMethod);

  const setCheckoutOpen = useUIStore((state) => state.setCheckoutOpen);

  const subtotal = getSubtotal();
  const total = getTotal();
  const itemCount = getItemCount();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

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

  const handleDiscountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      setDiscount(isNaN(value) ? 0 : Math.max(0, value));
    },
    [setDiscount]
  );

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
      if (!customerSearchQuery.trim()) {
        setSearchedCustomers([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(customerSearchQuery)}`);
        if (res.ok) {
          const { data } = await res.json();
          setSearchedCustomers(data);
        }
      } catch {
        setSearchedCustomers([]);
      } finally {
        setIsSearching(false);
      }
    };
    const timer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  const { toast } = useToast();

  const handleAddPartyFromCart = async () => {
    if (!newParty.name) return;

    // Validate phone if provided
    if (newParty.phone && !/^[0-9]{10}$/.test(newParty.phone)) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Phone number must be exactly 10 digits.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newParty),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create customer');
      }

      const { data: newCustomer } = await response.json();
      // Select the newly created customer
      handleCustomerSelect(newCustomer);
      setShowAddPartyDialog(false);
      setNewParty({ name: '', phone: '', address: '', notes: '' });
      toast({
        title: 'Customer Added',
        description: `${newCustomer.name} has been added and selected.`,
      });
    } catch (error) {
      console.error('Failed to add customer:', error);
      toast({
        title: 'Failed to Create Customer',
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };

  const displayCustomers = customerSearchQuery
    ? (searchedCustomers.length > 0 || isSearching
        ? searchedCustomers
        : customers.filter(
            (c) =>
              c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
              c.phone?.includes(customerSearchQuery)
          )
      )
    : customers.slice(0, 20);

  const isCartEmpty = items.length === 0;
  const itemCountDisplay = itemCount === 0 ? 'Empty' : `${itemCount} item${itemCount !== 1 ? 's' : ''}`;  // unique SKUs

  const isAndroidApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();


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
                    "flex items-center px-3 py-1.5 min-w-[80px] max-w-[120px] text-xs font-medium cursor-pointer border-t border-x rounded-t-lg mr-1 transition-colors select-none",
                    activeTabId === tab.id
                      ? "bg-background border-b-transparent text-primary relative z-10 -mb-[1px]"
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
                title="New Bill"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-1.5 md:p-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          <h2 className="font-semibold text-base">Cart</h2>
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {itemCountDisplay}
          </Badge>
        </div>
        {!isCartEmpty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCart}
            className="text-muted-foreground hover:text-destructive h-7 px-2 text-xs"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Customer Selector */}
      <div className="px-2 border-b shrink-0 py-1 md:py-2">
        <Label className="text-xs text-muted-foreground mb-1 block">Customer</Label>
        <div className="relative">
          <Button
            variant="outline"
            className="w-full justify-between h-7 md:h-9 text-xs"
            onClick={() => setCustomerSearchOpen(!customerSearchOpen)}
          >
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 md:w-4 md:h-4" />
              {customerName || 'Walk-in Customer'}
            </div>
            <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
          </Button>

          {customerSearchOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50">
              <div className="p-2 border-b">
                <label htmlFor="customer-search" className="sr-only">Search customer</label>
                <Input
                  id="customer-search"
                  name="customer-search"
                  placeholder="Search customer..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                {isSearching && <p className="text-xs text-muted-foreground px-1 pt-1">Searching...</p>}
              </div>
              <div className="max-h-48 overflow-y-auto">
                <div className="p-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-9 text-sm"
                    onClick={() => handleCustomerSelect(null)}
                  >
                    Walk-in Customer
                  </Button>
                  {displayCustomers.map((customer) => (
                    <Button
                      key={customer.id}
                      variant="ghost"
                      className="w-full justify-start h-9 text-sm"
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      <div className="flex flex-col items-start">
                        <span>{customer.name}</span>
                        {customer.phone && (
                          <span className="text-xs text-muted-foreground">{customer.phone}</span>
                        )}
                      </div>
                      {toMoneyNumber(customer.totalDue) > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs">
                          Due: {formatPrice(customer.totalDue)}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
              {onScan && (
                <div className="p-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setShowAddPartyDialog(true);
                      setCustomerSearchOpen(false);
                    }}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    New Customer
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart Items - Mobile: flex-1 overflow-y-auto, Desktop: normal */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-28 sm:pb-0">
        <div className="p-1 md:p-2 space-y-1">
          {isCartEmpty ? (
            <div className="flex flex-col items-center justify-center py-8 md:py-12 text-center">
              <ShoppingCart className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-xs md:text-sm">Cart is empty</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Scan or tap products to add them
              </p>
              {isAndroidApp && onScan && (
                <Button variant="outline" size="sm" onClick={onScan} className="gap-2">
                  <ScanLine className="w-4 h-4" />
                  Scan Barcode
                </Button>
              )}
            </div>
          ) : (
            items.map((item) => <CartItem key={item.id} item={item} />)
          )}
        </div>
      </div>

      {/* Payment Method & Totals - Mobile: Fixed at bottom, Desktop: In-flow */}
      <div className="flex-none mt-auto sm:relative bg-background border-t p-2 md:p-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] md:shadow-none z-40 md:z-auto pb-[env(safe-area-inset-bottom)]">
        {/* Payment Method Selector - Visible Cards */}
        <div className="p-2 md:p-3 border-b md:border-b-0">
          <Label className="text-[10px] font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Payment Method</Label>
          <div className="grid grid-cols-4 gap-1">
            {paymentMethods
              .filter(({ method }) => method !== 'Due' || customerName) // Hide Due for walk-in customers
              .map(({ method, icon, label, color }) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={cn(
                    'relative flex flex-col items-center justify-center min-w-0 max-w-full whitespace-nowrap rounded-lg border-2 transition-all duration-200 touch-manipulation h-9 px-1 py-0.5',
                    paymentMethod === method
                      ? 'border-primary bg-primary/10 shadow-md shadow-primary/10 scale-[1.02]'
                      : 'border-border/50 bg-background hover:bg-muted/80 hover:border-primary/30'
                  )}
                >
                  {paymentMethod === method && (
                    <div className="absolute top-1.5 right-1.5 bg-primary rounded-full p-0.5 shadow-sm">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className={cn(
                    'mb-0.5 transition-transform duration-200 inline-flex items-center justify-center text-muted-foreground',
                    paymentMethod === method ? 'text-primary scale-110' : 'group-hover:scale-110'
                  )}>
                    {icon}
                  </div>
                  <span className={cn(
                    'text-[10px] font-bold tracking-tight sm:text-xs',
                    paymentMethod === method ? 'text-primary' : 'text-foreground'
                  )}>
                    {label}
                  </span>
                </button>
              ))}
          </div>
          {/* Subtotal */}
          <div className="flex justify-between text-xs mt-1.5">
            <span className="text-muted-foreground font-medium">Subtotal</span>
            <span className="font-semibold">{formatPrice(subtotal)}</span>
          </div>

          {/* Discount */}
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-medium">Discount</span>
            <div className="flex items-center gap-1">
              {showDiscountInput ? (
                <Input
                  type="number"
                  value={discount || ''}
                  onChange={handleDiscountChange}
                  className="w-16 h-6 text-right text-xs px-1.5 rounded-md border-primary/30 focus-visible:ring-primary/50"
                  placeholder="0"
                  min={0}
                  max={subtotal}
                  autoFocus
                  onBlur={() => discount === 0 && setShowDiscountInput(false)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs font-semibold text-primary hover:bg-primary/10 rounded-md"
                  onClick={() => setShowDiscountInput(true)}
                >
                  {discount > 0 ? formatPrice(discount) : '+ Add'}
                </Button>
              )}
            </div>
          </div>

          {/* Tax */}
          {tax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">Tax</span>
              <span className="font-semibold">{formatPrice(tax)}</span>
            </div>
          )}

          <Separator className="my-1.5 bg-border/60" />

          {/* Total and Checkout Button in compact row */}
          <div className="flex flex-col gap-2">
            <div className="flex items-end justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total</span>
              <span className="text-xl md:text-2xl font-black text-primary tracking-tight">{formatPrice(total)}</span>
            </div>
            <Button
              size="lg"
              className={cn(
                "w-full h-10 md:h-12 text-sm md:text-base font-bold rounded-xl shadow-lg transition-all duration-300 touch-manipulation flex items-center justify-center gap-2",
                isCartEmpty || total <= 0
                  ? "bg-muted text-muted-foreground shadow-none"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0"
              )}
              disabled={isCartEmpty || total <= 0}
              onClick={handleCheckout}
            >
              <CreditCard className="w-5 h-5 md:w-6 md:h-6" />
              Complete Checkout
            </Button>
          </div>
        </div>
      </div>

      {/* Add New Party Dialog */}
      <Dialog open={showAddPartyDialog} onOpenChange={setShowAddPartyDialog}>
        <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add New Customer
            </DialogTitle>
            <DialogDescription>
              Create a new customer and add to this order
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cart-party-name">Name *</Label>
              <Input
                id="cart-party-name"
                value={newParty.name}
                onChange={(e) => setNewParty(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter customer name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cart-party-phone">Phone</Label>
              <Input
                id="cart-party-phone"
                value={newParty.phone}
                onChange={(e) => setNewParty(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="10-digit phone number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cart-party-address">Address</Label>
              <Input
                id="cart-party-address"
                value={newParty.address}
                onChange={(e) => setNewParty(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Enter address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cart-party-notes">Notes</Label>
              <Textarea
                id="cart-party-notes"
                value={newParty.notes}
                onChange={(e) => setNewParty(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Enter notes"
                className="resize-none h-20"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddPartyDialog(false);
                setNewParty({ name: '', phone: '', address: '', notes: '' });
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddPartyFromCart} 
              disabled={!newParty.name}
            >
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CartPanel;
