'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { v4 as uuidv4 } from 'uuid';
import { useCustomersStore } from '@/stores/pos-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  UserPlus,
  Search,
  Phone,
  MapPin,
  IndianRupee,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  X,
  Edit,
  PlusCircle,
  ArrowUpFromLine,
} from 'lucide-react';
import type { Customer, Supplier, LedgerEntry } from '@/types/pos';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { toMoneyNumber } from '@/lib/money';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';



type PartyType = 'customer' | 'supplier';

const getInitialsBg = (name: string) => {
  const colors = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const normalizeAndValidatePhone = (phone: string): string | null => {
  if (!phone) return null;
  
  // 1. Strip spaces and whitespace
  let clean = phone.replace(/\s+/g, '');
  
  // 2. Convert Bengali numerals to English numerals
  clean = convertBengaliToEnglishNumerals(clean);
  
  // 3. Remove leading '+' if present
  if (clean.startsWith('+')) {
    clean = clean.slice(1);
  }
  
  // 4. Handle prefixes to extract the last 10 digits
  // If it starts with '091' followed by 10 digits (13 digits total)
  if (clean.startsWith('091') && clean.length === 13) {
    clean = clean.slice(3);
  }
  // If it starts with '91' followed by 10 digits (12 digits total)
  else if (clean.startsWith('91') && clean.length === 12) {
    clean = clean.slice(2);
  }
  // If it starts with '0' followed by 10 digits (11 digits total)
  else if (clean.startsWith('0') && clean.length === 11) {
    clean = clean.slice(1);
  }
  
  // 5. Test if it is exactly 10 digits
  if (/^[0-9]{10}$/.test(clean)) {
    return clean;
  }
  
  return null;
};

export function PartiesManagement() {
  const t = useTranslations('Parties');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState<PartyType>('customer');
  const { inputValue: searchInput, searchQuery, setInputValue: setSearchInput, clearSearch: clearSearchQuery } = useDebouncedSearch();
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
  const [newParty, setNewParty] = useState({
    name: '',
    nameEn: '',
    phone: '',
    address: '',
    notes: '',
  });

  const [showDueEntryDialog, setShowDueEntryDialog] = useState(false);
  const [dueEntryAmount, setDueEntryAmount] = useState('');
  const [dueEntryDescription, setDueEntryDescription] = useState('');
  const [isNameEnTouched, setIsNameEnTouched] = useState(false);

  const [customerSort, setCustomerSort] = useState<string>('name-asc');
  const [supplierSort, setSupplierSort] = useState<string>('name-asc');

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
  const [supplierCashAmount, setSupplierCashAmount] = useState('');
  const [supplierUpiAmount, setSupplierUpiAmount] = useState('');
  const [supplierLedgerEntries, setSupplierLedgerEntries] = useState<any[]>([]);
  const { toast } = useToast();

  const { formatPrice, formatDate } = useNumberFormat();

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
        searchInputRef.current?.focus();
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
  }, [setCustomers]);



  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    let result = customers.filter(c => c.isActive);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
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
  }, [customers, searchQuery, customerSort]);

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    let result = suppliers.filter(s => s.isActive);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
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
        return toMoneyNumber((b as any).totalDue || 0) - toMoneyNumber((a as any).totalDue || 0);
      }
      if (supplierSort === 'due-asc') {
        return toMoneyNumber((a as any).totalDue || 0) - toMoneyNumber((b as any).totalDue || 0);
      }
      if (supplierSort === 'purchases-desc') {
        return toMoneyNumber((b as any).totalPurchases || 0) - toMoneyNumber((a as any).totalPurchases || 0);
      }
      return 0;
    });
  }, [suppliers, searchQuery, supplierSort]);

  const totalDue = customers.reduce((sum, c) => sum + toMoneyNumber(c.totalDue), 0);
  const customersWithDue = customers.filter(c => toMoneyNumber(c.totalDue) > 0).length;

  const totalSupplierDue = suppliers.reduce((sum, s) => sum + toMoneyNumber((s as any).totalDue || 0), 0);
  const suppliersWithDue = suppliers.filter(s => toMoneyNumber((s as any).totalDue || 0) > 0).length;

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

    const totalDue = toMoneyNumber((selectedSupplier as any).totalDue || 0);
    if (totalDue <= 0) {
      toast({ title: 'পরিশোধ করা সম্ভব নয়', description: 'এই সাপ্লায়ারের কোনো বকেয়া নেই।', variant: 'destructive' });
      return;
    }
    if (amount > totalDue) {
      toast({ title: 'ভুল পরিমাণ', description: `পরিশোধের পরিমাণ বকেয়া পরিমাণের (৳${totalDue}) চেয়ে বেশি হতে পারবে না।`, variant: 'destructive' });
      return;
    }

    let finalNotes = `Paid supplier: ${selectedSupplier.name}`;
    if (supplierPaymentMethod === 'Mixed') {
      const cAmt = parseFloat(supplierCashAmount) || 0;
      const uAmt = parseFloat(supplierUpiAmount) || 0;
      finalNotes += ` [নগদ: ${cAmt}, ইউপিআই: ${uAmt}]`;
    }

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
      toast({ title: t('due_entry_success') || 'বাকি এন্ট্রি সফল', description: `৳${amount} outstanding due added for ${selectedCustomer.name}.` });

    } catch (error) {
      console.error("Failed to record due entry:", error);
      toast({ title: t('due_entry_failed') || 'বাকি এন্ট্রি ব্যর্থ', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
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
      toast({ title: 'Withdrawn', description: `₹${amount} withdrawn from ${selectedCustomer.name}'s prepaid balance.` });
      setShowWithdrawDialog(false);
    } catch (error) {
      toast({ title: 'Withdraw Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
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
            totalPurchases: (s as any).totalPurchases,
            totalPaid: (s as any).totalPaid,
            totalDue: (s as any).totalDue,
          } : s)
        );
      }

      setShowEditDialog(false);
      setEditingParty(null);
      setEditingPartyType('customer');
      setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' });
      setIsNameEnTouched(false);
      toast({ title: `${editingPartyType === 'customer' ? 'Customer' : 'Supplier'} Updated`, description: `${newParty.name} has been updated successfully.` });
    } catch (error) {
      console.error('Failed to update party:', error);
      toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
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
      toast({ title: 'Payment Recorded', description: `₹${paidAmount} payment recorded for ${selectedCustomer.name}.` });

    } catch (error) {
      console.error("Failed to record payment:", error);
      toast({ title: 'Payment Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
    }
  };

  const handlePrepaymentSubmit = async () => {
    if (!selectedCustomer || !prepaymentAmount) return;

    const amount = parseFloat(prepaymentAmount);
    if (amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a positive amount.', variant: 'destructive' });
      return;
    }

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
        return;
      }
    }

    setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' });
    setIsNameEnTouched(false);
    setShowAddDialog(false);
  };

  const hasPartyChanges = editingParty ? (
    newParty.name !== editingParty.name ||
    newParty.nameEn !== ((editingParty as any).nameEn || '') ||
    newParty.phone !== (editingParty.phone || '') ||
    newParty.address !== (editingParty.address || '') ||
    newParty.notes !== (editingParty.notes || '')
  ) : true;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" />
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          <Button onClick={() => { setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' }); setIsNameEnTouched(false); setShowAddDialog(true); }} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            <UserPlus className="w-4 h-4 mr-2" />
            {activeTab === 'customer' ? t('add_customer_btn') : t('add_supplier_btn')}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="bg-muted/50">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{activeTab === 'customer' ? t('total_due') : 'মোট বকেয়া (সাপ্লায়ার)'}</p>
              <p className="text-lg font-bold text-red-600">{formatPrice(activeTab === 'customer' ? totalDue : totalSupplierDue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{activeTab === 'customer' ? t('customers_with_due') : 'বকেয়া আছে এমন সাপ্লায়ার'}</p>
              <p className="text-lg font-bold">{activeTab === 'customer' ? customersWithDue : suppliersWithDue}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{activeTab === 'customer' ? t('total_customers') : 'মোট সাপ্লায়ার'}</p>
              <p className="text-lg font-bold">{activeTab === 'customer' ? customers.filter(c => c.isActive).length : suppliers.filter(s => s.isActive).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Sort */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="parties-search" className="sr-only">Search by name or phone</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="parties-search"
              name="parties-search"
              ref={searchInputRef}
              placeholder="Search by name or phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              autoFocus
            />
            {searchInput && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={clearSearchQuery}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          <div className="w-full sm:w-[200px]">
            {activeTab === 'customer' ? (
              <Select value={customerSort} onValueChange={setCustomerSort}>
                <SelectTrigger className="w-full h-10 bg-background">
                  <SelectValue placeholder={t('sort_by') || 'Sort By'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">{t('sort_name_asc') || 'Name (A-Z)'}</SelectItem>
                  <SelectItem value="name-desc">{t('sort_name_desc') || 'Name (Z-A)'}</SelectItem>
                  <SelectItem value="due-desc">{t('sort_due_desc') || 'Dues (High to Low)'}</SelectItem>
                  <SelectItem value="due-asc">{t('sort_due_asc') || 'Dues (Low to High)'}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={supplierSort} onValueChange={setSupplierSort}>
                <SelectTrigger className="w-full h-10 bg-background">
                  <SelectValue placeholder={t('sort_by') || 'Sort By'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">{t('sort_name_asc') || 'Name (A-Z)'}</SelectItem>
                  <SelectItem value="name-desc">{t('sort_name_desc') || 'Name (Z-A)'}</SelectItem>
                  <SelectItem value="due-desc">{t('sort_due_desc') || 'Dues (High to Low)'}</SelectItem>
                  <SelectItem value="due-asc">{t('sort_due_asc') || 'Dues (Low to High)'}</SelectItem>
                  <SelectItem value="purchases-desc">{t('sort_purchases_desc') || 'Total Purchases (High to Low)'}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PartyType)}>
          <TabsList className="w-full rounded-none bg-transparent h-12">
            <TabsTrigger value="customer" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              Customers ({filteredCustomers.length})
            </TabsTrigger>
            <TabsTrigger value="supplier" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              Suppliers ({filteredSuppliers.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'customer' ? (
          filteredCustomers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('no_customers')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {filteredCustomers.map((customer) => {
                const initials = customer.name.charAt(0).toUpperCase();
                const avatarColor = getInitialsBg(customer.name);
                const isDue = toMoneyNumber(customer.totalDue) > 0;
                const isPrepaid = toMoneyNumber(customer.prepaidBalance) > 0;

                return (
                  <Card key={customer.id} className="overflow-hidden border border-border/60 hover:shadow-sm transition-all duration-300">
                    <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
                      {/* Top row: Avatar & details */}
                      <div className="flex items-start gap-2.5 md:gap-3">
                        <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-sm md:text-base shrink-0 shadow-sm", avatarColor)}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-sm md:text-base text-slate-800 dark:text-slate-200 truncate" title={customer.name}>{customer.name}</h3>
                          {customer.phone ? (
                            <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{customer.phone}</span>
                            </p>
                          ) : (
                            <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5">{t('no_phone')}</p>
                          )}
                          {customer.address && (
                            <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate" title={customer.address}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{customer.address}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Middle row: Financial status */}
                      <div className="grid grid-cols-2 gap-1.5 md:gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 md:p-2.5 rounded-lg md:rounded-xl border border-slate-100 dark:border-slate-800/60 text-center">
                        <div>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">{t('balance_col')}</p>
                          {isPrepaid ? (
                            <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 font-bold text-[10px] md:text-xs px-1 md:px-1.5 py-0 h-5 md:h-6">
                              {formatPrice(customer.prepaidBalance)}
                            </Badge>
                          ) : (
                            <span className="text-[11px] md:text-xs text-muted-foreground font-medium">-</span>
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">{t('due_col')}</p>
                          {isDue ? (
                            <Badge variant="destructive" className="font-bold text-[10px] md:text-xs px-1 md:px-1.5 py-0 h-5 md:h-6">
                              {formatPrice(customer.totalDue)}
                            </Badge>
                          ) : (
                            <span className="text-[11px] md:text-xs text-muted-foreground font-medium">-</span>
                          )}
                        </div>
                      </div>

                      {/* Bottom row: Action buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-1 md:gap-1.5 pt-2 border-t border-border/40">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-850"
                          onClick={() => handleEditParty(customer)}
                        >
                          <Edit className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{t('edit')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-850"
                          onClick={() => handleViewLedger(customer)}
                        >
                          <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{t('ledger')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 dark:text-blue-400 border-blue-100 dark:border-blue-900/30"
                          onClick={() => handleRecordPrepayment(customer)}
                        >
                          <PlusCircle className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{t('prepayment')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30"
                          onClick={() => handleRecordDueEntry(customer)}
                        >
                          <PlusCircle className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{t('due_entry')}</span>
                        </Button>
                        {isPrepaid && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 dark:text-orange-400 border-orange-100 dark:border-orange-900/30"
                            onClick={() => handleWithdraw(customer)}
                          >
                            <ArrowUpFromLine className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span>{t('withdraw')}</span>
                          </Button>
                        )}
                        {isDue && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30"
                            onClick={() => handleRecordPayment(customer)}
                          >
                            <IndianRupee className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span>{t('payment')}</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          filteredSuppliers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('no_suppliers')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {filteredSuppliers.map((supplier) => {
                const initials = supplier.name.charAt(0).toUpperCase();
                const avatarColor = getInitialsBg(supplier.name);
                const isDue = toMoneyNumber((supplier as any).totalDue || 0) > 0;

                return (
                  <Card key={supplier.id} className="overflow-hidden border border-border/60 hover:shadow-md transition-all duration-300">
                    <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
                      {/* Top row: Avatar & details */}
                      <div className="flex items-start gap-2.5 md:gap-3">
                        <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-sm md:text-base shrink-0 shadow-sm", avatarColor)}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-sm md:text-base text-slate-800 dark:text-slate-200 truncate" title={supplier.name}>{supplier.name}</h3>
                          {supplier.phone ? (
                            <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{supplier.phone}</span>
                            </p>
                          ) : (
                            <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5">{t('no_phone')}</p>
                          )}
                          {supplier.address && (
                            <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate" title={supplier.address}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{supplier.address}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Middle row: Financial status */}
                      <div className="grid grid-cols-3 gap-1.5 md:gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 md:p-2.5 rounded-lg md:rounded-xl border border-slate-100 dark:border-slate-800/60 text-center text-xs">
                        <div>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">মোট ক্রয়</p>
                          <span className="font-semibold text-[11px] md:text-xs text-slate-700 dark:text-slate-355">{formatPrice((supplier as any).totalPurchases || 0)}</span>
                        </div>
                        <div>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">পরিশোধ</p>
                          <span className="font-semibold text-[11px] md:text-xs text-emerald-600 dark:text-emerald-400">{formatPrice((supplier as any).totalPaid || 0)}</span>
                        </div>
                        <div>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">বকেয়া</p>
                          {isDue ? (
                            <Badge variant="destructive" className="font-bold text-[10px] md:text-xs px-1 md:px-1.5 py-0 h-5 md:h-6">
                              {formatPrice((supplier as any).totalDue)}
                            </Badge>
                          ) : (
                            <span className="text-[11px] md:text-xs text-muted-foreground font-medium">-</span>
                          )}
                        </div>
                      </div>

                      {/* Bottom row: Action buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-1 md:gap-1.5 pt-2 border-t border-border/40">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-850"
                          onClick={() => handleEditParty(supplier)}
                        >
                          <Edit className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{t('edit')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-850"
                          onClick={() => handleViewSupplierLedger(supplier)}
                        >
                          <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>লেজার</span>
                        </Button>
                        {isDue && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30"
                            onClick={() => handleRecordSupplierPayment(supplier)}
                          >
                            <IndianRupee className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span>পরিশোধ</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Ledger Dialog */}
      <Dialog open={showLedger} onOpenChange={setShowLedger}>
        <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ledger - {selectedCustomer?.name}
            </DialogTitle>
            <DialogDescription>
              Transaction history and due balance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Balance */}
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Due</span>
                  <span className="text-2xl font-bold text-red-600">
                    {formatPrice(selectedCustomer?.totalDue || 0)}
                  </span>
                </div>
                 <div className="flex justify-between items-center mt-2">
                  <span className="text-muted-foreground">Prepaid Balance</span>
                  <span className="text-2xl font-bold text-green-600">
                    {formatPrice(selectedCustomer?.prepaidBalance || 0)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Ledger Entries */}
            <ScrollArea className="h-75">
              <div className="space-y-2 pr-2">
                {ledgerEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      entry.entryType === 'credit' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        entry.entryType === 'credit' ? 'bg-red-100' : 'bg-green-100'
                      )}>
                        {entry.entryType === 'credit' ? (
                          <ArrowUpRight className="w-4 h-4 text-red-600" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.createdAt)} • {entry.referenceId}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-semibold",
                        entry.entryType === 'credit' ? 'text-red-600' : 'text-green-600'
                      )}>
                        {entry.entryType === 'credit' ? '+' : '-'}{formatPrice(entry.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Bal: {formatPrice(entry.balanceAfter)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record payment from {selectedCustomer?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current Due</span>
                <span className="font-bold text-red-600">
                  {formatPrice(selectedCustomer?.totalDue || 0)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-dialog-amount">Payment Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="payment-dialog-amount"
                  type="text"
                  value={paymentAmount}
                  onChange={(e) => {
                    const val = convertBengaliToEnglishNumerals(e.target.value);
                    const cleaned = val.replace(/[^0-9.]/g, '');
                    const dotCount = (cleaned.match(/\./g) || []).length;
                    if (dotCount > 1) return;
                    setPaymentAmount(cleaned);
                  }}
                  placeholder="0"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>পেমেন্ট পদ্ধতি</Label>
              <Select value={paymentMethod} onValueChange={(v) => {
                setPaymentMethod(v);
                if (v === 'Mixed' && paymentAmount) {
                  const totalAmt = parseFloat(convertBengaliToEnglishNumerals(paymentAmount)) || 0;
                  setCashAmount(totalAmt.toString());
                  setUpiAmount('0');
                } else if (v !== 'Mixed') {
                  setCashAmount('');
                  setUpiAmount('');
                }
              }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                  <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                  <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'Mixed' && (() => {
              const totalAmt = parseFloat(convertBengaliToEnglishNumerals(paymentAmount)) || 0;
              const cashVal = parseFloat(cashAmount) || 0;
              const upiVal = parseFloat(upiAmount) || 0;
              const mixedSum = cashVal + upiVal;
              const isMixedOk = Math.abs(mixedSum - totalAmt) < 0.01;
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">নগদ</Label>
                      <Input type="text" value={cashAmount} onChange={(e) => {
                        const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                        setCashAmount(val);
                        const cVal = parseFloat(val) || 0;
                        if (cVal <= totalAmt) setUpiAmount((totalAmt - cVal).toFixed(2).replace(/\.00$/, ''));
                        else setUpiAmount('0');
                      }} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">ইউপিআই</Label>
                      <Input type="text" value={upiAmount} onChange={(e) => {
                        const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                        setUpiAmount(val);
                        const uVal = parseFloat(val) || 0;
                        if (uVal <= totalAmt) setCashAmount((totalAmt - uVal).toFixed(2).replace(/\.00$/, ''));
                        else setCashAmount('0');
                      }} className="h-9" />
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${isMixedOk ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                    <span>নগদ {cashVal} + ইউপিআই {upiVal}</span>
                    <span className="font-semibold">{isMixedOk ? '✓ মিলেছে' : `বাকি: ${Math.abs(totalAmt - mixedSum).toFixed(2)}`}</span>
                  </div>
                </div>
              );
            })()}

            {/* Quick Amounts */}
            <div className="flex flex-wrap gap-2">
              {[100, 200, 500, 1000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentAmount(amount.toString())}
                >
                  ₹{amount}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaymentAmount((selectedCustomer?.totalDue || 0).toString())}
              >
                Full Amount
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePaymentSubmit}
              disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prepayment Dialog */}
      <Dialog open={showPrepaymentDialog} onOpenChange={setShowPrepaymentDialog}>
        <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Prepayment</DialogTitle>
            <DialogDescription>
              Add prepaid balance for {selectedCustomer?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current Prepaid Balance</span>
                <span className="font-bold text-green-600">
                  {formatPrice(selectedCustomer?.prepaidBalance || 0)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepayment-dialog-amount">Amount to Add</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="prepayment-dialog-amount"
                  type="text"
                  value={prepaymentAmount}
                  onChange={(e) => {
                    const val = convertBengaliToEnglishNumerals(e.target.value);
                    const cleaned = val.replace(/[^0-9.]/g, '');
                    const dotCount = (cleaned.match(/\./g) || []).length;
                    if (dotCount > 1) return;
                    setPrepaymentAmount(cleaned);
                  }}
                  placeholder="0"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[100, 200, 500, 1000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setPrepaymentAmount(amount.toString())}
                >
                  ₹{amount}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPrepaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePrepaymentSubmit}
              disabled={!prepaymentAmount || parseFloat(prepaymentAmount) <= 0}
              className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
            >
              Add Prepayment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Withdraw Prepaid Balance</DialogTitle>
            <DialogDescription>
              Withdraw cash from {selectedCustomer?.name}'s prepaid balance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Available Balance</span>
                <span className="font-bold text-green-600">
                  {formatPrice(selectedCustomer?.prepaidBalance || 0)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount to Withdraw</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="withdraw-amount"
                  type="text"
                  value={withdrawAmount}
                  onChange={(e) => {
                    const val = convertBengaliToEnglishNumerals(e.target.value);
                    const cleaned = val.replace(/[^0-9.]/g, '');
                    const dotCount = (cleaned.match(/\./g) || []).length;
                    if (dotCount > 1) return;
                    setWithdrawAmount(cleaned);
                  }}
                  placeholder="0"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[100, 200, 500, 1000].map((amount) => (
                <Button key={amount} variant="outline" size="sm" onClick={() => setWithdrawAmount(amount.toString())}>₹{amount}</Button>
              ))}
              <Button variant="outline" size="sm" onClick={() => setWithdrawAmount((selectedCustomer?.prepaidBalance || 0).toString())}>Full Balance</Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>Cancel</Button>
            <Button
              onClick={handleWithdrawSubmit}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (selectedCustomer?.prepaidBalance || 0)}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Party Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditingParty(null);
          setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' });
          setIsNameEnTouched(false);
        }
      }}>
        <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Edit {editingPartyType === 'customer' ? 'Customer' : 'Supplier'}
            </DialogTitle>
            <DialogDescription>
              Update {editingPartyType === 'customer' ? 'customer' : 'supplier'} details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-party-name">Name *</Label>
              <Input
                id="edit-party-name"
                value={newParty.name}
                onChange={(e) => setNewParty(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-party-nameEn">{t('name_en_label') || 'English Name'}</Label>
              <Input
                id="edit-party-nameEn"
                value={newParty.nameEn}
                onChange={(e) => {
                  setNewParty(prev => ({ ...prev, nameEn: e.target.value }));
                  setIsNameEnTouched(true);
                }}
                placeholder="Auto-translated to English"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-party-phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="edit-party-phone"
                  value={newParty.phone}
                  onChange={(e) => setNewParty(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Enter phone number"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-party-address">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="edit-party-address"
                  value={newParty.address}
                  onChange={(e) => setNewParty(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Enter address"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-party-notes">Notes</Label>
              <Textarea
                id="edit-party-notes"
                value={newParty.notes}
                onChange={(e) => setNewParty(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Enter notes"
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingParty(null); setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' }); setIsNameEnTouched(false); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateParty} disabled={!newParty.name || !hasPartyChanges} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
              Update {editingPartyType === 'customer' ? 'Customer' : 'Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Party Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) {
          setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' });
          setIsNameEnTouched(false);
        }
      }}>
        <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add New {activeTab === 'customer' ? 'Customer' : 'Supplier'}
            </DialogTitle>
            <DialogDescription>
              Enter {activeTab === 'customer' ? 'customer' : 'supplier'} details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="party-form-name">Name *</Label>
              <Input
                id="party-form-name"
                value={newParty.name}
                onChange={(e) => setNewParty(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="party-form-nameEn">{t('name_en_label') || 'English Name'}</Label>
              <Input
                id="party-form-nameEn"
                value={newParty.nameEn}
                onChange={(e) => {
                  setNewParty(prev => ({ ...prev, nameEn: e.target.value }));
                  setIsNameEnTouched(true);
                }}
                placeholder="Auto-translated to English"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="party-form-phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="party-form-phone"
                  value={newParty.phone}
                  onChange={(e) => setNewParty(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Enter phone number"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="party-form-address">Address</Label>
              <Input
                id="party-form-address"
                value={newParty.address}
                onChange={(e) => setNewParty(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Enter address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="party-form-notes">Notes</Label>
              <Textarea
                id="party-form-notes"
                value={newParty.notes}
                onChange={(e) => setNewParty(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setNewParty({ name: '', nameEn: '', phone: '', address: '', notes: '' }); setIsNameEnTouched(false); }}>
              Cancel
            </Button>
            <Button onClick={handleAddParty} disabled={!newParty.name} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
              Add {activeTab === 'customer' ? 'Customer' : 'Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Due Entry Dialog */}
      <Dialog open={showDueEntryDialog} onOpenChange={setShowDueEntryDialog}>
        <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('due_entry_title') || 'ম্যানুয়াল বাকি এন্ট্রি'}</DialogTitle>
            <DialogDescription>
              {t('due_entry_desc', { name: selectedCustomer?.name || '' }) || `${selectedCustomer?.name || ''} এর জন্য ম্যানুয়াল বাকি এন্ট্রি রেকর্ড করুন`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="due-entry-amount">{t('due_entry_amount') || 'বাকির পরিমাণ'}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">৳</span>
                <Input
                  id="due-entry-amount"
                  type="text"
                  value={dueEntryAmount}
                  onChange={(e) => {
                    const val = convertBengaliToEnglishNumerals(e.target.value);
                    const cleaned = val.replace(/[^0-9.]/g, '');
                    const dotCount = (cleaned.match(/\./g) || []).length;
                    if (dotCount > 1) return;
                    setDueEntryAmount(cleaned);
                  }}
                  placeholder="0"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-entry-description">{t('notes_label') || 'নোট'}</Label>
              <Textarea
                id="due-entry-description"
                value={dueEntryDescription}
                onChange={(e) => setDueEntryDescription(e.target.value)}
                placeholder={t('additional_notes') || 'অতিরিক্ত নোট...'}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDueEntryDialog(false)}>
              {t('cancel') || 'বাতিল'}
            </Button>
            <Button
              onClick={handleDueEntrySubmit}
              disabled={!dueEntryAmount || parseFloat(dueEntryAmount) <= 0}
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-650"
            >
              {t('due_entry') || 'বাকি এন্ট্রি'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Ledger Dialog */}
      <Dialog open={showSupplierLedger} onOpenChange={setShowSupplierLedger}>
        <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              লেজার খাতা - {selectedSupplier?.name}
            </DialogTitle>
            <DialogDescription>
              সাপ্লায়ারের লেনদেনের ইতিহাস ও বকেয়া খতিয়ান
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Balance */}
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">বর্তমান বকেয়া</span>
                  <span className="text-2xl font-bold text-red-600">
                    {formatPrice((selectedSupplier as any)?.totalDue || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40 text-sm">
                  <span className="text-muted-foreground">মোট ক্রয়: {formatPrice((selectedSupplier as any)?.totalPurchases || 0)}</span>
                  <span className="text-muted-foreground">মোট পরিশোধ: {formatPrice((selectedSupplier as any)?.totalPaid || 0)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Ledger Entries */}
            <ScrollArea className="h-75">
              <div className="space-y-2 pr-2">
                {supplierLedgerEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">কোনো লেনদেন পাওয়া যায়নি</p>
                ) : (
                  supplierLedgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        entry.entryType === 'credit' ? 'bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900/30' : 'bg-green-50 border-green-100 dark:bg-green-950/20 dark:border-green-900/30'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          entry.entryType === 'credit' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'
                        )}>
                          {entry.entryType === 'credit' ? (
                            <ArrowUpRight className="w-4 h-4 text-red-600" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(entry.createdAt)} • {entry.referenceId}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          "font-semibold",
                          entry.entryType === 'credit' ? 'text-red-600' : 'text-green-600'
                        )}>
                          {entry.entryType === 'credit' ? '+' : '-'}{formatPrice(entry.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Bal: {formatPrice(entry.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplier Payment Dialog */}
      <Dialog open={showSupplierPaymentDialog} onOpenChange={setShowSupplierPaymentDialog}>
        <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>টাকা পরিশোধ করুন</DialogTitle>
            <DialogDescription>
              {selectedSupplier?.name} এর বকেয়া পরিশোধের পেমেন্ট রেকর্ড
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">বর্তমান বকেয়া</span>
                <span className="font-bold text-red-600">
                  {formatPrice((selectedSupplier as any)?.totalDue || 0)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-payment-dialog-amount">পরিশোধের পরিমাণ</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">৳</span>
                <Input
                  id="supplier-payment-dialog-amount"
                  type="text"
                  value={supplierPaymentAmount}
                  onChange={(e) => {
                    const val = convertBengaliToEnglishNumerals(e.target.value);
                    const cleaned = val.replace(/[^0-9.]/g, '');
                    const dotCount = (cleaned.match(/\./g) || []).length;
                    if (dotCount > 1) return;
                    setSupplierPaymentAmount(cleaned);
                  }}
                  placeholder="0"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>পেমেন্ট পদ্ধতি</Label>
              <Select value={supplierPaymentMethod} onValueChange={(v) => {
                setSupplierPaymentMethod(v);
                if (v === 'Mixed' && supplierPaymentAmount) {
                  const totalAmt = parseFloat(convertBengaliToEnglishNumerals(supplierPaymentAmount)) || 0;
                  setSupplierCashAmount(totalAmt.toString());
                  setSupplierUpiAmount('0');
                } else if (v !== 'Mixed') {
                  setSupplierCashAmount('');
                  setSupplierUpiAmount('');
                }
              }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                  <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                  <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {supplierPaymentMethod === 'Mixed' && (() => {
              const totalAmt = parseFloat(convertBengaliToEnglishNumerals(supplierPaymentAmount)) || 0;
              const cashVal = parseFloat(supplierCashAmount) || 0;
              const upiVal = parseFloat(supplierUpiAmount) || 0;
              const mixedSum = cashVal + upiVal;
              const isMixedOk = Math.abs(mixedSum - totalAmt) < 0.01;
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">নগদ</Label>
                      <Input type="text" value={supplierCashAmount} onChange={(e) => {
                        const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                        setSupplierCashAmount(val);
                        const cVal = parseFloat(val) || 0;
                        if (cVal <= totalAmt) setSupplierUpiAmount((totalAmt - cVal).toFixed(2).replace(/\.00$/, ''));
                        else setSupplierUpiAmount('0');
                      }} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">ইউপিআই</Label>
                      <Input type="text" value={supplierUpiAmount} onChange={(e) => {
                        const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                        setSupplierUpiAmount(val);
                        const uVal = parseFloat(val) || 0;
                        if (uVal <= totalAmt) setSupplierCashAmount((totalAmt - uVal).toFixed(2).replace(/\.00$/, ''));
                        else setSupplierCashAmount('0');
                      }} className="h-9" />
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${isMixedOk ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                    <span>নগদ {cashVal} + ইউপিআই {upiVal}</span>
                    <span className="font-semibold">{isMixedOk ? '✓ মিলেছে' : `বাকি: ${Math.abs(totalAmt - mixedSum).toFixed(2)}`}</span>
                  </div>
                </div>
              );
            })()}

            {/* Quick Amounts */}
            <div className="flex flex-wrap gap-2">
              {[500, 1000, 2000, 5000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setSupplierPaymentAmount(amount.toString())}
                >
                  ৳{amount}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSupplierPaymentAmount(((selectedSupplier as any)?.totalDue || 0).toString())}
              >
                সম্পূর্ণ বকেয়া
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowSupplierPaymentDialog(false)}>
              বাতিল
            </Button>
            <Button
              onClick={handleSupplierPaymentSubmit}
              disabled={!supplierPaymentAmount || parseFloat(supplierPaymentAmount) <= 0}
              className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
            >
              পেমেন্ট রেকর্ড করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PartiesManagement;
