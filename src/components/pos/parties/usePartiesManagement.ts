'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { v4 as uuidv4 } from 'uuid';
import { useCustomersStore } from '@/stores/pos-store';
import type { Customer, Supplier, LedgerEntry } from '@/types/pos';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { toMoneyNumber } from '@/lib/money';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import {
  type PartyType,
  normalizeAndValidatePhone,
} from './parties-utils';
import {
  EMPTY_PARTY_FORM,
  type PartyFormState,
  type CustomerPurchaseDetail,
  type SupplierWithBalances,
} from './types';

export function usePartiesManagement(refreshKey?: number) {
  const t = useTranslations('Parties');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<PartyType>('customer');
  const { inputValue: customerSearchInput, searchQuery: customerSearchQuery, setInputValue: setCustomerSearchInput, clearSearch: clearCustomerSearch } = useDebouncedSearch();
  const { inputValue: supplierSearchInput, searchQuery: supplierSearchQuery, setInputValue: setSupplierSearchInput, clearSearch: clearSupplierSearch } = useDebouncedSearch();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPrepaymentDialog, setShowPrepaymentDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [prepaymentAmount, setPrepaymentAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingParty, setEditingParty] = useState<Customer | Supplier | null>(null);
  const [editingPartyType, setEditingPartyType] = useState<PartyType>('customer');
  const [newParty, setNewParty] = useState<PartyFormState>(EMPTY_PARTY_FORM);

  const [showDueEntryDialog, setShowDueEntryDialog] = useState(false);
  const [dueEntryAmount, setDueEntryAmount] = useState('');
  const [dueEntryDescription, setDueEntryDescription] = useState('');
  const [isNameEnTouched, setIsNameEnTouched] = useState(false);

  const [customerSort, setCustomerSort] = useState<string>('due-desc');
  const [supplierSort, setSupplierSort] = useState<string>('due-desc');

  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
  const [detailsCustomerName, setDetailsCustomerName] = useState('');
  const [detailsCustomerPhone, setDetailsCustomerPhone] = useState('');
  const [customerDetail, setCustomerDetail] = useState<CustomerPurchaseDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const customers = useCustomersStore((state) => state.customers);
  const addCustomer = useCustomersStore((state) => state.addCustomer);
  const updateCustomer = useCustomersStore((state) => state.updateCustomer);
  const setCustomers = useCustomersStore((state) => state.setCustomers);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showSupplierLedger, setShowSupplierLedger] = useState(false);
  const [showSupplierPaymentDialog, setShowSupplierPaymentDialog] = useState(false);
  const [supplierPaymentAmount, setSupplierPaymentAmount] = useState('');
  const [supplierPaymentMethod, setSupplierPaymentMethod] = useState('Cash');
  const [showSupplierDueEntryDialog, setShowSupplierDueEntryDialog] = useState(false);
  const [supplierDueEntryAmount, setSupplierDueEntryAmount] = useState('');
  const [supplierDueEntryDescription, setSupplierDueEntryDescription] = useState('');
  const [supplierCashAmount, setSupplierCashAmount] = useState('');
  const [supplierUpiAmount, setSupplierUpiAmount] = useState('');
  const [supplierLedgerEntries, setSupplierLedgerEntries] = useState<any[]>([]);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const parsedPaymentAmount = parseFloat(paymentAmount) || 0;
  const isMixedOk = useMemo(() => {
    if (paymentMethod !== 'Mixed') return true;
    const totalAmt = parseFloat(convertBengaliToEnglishNumerals(paymentAmount)) || 0;
    const cashVal = parseFloat(cashAmount) || 0;
    const upiVal = parseFloat(upiAmount) || 0;
    return Math.abs(cashVal + upiVal - totalAmt) < 0.01;
  }, [paymentMethod, paymentAmount, cashAmount, upiAmount]);

  const { formatPrice, formatDate, formatNumber, currencySymbol } = useNumberFormat();

  useEffect(() => {
    const fetchDetail = async () => {
      if (!detailsCustomerId) return;
      setDetailsLoading(true);
      setCustomerDetail(null);
      try {
        const res = await fetch(`/api/reports/customers?customerId=${detailsCustomerId}&days=365&tzOffset=${new Date().getTimezoneOffset()}`);
        const data = await res.json();
        // API returns data directly: { totalSpent, orderCount, aov, topProducts, categoryBreakdown, monthlyTrend, hourly }
        setCustomerDetail(data);
      } catch (err) {
        console.error('Error fetching customer detail:', err);
      } finally {
        setDetailsLoading(false);
      }
    };
    fetchDetail();
  }, [detailsCustomerId]);

  // Auto-translate name to English for Customers/Suppliers
  useEffect(() => {
    if (!newParty.name.trim()) {
      if (!isNameEnTouched) {
        setNewParty(prev => ({ ...prev, nameEn: '' }));
      }
      return;
    }

    const hasBengali = /[\u0980-\u09FF]/.test(newParty.name);
    if (!hasBengali) {
      if (!isNameEnTouched) {
        setNewParty(prev => ({ ...prev, nameEn: newParty.name }));
      }
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (!isNameEnTouched) {
        try {
          const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=bn&tl=en&dt=t&q=${encodeURIComponent(newParty.name.trim())}`);
          const data = await res.json();
          if (data && data[0] && data[0][0] && data[0][0][0]) {
            const translated = data[0][0][0];
            setNewParty(prev => isNameEnTouched ? prev : { ...prev, nameEn: translated });
          }
        } catch (err) {
          console.error("Auto-translate to English failed:", err);
        }
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [newParty.name, isNameEnTouched]);

  useEffect(() => {
    if (
      !showLedger &&
      !showPaymentDialog &&
      !showPrepaymentDialog &&
      !showWithdrawDialog &&
      !showAddDialog &&
      !showEditDialog &&
      !showSupplierLedger &&
      !showSupplierPaymentDialog &&
      !showDueEntryDialog
    ) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [
    showLedger,
    showPaymentDialog,
    showPrepaymentDialog,
    showWithdrawDialog,
    showAddDialog,
    showEditDialog,
    showSupplierLedger,
    showSupplierPaymentDialog,
    showDueEntryDialog,
    activeTab
  ]);

  // Fetch customers and suppliers on component mount
  useEffect(() => {
    let active = true;
    const customersController = new AbortController();
    const suppliersController = new AbortController();
    const timeoutId = setTimeout(() => {
      customersController.abort();
      suppliersController.abort();
    }, 15000);

    const fetchData = async () => {
      try {
        const [customersResult, suppliersResult] = await Promise.allSettled([
          fetch('/api/customers', { signal: customersController.signal }),
          fetch('/api/suppliers', { signal: suppliersController.signal }),
        ]);

        if (!active) return;
        clearTimeout(timeoutId);

        // Handle customers
        if (customersResult.status === 'fulfilled' && customersResult.value.ok) {
          try {
            const { data } = await customersResult.value.json();
            if (active) setCustomers(data);
          } catch (parseErr) {
            console.error('Failed to parse customers response:', parseErr);
          }
        } else if (customersResult.status === 'fulfilled') {
          console.error('Failed to fetch customers. Status:', customersResult.value.status);
          // Fallback to IndexedDB
          try {
            const { CustomersDB } = await import('@/lib/offline/indexeddb');
            const cachedCustomers = await CustomersDB.getAll();
            if (cachedCustomers.length > 0 && active) {
              console.log(`✅ Using ${cachedCustomers.length} cached customers`);
              setCustomers(cachedCustomers);
            }
          } catch (dbErr) {
            console.error('Failed to load customers from cache:', dbErr);
          }
        } else {
          if (customersResult.reason?.name !== 'AbortError') {
            console.error('Customers API fetch failed:', customersResult.reason instanceof Error ? customersResult.reason.message : String(customersResult.reason));
          }
          // Fallback to IndexedDB
          try {
            const { CustomersDB } = await import('@/lib/offline/indexeddb');
            const cachedCustomers = await CustomersDB.getAll();
            if (cachedCustomers.length > 0 && active) {
              console.log(`✅ Using ${cachedCustomers.length} cached customers`);
              setCustomers(cachedCustomers);
            }
          } catch (dbErr) {
            console.error('Failed to load customers from cache:', dbErr);
          }
        }

        // Handle suppliers
        if (suppliersResult.status === 'fulfilled' && suppliersResult.value.ok) {
          try {
            const { data } = await suppliersResult.value.json();
            if (active) setSuppliers(data);
            // Cache suppliers for offline use
            try {
              const { SuppliersDB } = await import('@/lib/offline/indexeddb');
              await SuppliersDB.upsertMany(data);
            } catch (cacheErr) {
              console.error('Failed to cache suppliers:', cacheErr);
            }
          } catch (parseErr) {
            console.error('Failed to parse suppliers response:', parseErr);
          }
        } else if (suppliersResult.status === 'fulfilled') {
          console.error('Failed to fetch suppliers. Status:', suppliersResult.value.status);
          // Fallback to IndexedDB
          try {
            const { SuppliersDB } = await import('@/lib/offline/indexeddb');
            const cachedSuppliers = await SuppliersDB.getAll();
            if (cachedSuppliers.length > 0 && active) {
              console.log(`✅ Using ${cachedSuppliers.length} cached suppliers`);
              setSuppliers(cachedSuppliers);
            }
          } catch (dbErr) {
            console.error('Failed to load suppliers from cache:', dbErr);
          }
        } else {
          if (suppliersResult.reason?.name !== 'AbortError') {
            console.error('Suppliers API fetch failed:', suppliersResult.reason instanceof Error ? suppliersResult.reason.message : String(suppliersResult.reason));
          }
          // Fallback to IndexedDB
          try {
            const { SuppliersDB } = await import('@/lib/offline/indexeddb');
            const cachedSuppliers = await SuppliersDB.getAll();
            if (cachedSuppliers.length > 0 && active) {
              console.log(`✅ Using ${cachedSuppliers.length} cached suppliers`);
              setSuppliers(cachedSuppliers);
            }
          } catch (dbErr) {
            console.error('Failed to load suppliers from cache:', dbErr);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
    return () => {
      active = false;
      clearTimeout(timeoutId);
      customersController.abort();
      suppliersController.abort();
    };
  }, [setCustomers, refreshKey]);

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    let result = customers.filter(c => c.isActive);
    if (customerSearchQuery) {
      const query = customerSearchQuery.toLowerCase();
      result = result.filter(c =>
        c.isActive && (
          c.name.toLowerCase().includes(query) ||
          c.nameEn?.toLowerCase().includes(query) ||
          c.phone?.includes(query)
        )
      );
    }
    return [...result].sort((a, b) => {
      if (customerSort === 'name-asc') {
        return a.name.localeCompare(b.name, 'bn');
      }
      if (customerSort === 'name-desc') {
        return b.name.localeCompare(a.name, 'bn');
      }
      if (customerSort === 'due-desc') {
        return toMoneyNumber(b.totalDue) - toMoneyNumber(a.totalDue);
      }
      if (customerSort === 'due-asc') {
        return toMoneyNumber(a.totalDue) - toMoneyNumber(b.totalDue);
      }
      return 0;
    });
  }, [customers, customerSearchQuery, customerSort]);

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    let result = suppliers.filter(s => s.isActive);
    if (supplierSearchQuery) {
      const query = supplierSearchQuery.toLowerCase();
      result = result.filter(s =>
        s.isActive && (
          s.name.toLowerCase().includes(query) ||
          s.nameEn?.toLowerCase().includes(query) ||
          s.phone?.includes(query)
        )
      );
    }
    return [...result].sort((a, b) => {
      if (supplierSort === 'name-asc') {
        return a.name.localeCompare(b.name, 'bn');
      }
      if (supplierSort === 'name-desc') {
        return b.name.localeCompare(a.name, 'bn');
      }
      if (supplierSort === 'due-desc') {
        return toMoneyNumber((b as SupplierWithBalances).totalDue || 0) - toMoneyNumber((a as SupplierWithBalances).totalDue || 0);
      }
      if (supplierSort === 'due-asc') {
        return toMoneyNumber((a as SupplierWithBalances).totalDue || 0) - toMoneyNumber((b as SupplierWithBalances).totalDue || 0);
      }
      if (supplierSort === 'purchases-desc') {
        return toMoneyNumber((b as SupplierWithBalances).totalPurchases || 0) - toMoneyNumber((a as SupplierWithBalances).totalPurchases || 0);
      }
      return 0;
    });
  }, [suppliers, supplierSearchQuery, supplierSort]);

  const totalDue = customers.reduce((sum, c) => sum + toMoneyNumber(c.totalDue), 0);
  const customersWithDue = customers.filter(c => toMoneyNumber(c.totalDue) > 0).length;

  const totalSupplierDue = suppliers.reduce((sum, s) => sum + toMoneyNumber((s as SupplierWithBalances).totalDue || 0), 0);
  const suppliersWithDue = suppliers.filter(s => toMoneyNumber((s as SupplierWithBalances).totalDue || 0) > 0).length;

  const handleViewLedger = async (customer: Customer) => {
    setSelectedCustomer(customer);
    try {
      const res = await fetch(`/api/customers?id=${customer.id}`);
      if (res.ok) {
        const { data } = await res.json();
        const parsedLedger = (data.ledgerEntries || []).map((entry: any) => ({
          ...entry,
          amount: Number(entry.amount) || 0,
          balanceAfter: Number(entry.balanceAfter) || 0,
        }));
        setLedgerEntries(parsedLedger);
      } else {
        console.error('Failed to load ledger entries');
        setLedgerEntries([]);
      }
    } catch (err) {
      console.error('Error fetching ledger entries', err);
      setLedgerEntries([]);
    }
    setShowLedger(true);
  };

  const handleViewSupplierLedger = async (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    try {
      const res = await fetch(`/api/suppliers?id=${supplier.id}`);
      if (res.ok) {
        const { data } = await res.json();
        setSupplierLedgerEntries(data.ledgerEntries || []);
      } else {
        console.error('Failed to load supplier ledger');
        setSupplierLedgerEntries([]);
      }
    } catch (err) {
      console.error('Error fetching supplier ledger', err);
      setSupplierLedgerEntries([]);
    }
    setShowSupplierLedger(true);
  };

  const handleRecordSupplierPayment = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSupplierPaymentAmount('');
    setSupplierPaymentMethod('Cash');
    setSupplierCashAmount('');
    setSupplierUpiAmount('');
    setShowSupplierPaymentDialog(true);
  };

  const handleSupplierPaymentSubmit = async () => {
    if (!selectedSupplier || !supplierPaymentAmount) return;

    const amount = parseFloat(supplierPaymentAmount);
    if (amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a positive amount.', variant: 'destructive' });
      return;
    }

    const due = toMoneyNumber((selectedSupplier as SupplierWithBalances).totalDue || 0);
    if (due <= 0) {
      toast({ title: 'পরিশোধ করা সম্ভব নয়', description: 'এই সাপ্লায়ারের কোনো বকেয়া নেই।', variant: 'destructive' });
      return;
    }
    if (amount > due) {
      toast({ title: 'ভুল পরিমাণ', description: `পরিশোধের পরিমাণ বকেয়া পরিমাণের (${formatPrice(due)}) চেয়ে বেশি হতে পারবে না।`, variant: 'destructive' });
      return;
    }

    let finalNotes = `Paid supplier: ${selectedSupplier.name}`;
    if (supplierPaymentMethod === 'Mixed') {
      const cAmt = parseFloat(supplierCashAmount) || 0;
      const uAmt = parseFloat(supplierUpiAmount) || 0;
      finalNotes += ` [নগদ: ${cAmt}, ইউপিআই: ${uAmt}]`;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uuidv4(),
          amount,
          category: 'Supplier Payment',
          notes: finalNotes,
          paymentMethod: supplierPaymentMethod,
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          date: new Date().toISOString().split('T')[0],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record supplier payment.');
      }

      // Refresh suppliers list to update dues
      const suppliersRes = await fetch('/api/suppliers');
      if (suppliersRes.ok) {
        const { data } = await suppliersRes.json();
        setSuppliers(data);
      }

      setShowSupplierPaymentDialog(false);
      toast({ title: 'Payment Recorded', description: `Recorded payment to ${selectedSupplier.name}.` });
    } catch (error) {
      console.error("Failed to record supplier payment:", error);
      toast({ title: 'Payment Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordSupplierDueEntry = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSupplierDueEntryAmount('');
    setSupplierDueEntryDescription('');
    setShowSupplierDueEntryDialog(true);
  };

  const handleSupplierDueEntrySubmit = async () => {
    if (!selectedSupplier || !supplierDueEntryAmount) return;

    const amount = parseFloat(supplierDueEntryAmount);
    if (amount <= 0) {
      toast({ title: t('invalid_amount') || 'ভুল পরিমাণ', description: t('positive_amount') || 'একটি ধনাত্মক পরিমাণ লিখুন।', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/supplier-due-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          amount,
          description: supplierDueEntryDescription
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to record supplier due entry.');
      }

      // Refresh suppliers list to update dues
      const suppliersRes = await fetch('/api/suppliers');
      if (suppliersRes.ok) {
        const { data } = await suppliersRes.json();
        setSuppliers(data);
      }

      setShowSupplierDueEntryDialog(false);
      toast({ title: 'বাকি এন্ট্রি সফল', description: `Recorded ${formatPrice(amount)} manual due for supplier ${selectedSupplier.name}.` });

    } catch (error) {
      console.error("Failed to record supplier due entry:", error);
      toast({ title: 'বাকি এন্ট্রি ব্যর্থ', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordDueEntry = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDueEntryAmount('');
    setDueEntryDescription('');
    setShowDueEntryDialog(true);
  };

  const handleDueEntrySubmit = async () => {
    if (!selectedCustomer || !dueEntryAmount) return;

    const amount = parseFloat(dueEntryAmount);
    if (amount <= 0) {
      toast({ title: t('invalid_amount') || 'ভুল পরিমাণ', description: t('positive_amount') || 'একটি ধনাত্মক পরিমাণ লিখুন।', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/due-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount,
          description: dueEntryDescription
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to record due entry.');
      }

      const { data: updatedCustomer } = await response.json();
      updateCustomer(selectedCustomer.id, updatedCustomer);
      setShowDueEntryDialog(false);
      toast({ title: t('due_entry_success') || 'বাকি এন্ট্রি সফল', description: `${formatPrice(amount)} outstanding due added for ${selectedCustomer.name}.` });

    } catch (error) {
      console.error("Failed to record due entry:", error);
      toast({ title: t('due_entry_failed') || 'বাকি এন্ট্রি ব্যর্থ', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPaymentAmount('');
    setPaymentMethod('Cash');
    setCashAmount('');
    setUpiAmount('');
    setShowPaymentDialog(true);
  };

  const handleRecordPrepayment = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPrepaymentAmount('');
    setShowPrepaymentDialog(true);
  };

  const handleWithdraw = (customer: Customer) => {
    setSelectedCustomer(customer);
    setWithdrawAmount('');
    setShowWithdrawDialog(true);
  };

  const handleWithdrawSubmit = async () => {
    if (!selectedCustomer || !withdrawAmount) return;
    const amount = parseFloat(withdrawAmount);
    if (amount <= 0 || amount > selectedCustomer.prepaidBalance) {
      toast({ title: 'Invalid Amount', description: 'Amount exceeds available prepaid balance.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/prepayment/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selectedCustomer.id, amount }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to withdraw');
      }
      const { data: updated } = await response.json();
      updateCustomer(selectedCustomer.id, updated);
      toast({ title: 'Withdrawn', description: `${formatPrice(amount)} withdrawn from ${selectedCustomer.name}'s prepaid balance.` });
      setShowWithdrawDialog(false);
    } catch (error) {
      toast({ title: 'Withdraw Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditParty = (party: Customer | Supplier) => {
    setEditingParty(party);
    setEditingPartyType(activeTab);
    setNewParty({
      name: party.name,
      nameEn: (party as any).nameEn || '',
      phone: party.phone || '',
      address: party.address || '',
      notes: party.notes || '',
    });
    setIsNameEnTouched(true);
    setShowEditDialog(true);
  };

  const handleUpdateParty = async () => {
    if (!editingParty || !newParty.name) return;

    let phoneNormalized = newParty.phone ? newParty.phone.trim() : '';
    if (phoneNormalized) {
      const validated = normalizeAndValidatePhone(phoneNormalized);
      if (!validated) {
        toast({ title: 'Invalid phone', description: 'Phone number must be exactly 10 digits (e.g. +91 75848 64899).', variant: 'destructive' });
        return;
      }
      phoneNormalized = validated;
    }

    setIsSubmitting(true);
    try {
      if (editingPartyType === 'customer') {
        const response = await fetch('/api/customers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingParty.id,
            ...newParty,
            phone: phoneNormalized || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update customer');
        }

        const { data: updatedCustomer } = await response.json();
        updateCustomer(editingParty.id, updatedCustomer);
      } else {
        // Update supplier
        const response = await fetch('/api/suppliers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingParty.id,
            ...newParty,
            phone: phoneNormalized || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update supplier');
        }

        const { data: updatedSupplier } = await response.json();
        setSuppliers(prev =>
          prev.map(s => s.id === editingParty.id ? {
            ...s,
            ...updatedSupplier,
            totalPurchases: (s as SupplierWithBalances).totalPurchases,
            totalPaid: (s as SupplierWithBalances).totalPaid,
            totalDue: (s as SupplierWithBalances).totalDue,
          } : s)
        );
      }

      setShowEditDialog(false);
      setEditingParty(null);
      setEditingPartyType('customer');
      setNewParty(EMPTY_PARTY_FORM);
      setIsNameEnTouched(false);
      toast({ title: `${editingPartyType === 'customer' ? 'Customer' : 'Supplier'} Updated`, description: `${newParty.name} has been updated successfully.` });
    } catch (error) {
      console.error('Failed to update party:', error);
      toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!selectedCustomer || !paymentAmount) return;

    const paidAmount = parseFloat(paymentAmount);
    let finalNotes = '';
    if (paymentMethod === 'Mixed') {
      const cAmt = parseFloat(cashAmount) || 0;
      const uAmt = parseFloat(upiAmount) || 0;
      finalNotes = `Mixed [নগদ: ${cAmt}, ইউপিআই: ${uAmt}]`;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/due-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount: paidAmount,
          paymentMethod,
          notes: finalNotes || `Due collection (${paymentMethod})`
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to record payment.');
      }

      const { data } = await response.json();
      updateCustomer(selectedCustomer.id, data.customer);
      setShowPaymentDialog(false);
      toast({ title: 'Payment Recorded', description: `${formatPrice(paidAmount)} payment recorded for ${selectedCustomer.name}.` });

    } catch (error) {
      console.error("Failed to record payment:", error);
      toast({ title: 'Payment Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrepaymentSubmit = async () => {
    if (!selectedCustomer || !prepaymentAmount) return;

    const amount = parseFloat(prepaymentAmount);
    if (amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a positive amount.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/prepayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount: amount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add prepayment');
      }

      const { data: updatedCustomer } = await response.json();
      updateCustomer(selectedCustomer.id, updatedCustomer);
      toast({ title: 'Success', description: 'Prepayment added successfully.' });
      setShowPrepaymentDialog(false);

    } catch (error) {
      console.error("Failed to add prepayment:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddParty = async () => {
    if (!newParty.name) return;

    let phoneNormalized = newParty.phone ? newParty.phone.trim() : '';
    if (phoneNormalized) {
      const validated = normalizeAndValidatePhone(phoneNormalized);
      if (!validated) {
        toast({ title: 'Invalid phone', description: 'Phone number must be exactly 10 digits (e.g. +91 75848 64899).', variant: 'destructive' });
        return;
      }
      phoneNormalized = validated;
    }

    setIsSubmitting(true);
    if (activeTab === 'customer') {
      try {
        const response = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newParty,
            phone: phoneNormalized || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create customer');
        }

        const { data: newCustomer } = await response.json();
        addCustomer(newCustomer);
        toast({ title: 'Customer Added', description: `${newCustomer.name} has been added successfully.` });

      } catch (error) {
        console.error("Failed to add customer:", error);
        toast({ title: 'Failed to Add Customer', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

    } else {
      try {
        const response = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newParty,
            phone: phoneNormalized || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create supplier');
        }

        const { data: newSupplier } = await response.json();
        setSuppliers(prev => [...prev, {
          ...newSupplier,
          totalPurchases: 0,
          totalPaid: 0,
          totalDue: 0
        }]);
        toast({ title: 'Supplier Added', description: `${newSupplier.name} has been added successfully.` });

      } catch (error) {
        console.error("Failed to add supplier:", error);
        toast({ title: 'Failed to Add Supplier', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
    }

    setNewParty(EMPTY_PARTY_FORM);
    setIsNameEnTouched(false);
    setShowAddDialog(false);
    setIsSubmitting(false);
  };

  const hasPartyChanges = editingParty ? (
    newParty.name !== editingParty.name ||
    newParty.nameEn !== ((editingParty as any).nameEn || '') ||
    newParty.phone !== (editingParty.phone || '') ||
    newParty.address !== (editingParty.address || '') ||
    newParty.notes !== (editingParty.notes || '')
  ) : true;

  const resetPartyForm = () => {
    setEditingParty(null);
    setNewParty(EMPTY_PARTY_FORM);
    setIsNameEnTouched(false);
  };


  return {
    t,
    searchInputRef,
    activeTab,
    setActiveTab,
    selectedCustomer,
    showLedger,
    setShowLedger,
    showPaymentDialog,
    setShowPaymentDialog,
    showPrepaymentDialog,
    setShowPrepaymentDialog,
    showWithdrawDialog,
    setShowWithdrawDialog,
    paymentAmount,
    setPaymentAmount,
    paymentMethod,
    setPaymentMethod,
    cashAmount,
    setCashAmount,
    upiAmount,
    setUpiAmount,
    prepaymentAmount,
    setPrepaymentAmount,
    withdrawAmount,
    setWithdrawAmount,
    showAddDialog,
    setShowAddDialog,
    showEditDialog,
    setShowEditDialog,
    editingParty,
    editingPartyType,
    newParty,
    setNewParty,
    showDueEntryDialog,
    setShowDueEntryDialog,
    dueEntryAmount,
    setDueEntryAmount,
    dueEntryDescription,
    setDueEntryDescription,
    setIsNameEnTouched,
    customerSearchInput,
    setCustomerSearchInput,
    clearCustomerSearch,
    supplierSearchInput,
    setSupplierSearchInput,
    clearSupplierSearch,
    customerSort,
    setCustomerSort,
    supplierSort,
    setSupplierSort,
    showDetailsDialog,
    setShowDetailsDialog,
    detailsCustomerId,
    setDetailsCustomerId,
    detailsCustomerName,
    setDetailsCustomerName,
    detailsCustomerPhone,
    setDetailsCustomerPhone,
    customerDetail,
    setCustomerDetail,
    detailsLoading,
    customers,
    suppliers,
    ledgerEntries,
    selectedSupplier,
    showSupplierLedger,
    setShowSupplierLedger,
    showSupplierPaymentDialog,
    setShowSupplierPaymentDialog,
    supplierPaymentAmount,
    setSupplierPaymentAmount,
    supplierPaymentMethod,
    setSupplierPaymentMethod,
    showSupplierDueEntryDialog,
    setShowSupplierDueEntryDialog,
    supplierDueEntryAmount,
    setSupplierDueEntryAmount,
    supplierDueEntryDescription,
    setSupplierDueEntryDescription,
    supplierCashAmount,
    setSupplierCashAmount,
    supplierUpiAmount,
    setSupplierUpiAmount,
    supplierLedgerEntries,
    isSubmitting,
    parsedPaymentAmount,
    isMixedOk,
    formatPrice,
    formatDate,
    formatNumber,
    currencySymbol,
    filteredCustomers,
    filteredSuppliers,
    totalDue,
    customersWithDue,
    totalSupplierDue,
    suppliersWithDue,
    handleViewLedger,
    handleViewSupplierLedger,
    handleRecordSupplierPayment,
    handleSupplierPaymentSubmit,
    handleRecordSupplierDueEntry,
    handleSupplierDueEntrySubmit,
    handleRecordDueEntry,
    handleDueEntrySubmit,
    handleRecordPayment,
    handleRecordPrepayment,
    handleWithdraw,
    handleWithdrawSubmit,
    handleEditParty,
    handleUpdateParty,
    handlePaymentSubmit,
    handlePrepaymentSubmit,
    handleAddParty,
    hasPartyChanges,
    resetPartyForm,
    EMPTY_PARTY_FORM,
  };
}
