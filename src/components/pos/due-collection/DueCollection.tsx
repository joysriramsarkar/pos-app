'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useCustomersStore } from '@/stores/pos-store';
import { useNumberFormat } from '@/hooks/use-number-format';
import { toast } from 'sonner';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';
import type { DueCustomer, ViewState, PayMethod, SortMode } from './types';
import { SuccessView } from './SuccessView';
import { CollectionForm } from './CollectionForm';
import { CustomerList } from './CustomerList';

export function DueCollection() {
  const t = useTranslations('DueCollection');
  const tc = useTranslations('Common');
  const updateCustomer = useCustomersStore((s) => s.updateCustomer);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [customers, setCustomers] = useState<DueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('due_desc');
  const [selectedCustomer, setSelectedCustomer] = useState<DueCustomer | null>(null);
  const [view, setView] = useState<ViewState>('list');
  const [collectAmount, setCollectAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successData, setSuccessData] = useState<{ collected: number; remaining: number } | null>(null);
  const [collectedToday, setCollectedToday] = useState(0);

  useEffect(() => {
    if (paymentMethod === 'Mixed') {
      const cash = parseFloat(convertBengaliToEnglishNumerals(cashAmount)) || 0;
      const upi = parseFloat(convertBengaliToEnglishNumerals(upiAmount)) || 0;
      setCollectAmount(String(toMoneyNumber(cash + upi)));
    }
  }, [cashAmount, upiAmount, paymentMethod]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/due-collection');
      const data = await res.json();
      if (data.success) {
        setCustomers(
          (data.data as DueCustomer[]).map((c) => ({
            ...c,
            dueAmount: toMoneyNumber(c.dueAmount),
          })),
        );
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Optional: today's collected from ledger-ish stats — best-effort from list refresh times
  useEffect(() => {
    // Track session-local total (reset on remount is fine)
  }, []);

  const totalDue = useMemo(
    () => customers.reduce((sum, c) => sum + c.dueAmount, 0),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = customers;
    if (term) {
      list = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.nameEn && c.nameEn.toLowerCase().includes(term)) ||
          (c.phone && c.phone.includes(term)),
      );
    }
    const sorted = [...list];
    if (sortMode === 'due_desc') {
      sorted.sort((a, b) => b.dueAmount - a.dueAmount);
    } else if (sortMode === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
    } else {
      sorted.sort((a, b) => {
        const da = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
        const db = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
        return da - db;
      });
    }
    return sorted;
  }, [customers, search, sortMode]);

  const topDebtors = useMemo(
    () => [...customers].sort((a, b) => b.dueAmount - a.dueAmount).slice(0, 5),
    [customers],
  );

  const handleSelectCustomer = (customer: DueCustomer) => {
    setSelectedCustomer(customer);
    setCollectAmount('');
    setPaymentMethod('Cash');
    setNotes('');
    setCashAmount('');
    setUpiAmount('');
    setView('form');
    setTimeout(() => amountInputRef.current?.focus(), 100);
  };

  const setAmount = (amt: number) => {
    const v = toMoneyNumber(Math.min(amt, selectedCustomer?.dueAmount ?? amt));
    if (paymentMethod === 'Mixed') {
      setCashAmount(String(v));
      setUpiAmount('0');
    } else {
      setCollectAmount(String(v));
    }
  };

  const handleSetFullAmount = () => {
    if (selectedCustomer) setAmount(selectedCustomer.dueAmount);
  };

  const handleSetHalfAmount = () => {
    if (selectedCustomer) setAmount(selectedCustomer.dueAmount / 2);
  };

  const parsedAmount = toMoneyNumber(
    parseFloat(convertBengaliToEnglishNumerals(collectAmount)) || 0,
  );

  const handleSubmit = () => {
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error(t('enter_amount'));
      return;
    }
    if (selectedCustomer && parsedAmount > selectedCustomer.dueAmount + 0.001) {
      toast.error(t('amount_exceeds'));
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmCollection = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    try {
      const amount = parsedAmount;
      const methodLabel =
        paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : t('mixed');
      const finalNotes =
        paymentMethod === 'Mixed'
          ? `${notes || ''} [Cash: ${currencySymbol}${cashAmount || 0}, UPI: ${currencySymbol}${upiAmount || 0}]`.trim()
          : notes;

      const res = await fetch('/api/due-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount,
          paymentMethod: paymentMethod, // English codes for API/ledger
          notes: finalNotes || `Due collection (${methodLabel})`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = data.data.customer;
        updateCustomer(selectedCustomer.id, {
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          notes: updated.notes,
          totalDue: updated.totalDue,
          totalPaid: updated.totalPaid,
          prepaidBalance: updated.prepaidBalance,
        });
        setSuccessData({
          collected: amount,
          remaining: toMoneyNumber(data.data.remainingDue),
        });
        setCollectedToday((prev) => toMoneyNumber(prev + amount));
        setShowConfirm(false);
        setView('success');
        toast.success(t('collection_success'));
        if (navigator?.vibrate) navigator.vibrate(40);
        fetchCustomers();
      } else {
        toast.error(data.error || t('collection_failed'));
      }
    } catch {
      toast.error(t('collection_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCollectMore = () => {
    if (selectedCustomer && successData) {
      setSelectedCustomer({
        ...selectedCustomer,
        dueAmount: successData.remaining,
      });
      setCollectAmount('');
      setPaymentMethod('Cash');
      setNotes('');
      setCashAmount('');
      setUpiAmount('');
      setView('form');
      setTimeout(() => amountInputRef.current?.focus(), 100);
    }
  };

  const handleDone = () => {
    setSelectedCustomer(null);
    setSuccessData(null);
    setView('list');
  };

  const { formatPrice: formatTaka, formatNumber, formatStringNumbers, currencySymbol } = useNumberFormat();

  if (view === 'success' && successData) {
    return (
      <SuccessView
        customerName={selectedCustomer?.name}
        collected={successData.collected}
        remaining={successData.remaining}
        formatTaka={formatTaka}
        onCollectMore={handleCollectMore}
        onDone={handleDone}
      />
    );
  }

  if (view === 'form' && selectedCustomer) {
    return (
      <CollectionForm
        customer={selectedCustomer}
        collectAmount={collectAmount}
        setCollectAmount={setCollectAmount}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        cashAmount={cashAmount}
        setCashAmount={setCashAmount}
        upiAmount={upiAmount}
        setUpiAmount={setUpiAmount}
        notes={notes}
        setNotes={setNotes}
        amountInputRef={amountInputRef}
        parsedAmount={parsedAmount}
        showConfirm={showConfirm}
        setShowConfirm={setShowConfirm}
        submitting={submitting}
        currencySymbol={currencySymbol}
        formatTaka={formatTaka}
        formatStringNumbers={formatStringNumbers}
        onBack={() => {
          setView('list');
          setSelectedCustomer(null);
        }}
        onSetFullAmount={handleSetFullAmount}
        onSetHalfAmount={handleSetHalfAmount}
        onSetAmount={setAmount}
        onSubmit={handleSubmit}
        onConfirm={handleConfirmCollection}
      />
    );
  }

  // —— LIST VIEW ——
  return (
    <CustomerList
      customers={customers}
      filteredCustomers={filteredCustomers}
      topDebtors={topDebtors}
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      sortMode={sortMode}
      onSortModeChange={setSortMode}
      totalDue={totalDue}
      collectedToday={collectedToday}
      formatTaka={formatTaka}
      formatNumber={formatNumber}
      onRefresh={() => fetchCustomers()}
      onSelectCustomer={handleSelectCustomer}
    />
  );
}

export default DueCollection;
