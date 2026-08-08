'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNumberFormat } from '@/hooks/use-number-format';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Receipt, BarChart3, CalendarDays, Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { exportToCSV, getExportDate } from '@/lib/export-utils';
import { useSettingsStore } from '@/stores/settings-store';
import {
  type Supplier,
  type Expense,
  type ExpensesProps,
} from './types';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { ExpensesStats } from './ExpensesStats';
import { ExpenseEditDialog } from './ExpenseEditDialog';
import { AddSupplierDialog } from './AddSupplierDialog';
import {
  parseDateSafe,
  loadCachedExpenses,
  cacheExpenses,
  cacheSuppliers,
} from './utils';

export function Expenses({ onReport }: ExpensesProps) {
  const t = useTranslations('Expenses');
  const tc = useTranslations('Common');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('Supplier Payment');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Supplier Payment');
  const [editNotes, setEditNotes] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('Cash');
  const [editCashAmount, setEditCashAmount] = useState('');
  const [editUpiAmount, setEditUpiAmount] = useState('');
  const [editSupplierId, setEditSupplierId] = useState<string>('');
  const [editDate, setEditDate] = useState('');
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Note: cashAmount/upiAmount auto-calculation is handled inline in the onChange handlers.
  // No useEffect needed here — it would reset values while the user is typing.
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const { toast } = useToast();
  const currency = useSettingsStore((s) => s.settings.currency_symbol || '₹');

  // ৯১খ: সাপ্লায়ার due prompt
  const [showSupplierDuePrompt, setShowSupplierDuePrompt] = useState(false);
  const [pendingExpensePayload, setPendingExpensePayload] = useState<object | null>(null);
  const [pendingSupplierDue, setPendingSupplierDue] = useState(0);
  const [pendingSupplierName, setPendingSupplierName] = useState('');
  const [pendingSupplierId, setPendingSupplierId] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = useMemo(() => format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), []);

  const selectedDate = useMemo(() => {
    if (dateFilterMode === 'today') return today;
    if (dateFilterMode === 'yesterday') return yesterday;
    return customDate || today;
  }, [dateFilterMode, customDate, today, yesterday]);

  const displayDateLabel = useMemo(() => {
    if (dateFilterMode === 'today') return format(new Date(), 'dd MMMM yyyy');
    if (dateFilterMode === 'yesterday') return format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'dd MMMM yyyy');
    return customDate ? format(new Date(customDate), 'dd MMMM yyyy') : format(new Date(), 'dd MMMM yyyy');
  }, [dateFilterMode, customDate]);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) {
        const { data } = await res.json();
        setExpenses(data);
        cacheExpenses(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSuppliers = useCallback(async (query = '') => {
    try {
      const params = new URLSearchParams();
      params.set('pageSize', '100');
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`/api/suppliers?${params.toString()}`);
      if (res.ok) {
        const { data } = await res.json();
        setSuppliers(data);
        cacheSuppliers(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const cached = loadCachedExpenses();
    if (cached.expenses) setExpenses(cached.expenses);
    if (cached.suppliers) setSuppliers(cached.suppliers);
    fetchExpenses();
    fetchSuppliers();
  }, [fetchExpenses, fetchSuppliers]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchSuppliers(supplierSearch), 200);
    return () => window.clearTimeout(timer);
  }, [fetchSuppliers, supplierSearch]);

  // Selected date expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => format(parseDateSafe(e.date), 'yyyy-MM-dd') === selectedDate);
  }, [expenses, selectedDate]);

  const filteredTotal = useMemo(() => filteredExpenses.reduce((s, e) => s + Number(e.amount ?? 0), 0), [filteredExpenses]);

  // Get category Bengali name
  const getCategoryBn = (cat: string) => {
    const key = cat.toLowerCase();
    // rent, utilities, salaries, supplies, maintenance, other
    return t(`categories.${key}`) || cat;
  };

  // Category breakdown for selected date
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount ?? 0);
    });
    return Object.entries(map)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        percentage: filteredTotal > 0 ? (amount / filteredTotal) * 100 : 0,
        count: filteredExpenses.filter((e) => e.category === cat).length,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, filteredTotal]);

  const highestCategory = categoryBreakdown[0] || null;

  const { formatPrice, formatNumber, formatStringNumbers } = useNumberFormat();

  const handleAddExpense = async () => {
    if (!amount || !category) return;

    // ৯১খ: সাপ্লায়ার পেমেন্টে due থাকলে জিজ্ঞেস করা
    if (category === 'Supplier Payment' && supplierId && supplierId !== 'none') {
      const selectedSupplier = suppliers.find(s => s.id === supplierId);
      if (selectedSupplier) {
        try {
          const res = await fetch(`/api/suppliers?id=${supplierId}`);
          if (res.ok) {
            const { data } = await res.json();
            const totalDue = parseFloat(data.totalDue || 0);
            if (totalDue > 0) {
              let finalNotes = notes.trim();
              if (paymentMethod === 'Mixed') {
                const cAmt = parseFloat(cashAmount) || 0;
                const uAmt = parseFloat(upiAmount) || 0;
                const breakdown = `[নগদ: ${cAmt}, ইউপিআই: ${uAmt}]`;
                finalNotes = finalNotes ? `${finalNotes} ${breakdown}` : breakdown;
              }
              const payload = {
                id: uuidv4(),
                amount: parseFloat(convertBengaliToEnglishNumerals(amount)),
                category,
                notes: finalNotes || null,
                paymentMethod,
                date: selectedDate,
                supplierId,
              };
              setPendingExpensePayload(payload);
              setPendingSupplierDue(totalDue);
              setPendingSupplierName(selectedSupplier.name);
              setPendingSupplierId(supplierId);
              setShowSupplierDuePrompt(true);
              return;
            }
          }
        } catch {
          // due চেক ব্যর্থ হলে সরাসরি expense যোগ করা
        }
      }
    }

    await doAddExpense(false);
  };

  // Actual expense POST (isPreviousDuePayment = পূর্বের বাকির পরিশোধ)
  const doAddExpense = async (isPreviousDuePayment: boolean) => {
    if (!amount || !category) return;
    setIsLoading(true);
    let finalNotes = notes.trim();
    if (paymentMethod === 'Mixed') {
      const cAmt = parseFloat(cashAmount) || 0;
      const uAmt = parseFloat(upiAmount) || 0;
      const breakdown = `[নগদ: ${cAmt}, ইউপিআই: ${uAmt}]`;
      finalNotes = finalNotes ? `${finalNotes} ${breakdown}` : breakdown;
    }
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uuidv4(),
          amount: parseFloat(convertBengaliToEnglishNumerals(amount)),
          category,
          notes: finalNotes || null,
          paymentMethod,
          date: selectedDate,
          supplierId: category === 'Supplier Payment' && supplierId && supplierId !== 'none' ? supplierId : null,
        }),
      });
      if (res.ok) {
        toast({ title: t('expense_added') });
        setAmount('');
        setNotes('');
        setPaymentMethod('Cash');
        setCashAmount('');
        setUpiAmount('');
        setSupplierId('');
        fetchExpenses();
      } else {
        toast({ title: tc('error'), description: t('failed_add'), variant: 'destructive' });
      }
    } catch {
      toast({ title: tc('error'), description: t('failed_add'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Pending payload দিয়ে expense যোগ (prompt থেকে)
  const doAddExpenseFromPayload = async (isPreviousDuePayment: boolean) => {
    if (!pendingExpensePayload) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingExpensePayload),
      });
      if (res.ok) {
        toast({ title: t('expense_added') });
        setAmount('');
        setNotes('');
        setPaymentMethod('Cash');
        setCashAmount('');
        setUpiAmount('');
        setSupplierId('');
        fetchExpenses();
      } else {
        toast({ title: tc('error'), description: t('failed_add'), variant: 'destructive' });
      }
    } catch {
      toast({ title: tc('error'), description: t('failed_add'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setShowSupplierDuePrompt(false);
      setPendingExpensePayload(null);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setAddingSupplier(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim() }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setSuppliers(prev => [...prev, data]);
        setSupplierId(data.id);
        setNewSupplierName('');
        setShowAddSupplier(false);
        toast({ title: t('supplier_added'), description: t('supplier_added_desc', { name: data.name }) });
      } else {
        toast({ title: 'Error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setAddingSupplier(false);
    }
  };

  const handleOpenEditDialog = (expense: Expense) => {
    setEditExpense(expense);
    setEditAmount(String(expense.amount ?? ''));
    setEditCategory(expense.category || 'Other');

    let rawNotes = expense.notes ?? '';
    const mixedRegex = /\[নগদ:\s*([0-9.]+),\s*ইউপিআই:\s*([0-9.]+)\]/;
    const match = rawNotes.match(mixedRegex);
    if (match && expense.paymentMethod === 'Mixed') {
      setEditCashAmount(match[1]);
      setEditUpiAmount(match[2]);
      rawNotes = rawNotes.replace(mixedRegex, '').trim();
    } else {
      setEditCashAmount('');
      setEditUpiAmount('');
    }

    setEditNotes(rawNotes);
    setEditPaymentMethod(expense.paymentMethod || 'Cash');
    setEditSupplierId(expense.supplierId ?? '');
    setEditDate(format(parseDateSafe(expense.date), 'yyyy-MM-dd'));
    setShowEditDialog(true);
  };

  const handleUpdateExpense = async () => {
    if (!editExpense || !editAmount || !editCategory || !editDate) return;
    setIsSavingEdit(true);
    let finalNotes = editNotes.trim();
    if (editPaymentMethod === 'Mixed') {
      const cAmt = parseFloat(editCashAmount) || 0;
      const uAmt = parseFloat(editUpiAmount) || 0;
      const breakdown = `[নগদ: ${cAmt}, ইউপিআই: ${uAmt}]`;
      finalNotes = finalNotes ? `${finalNotes} ${breakdown}` : breakdown;
    }
    try {
      const res = await fetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editExpense.id,
          amount: parseFloat(convertBengaliToEnglishNumerals(editAmount)),
          category: editCategory,
          notes: finalNotes || null,
          paymentMethod: editPaymentMethod,
          date: editDate,
          supplierId: editCategory === 'Supplier Payment' && editSupplierId && editSupplierId !== 'none' ? editSupplierId : null,
        }),
      });
      if (res.ok) {
        toast({ title: t('expense_updated') });
        fetchExpenses();
        setShowEditDialog(false);
        setEditExpense(null);
        setEditCashAmount('');
        setEditUpiAmount('');
      } else {
        toast({ title: tc('error'), description: t('failed_update'), variant: 'destructive' });
      }
    } catch {
      toast({ title: tc('error'), description: t('failed_update'), variant: 'destructive' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/expenses?id=${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: t('deleted') });
        fetchExpenses();
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  // CSV Export helper
  const handleExportCSV = () => {
    try {
      const headers = [
        { key: 'category', label: tc('category') },
        { key: 'amount', label: tc('amount') },
        { key: 'supplier', label: tc('supplier') },
        { key: 'notes', label: tc('notes') },
        { key: 'date', label: tc('date') },
      ];
      const exportData = filteredExpenses.map((e) => ({
        category: getCategoryBn(e.category),
        amount: e.amount,
        supplier: e.supplierName || '—',
        notes: e.notes || '—',
        date: format(parseDateSafe(e.date), 'dd/MM/yyyy'),
      }));
      exportToCSV(exportData, `খরচ_রিপোর্ট_${getExportDate()}`, headers);
      toast({ title: tc('export_success') });
    } catch {
      toast({ title: tc('export_failed'), variant: 'destructive' });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-y-auto gap-2 md:gap-4 p-3 md:p-4 pb-24 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 md:w-6 md:h-6 text-emerald-600 dark:text-emerald-500" /> {t('title')}
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">{displayDateLabel}</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1 h-8" disabled={filteredExpenses.length === 0}>
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={onReport} className="gap-1.5 h-8 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
            <BarChart3 className="w-3.5 h-3.5" /> <span className="text-xs">{t('report')}</span>
          </Button>
        </div>
      </div>

      <ExpensesStats
        filteredTotal={filteredTotal}
        filteredCount={filteredExpenses.length}
        highestCategory={highestCategory}
        categoryBreakdown={categoryBreakdown}
        getCategoryBn={getCategoryBn}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        labels={{
          todayTotal: t('today_total'),
          totalEntries: `${tc('total')} ${t('entries')}`,
          highestCategory: t('highest_category'),
          avgEntry: t('avg_entry'),
          categoryBreakdown: t('category_breakdown'),
        }}
      />

      {/* Date Filter & Input */}
      <div className="flex items-center gap-2 shrink-0">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select
          value={dateFilterMode}
          onValueChange={(v: 'today' | 'yesterday' | 'custom') => {
            setDateFilterMode(v);
            if (v !== 'custom') setCustomDate('');
          }}
        >
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{tc('today')}</SelectItem>
            <SelectItem value="yesterday">{tc('yesterday')}</SelectItem>
            <SelectItem value="custom">{tc('custom')}</SelectItem>
          </SelectContent>
        </Select>
        {dateFilterMode === 'custom' && (
          <Input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 h-8 text-sm"
            max={today}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 md:gap-4 min-h-0 flex-1">
        <ExpenseForm
          currency={currency}
          amount={amount}
          setAmount={setAmount}
          category={category}
          setCategory={setCategory}
          notes={notes}
          setNotes={setNotes}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashAmount={cashAmount}
          setCashAmount={setCashAmount}
          upiAmount={upiAmount}
          setUpiAmount={setUpiAmount}
          supplierId={supplierId}
          setSupplierId={setSupplierId}
          supplierOpen={supplierOpen}
          setSupplierOpen={setSupplierOpen}
          suppliers={suppliers}
          supplierSearch={supplierSearch}
          setSupplierSearch={setSupplierSearch}
          isLoading={isLoading}
          onAddExpense={handleAddExpense}
          onShowAddSupplier={() => setShowAddSupplier(true)}
          getCategoryBn={getCategoryBn}
          formatPrice={formatPrice}
          formatStringNumbers={formatStringNumbers}
        />

        <ExpenseList
          expenses={filteredExpenses}
          filteredTotal={filteredTotal}
          dateFilterMode={dateFilterMode}
          onEdit={handleOpenEditDialog}
          onDelete={setDeleteId}
          getCategoryBn={getCategoryBn}
          formatPrice={formatPrice}
        />
      </div>

      <ExpenseEditDialog
        open={showEditDialog}
        onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditExpense(null); } }}
        currency={currency}
        editAmount={editAmount}
        setEditAmount={setEditAmount}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        editDate={editDate}
        setEditDate={setEditDate}
        editPaymentMethod={editPaymentMethod}
        setEditPaymentMethod={setEditPaymentMethod}
        editCashAmount={editCashAmount}
        setEditCashAmount={setEditCashAmount}
        editUpiAmount={editUpiAmount}
        setEditUpiAmount={setEditUpiAmount}
        editSupplierId={editSupplierId}
        setEditSupplierId={setEditSupplierId}
        editSupplierOpen={editSupplierOpen}
        setEditSupplierOpen={setEditSupplierOpen}
        suppliers={suppliers}
        supplierSearch={supplierSearch}
        setSupplierSearch={setSupplierSearch}
        isSavingEdit={isSavingEdit}
        today={today}
        onSave={handleUpdateExpense}
        onShowAddSupplier={() => setShowAddSupplier(true)}
        getCategoryBn={getCategoryBn}
        formatPrice={formatPrice}
        formatStringNumbers={formatStringNumbers}
        labels={{
          editExpense: t('edit_expense'),
          amount: t('amount'),
          category: t('category'),
          supplier: t('supplier'),
          new: t('new'),
          selectSupplier: t('select_supplier'),
          noSupplierFound: t('no_supplier_found'),
          noSupplier: t('no_supplier'),
          notes: t('notes'),
          optionalDescription: t('optional_description'),
          date: t('date'),
          cancel: t('cancel'),
          save: t('save'),
        }}
      />

      <AddSupplierDialog
        open={showAddSupplier}
        onOpenChange={setShowAddSupplier}
        newSupplierName={newSupplierName}
        setNewSupplierName={setNewSupplierName}
        addingSupplier={addingSupplier}
        onAdd={handleAddSupplier}
        labels={{
          addSupplier: t('add_supplier'),
          supplierName: t('supplier_name'),
          enterName: t('enter_name'),
          cancel: t('cancel'),
          add: t('add'),
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_expense')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cannot_undo')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ৯১খ: সাপ্লায়ার due prompt */}
      <AlertDialog open={showSupplierDuePrompt} onOpenChange={(open) => { if (!open) { setShowSupplierDuePrompt(false); setPendingExpensePayload(null); } }}>
        <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('supplier_payment_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{pendingSupplierName}</strong>-এর কাছে বর্তমানে{' '}
                <strong className="text-red-600">{formatPrice(pendingSupplierDue)}</strong>{' '}
                {t('supplier_due_exists')}
                <br /><br />
                {t('supplier_due_question')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => { setShowSupplierDuePrompt(false); setPendingExpensePayload(null); }}>
                {tc('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => doAddExpenseFromPayload(false)}
              >
                {t('new_payment')}
              </AlertDialogAction>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => doAddExpenseFromPayload(true)}
              >
                {t('previous_due_repayment')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Expenses;
