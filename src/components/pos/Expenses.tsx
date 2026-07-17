'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNumberFormat } from '@/hooks/use-number-format';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Trash2, Plus, Receipt, Wallet, Truck, BarChart3, UserPlus, CalendarDays,
  Pencil, Check, ChevronsUpDown, Download, Building2, Wrench, Briefcase, Box,
  MoreHorizontal, Loader2, ArrowUpRight, TrendingUp, TrendingDown
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { convertBengaliToEnglishNumerals, cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useTranslations } from 'next-intl';
import { exportToCSV, getExportDate } from '@/lib/export-utils';
import { useSettingsStore } from '@/stores/settings-store';

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Maintenance', 'Supplier Payment', 'Other'] as const;

const CATEGORY_CONFIG: Record<string, { icon: typeof Wallet; color: string; bgColor: string; gradient: string }> = {
  Rent: { icon: Building2, color: 'text-purple-600', bgColor: 'bg-purple-100', gradient: 'from-purple-500/10 to-purple-500/5' },
  Utilities: { icon: Wrench, color: 'text-blue-600', bgColor: 'bg-blue-100', gradient: 'from-blue-500/10 to-blue-500/5' },
  Salaries: { icon: Briefcase, color: 'text-green-600', bgColor: 'bg-green-100', gradient: 'from-green-500/10 to-green-500/5' },
  Maintenance: { icon: Wrench, color: 'text-orange-600', bgColor: 'bg-orange-100', gradient: 'from-orange-500/10 to-orange-500/5' },
  'Supplier Payment': { icon: Truck, color: 'text-rose-600', bgColor: 'bg-rose-100', gradient: 'from-rose-500/10 to-rose-500/5' },
  Other: { icon: MoreHorizontal, color: 'text-gray-600', bgColor: 'bg-gray-100', gradient: 'from-gray-500/10 to-gray-500/5' },
};

type Supplier = { id: string; name: string; nameEn?: string | null };

interface Expense {
  id: string;
  amount: number;
  category: string;
  notes?: string | null;
  paymentMethod?: string | null;
  date: string | Date;
  supplierId?: string | null;
  supplierName?: string | null;
  isActive?: boolean;
  createdAt?: string | Date;
}

interface ExpensesProps {
  onReport?: () => void;
}

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

  const parseDateSafe = (dateStr: string | Date | null | undefined): Date => {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    const str = String(dateStr);
    const datePart = str.substring(0, 10);
    return new Date(datePart + 'T12:00:00');
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = useMemo(() => format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), []);

  const selectedDate = useMemo(() => {
    if (dateFilterMode === 'today') return today;
    if (dateFilterMode === 'yesterday') return yesterday;
    return customDate || today;
  }, [dateFilterMode, customDate, today, yesterday]);

  const todayExpenses = useMemo(
    () => expenses.filter(e => format(parseDateSafe(e.date), 'yyyy-MM-dd') === today),
    [expenses, today]
  );

  const todayTotal = useMemo(
    () => todayExpenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    [todayExpenses]
  );

  const displayDateLabel = useMemo(() => {
    if (dateFilterMode === 'today') return format(new Date(), 'dd MMMM yyyy');
    if (dateFilterMode === 'yesterday') return format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'dd MMMM yyyy');
    return customDate ? format(new Date(customDate), 'dd MMMM yyyy') : format(new Date(), 'dd MMMM yyyy');
  }, [dateFilterMode, customDate]);

  const EXPENSES_CACHE_TTL = 30 * 60 * 1000;

  const loadCachedExpenses = () => {
    const cacheTime = localStorage.getItem('expenses-cache-time');
    const cachedExpenses = localStorage.getItem('expenses-cache');
    if (cachedExpenses && cacheTime && Date.now() - parseInt(cacheTime, 10) < EXPENSES_CACHE_TTL) {
      try {
        setExpenses(JSON.parse(cachedExpenses));
      } catch (err) {
        console.error('Invalid cached expenses', err);
      }
    }

    const suppliersCacheTime = localStorage.getItem('suppliers-cache-time');
    const cachedSuppliers = localStorage.getItem('suppliers-cache');
    if (cachedSuppliers && suppliersCacheTime && Date.now() - parseInt(suppliersCacheTime, 10) < EXPENSES_CACHE_TTL) {
      try {
        setSuppliers(JSON.parse(cachedSuppliers));
      } catch (err) {
        console.error('Invalid cached suppliers', err);
      }
    }
  };

  const cacheExpenses = (data: Expense[]) => {
    localStorage.setItem('expenses-cache', JSON.stringify(data));
    localStorage.setItem('expenses-cache-time', Date.now().toString());
  };

  const cacheSuppliers = (data: Supplier[]) => {
    localStorage.setItem('suppliers-cache', JSON.stringify(data));
    localStorage.setItem('suppliers-cache-time', Date.now().toString());
  };

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
    loadCachedExpenses();
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

  const { formatPrice, formatNumber, formatDate, formatStringNumbers } = useNumberFormat();

  const handleAddExpense = async () => {
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
        toast({ title: 'Error', description: 'Failed to add expense.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to add expense.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
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
        toast({ title: t('supplier_added'), description: `"${data.name}" যোগ করা হয়েছে।` });
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
        toast({ title: 'Error', description: 'Failed to update expense.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update expense.', variant: 'destructive' });
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
        { key: 'category', label: 'ক্যাটাগরি' },
        { key: 'amount', label: 'পরিমাণ' },
        { key: 'supplier', label: 'সাপ্লায়ার' },
        { key: 'notes', label: 'নোট' },
        { key: 'date', label: 'তারিখ' },
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 shrink-0">
        <Card className="overflow-hidden shadow-sm border-red-200 dark:border-red-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-red-50/80 to-red-100/30 dark:from-red-950/40 dark:to-red-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm shrink-0">
                <Wallet className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{t('today_total')}</p>
                <p className="text-sm md:text-xl font-bold text-red-600 truncate tabular-nums">{formatPrice(filteredTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-blue-200 dark:border-blue-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/30 dark:from-blue-950/40 dark:to-blue-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                <Receipt className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{tc('total')} {t('entries')}</p>
                <p className="text-sm md:text-xl font-bold truncate tabular-nums">{formatNumber(filteredExpenses.length)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-orange-200 dark:border-orange-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-orange-50/80 to-orange-100/30 dark:from-orange-950/40 dark:to-orange-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm shrink-0">
                <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{t('highest_category')}</p>
                <p className="text-xs md:text-base font-bold truncate">
                  {highestCategory ? getCategoryBn(highestCategory.category) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 dark:from-emerald-950/40 dark:to-emerald-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                <ArrowUpRight className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{t('avg_entry')}</p>
                <p className="text-sm md:text-xl font-bold truncate tabular-nums">
                  {formatPrice(filteredExpenses.length > 0 ? Math.round(filteredTotal / filteredExpenses.length) : 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown Progress Bars */}
      {categoryBreakdown.length > 0 && (
        <Card className="overflow-hidden shadow-sm shrink-0">
          <CardContent className="p-2.5 md:p-4">
            <h3 className="font-semibold text-xs md:text-sm mb-2 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              ক্যাটাগরি বিভাজন
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
              {categoryBreakdown.map((cat) => {
                const config = CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG['Other'];
                const Icon = config.icon;
                return (
                  <div key={cat.category} className="space-y-1 border p-2 rounded-lg bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`h-5 w-5 rounded-md bg-gradient-to-br ${config.gradient} flex items-center justify-center shrink-0`}>
                          <Icon className={`h-3 w-3 ${config.color}`} />
                        </div>
                        <span className="text-xs font-medium truncate">{getCategoryBn(cat.category)}</span>
                        <Badge variant="secondary" className="text-[9px] h-4 shrink-0 px-1">
                          {cat.count}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-bold tabular-nums">{formatPrice(cat.amount)}</span>
                        <span className="text-[10px] text-muted-foreground">({formatStringNumbers(cat.percentage.toFixed(0))}%)</span>
                      </div>
                    </div>
                    <Progress value={cat.percentage} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
        {/* Add Expense Form */}
        <Card className="col-span-1 h-fit rounded-xl md:rounded-2xl shadow-sm border border-border/50">
          <CardHeader className="pb-2 pt-3 px-3 md:pb-3 md:pt-4 md:px-4">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-emerald-600" /> {t('add_expense')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 md:space-y-3 px-3 pb-3 md:px-4 md:pb-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('amount')} ({currency})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currency}</span>
                <Input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(convertBengaliToEnglishNumerals(e.target.value))}
                  placeholder="0.00"
                  className="pl-8 text-lg font-bold tabular-nums"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('category')}</label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSupplierId(''); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{getCategoryBn(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {category === 'Supplier Payment' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> {t('supplier')}
                  </label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1 dark:hover:bg-emerald-950/20"
                    onClick={() => setShowAddSupplier(true)}>
                    <UserPlus className="w-3 h-3" /> {t('new')}
                  </Button>
                </div>
                <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierOpen}
                      className="w-full justify-between font-normal px-3 h-9"
                    >
                      <span className="truncate">
                        {supplierId && supplierId !== 'none'
                          ? suppliers.find((s) => s.id === supplierId)?.name
                          : t('select_supplier')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput
                        value={supplierSearch}
                        onValueChange={setSupplierSearch}
                        placeholder={t('select_supplier')}
                      />
                      <CommandList>
                        <CommandEmpty>{t('no_supplier_found')}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              setSupplierId('none');
                              setSupplierOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                supplierId === 'none' || !supplierId ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {t('no_supplier')}
                          </CommandItem>
                          {suppliers.map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={`${supplier.name} ${supplier.nameEn || ''}`}
                              onSelect={() => {
                                setSupplierId(supplier.id);
                                setSupplierOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  supplierId === supplier.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {supplier.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('notes')}</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('optional_description')} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">পেমেন্ট পদ্ধতি</label>
              <Select value={paymentMethod} onValueChange={(v) => {
                setPaymentMethod(v);
                if (v === 'Mixed' && amount) {
                  const totalAmt = parseFloat(convertBengaliToEnglishNumerals(amount)) || 0;
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
              const totalAmt = parseFloat(convertBengaliToEnglishNumerals(amount)) || 0;
              const cashVal = parseFloat(cashAmount) || 0;
              const upiVal = parseFloat(upiAmount) || 0;
              const mixedSum = cashVal + upiVal;
              const isMixedOk = Math.abs(mixedSum - totalAmt) < 0.01;
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium flex items-center gap-1">
                        💵 নগদ ({currency})
                      </label>
                      <Input
                        type="text"
                        value={cashAmount}
                        onChange={(e) => {
                          const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                          setCashAmount(val);
                          const cashVal = parseFloat(val) || 0;
                          if (cashVal <= totalAmt) {
                            setUpiAmount((totalAmt - cashVal).toFixed(2).replace(/\.00$/, ''));
                          } else {
                            setUpiAmount('0');
                          }
                        }}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium flex items-center gap-1">
                        📱 ইউপিআই ({currency})
                      </label>
                      <Input
                        type="text"
                        value={upiAmount}
                        onChange={(e) => {
                          const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                          setUpiAmount(val);
                          const upiVal = parseFloat(val) || 0;
                          if (upiVal <= totalAmt) {
                            setCashAmount((totalAmt - upiVal).toFixed(2).replace(/\.00$/, ''));
                          } else {
                            setCashAmount('0');
                          }
                        }}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${isMixedOk
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                    }`}>
                    <span>নগদ {currency}{formatStringNumbers(cashVal)} + ইউপিআই {currency}{formatStringNumbers(upiVal)}</span>
                    <span className="font-semibold">{isMixedOk ? '✓ মিলেছে' : `বাকি: ${formatPrice(Math.abs(totalAmt - mixedSum))}`}</span>
                  </div>
                </div>
              );
            })()}
            <Button className="w-full h-9 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600" onClick={handleAddExpense} disabled={isLoading || !amount}>
              <Plus className="w-4 h-4 mr-2" /> {t('add')}
            </Button>
          </CardContent>
        </Card>

        {/* Expense List */}
        <Card className="col-span-1 lg:col-span-2 rounded-2xl shadow-sm border border-border/50 flex flex-col h-fit lg:h-full lg:min-h-[350px]">
          <CardHeader className="py-2 px-3 md:pb-3 md:pt-4 md:px-4 shrink-0 border-b">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-500" /> {dateFilterMode !== 'today' ? t('expense_list') : t('today_expense_list')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead>{t('notes')} / {t('supplier')}</TableHead>
                  <TableHead>পেমেন্ট পদ্ধতি</TableHead>
                  <TableHead className="text-right">{t('amount')}</TableHead>
                  <TableHead className="w-10 text-right">{t('action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length > 0 ? filteredExpenses.map((exp: Expense) => {
                  const config = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG['Other'];
                  const Icon = config.icon;
                  return (
                    <TableRow key={exp.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center shrink-0`}>
                            <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                          </div>
                          <Badge variant="outline" className="text-[11px] h-5">{getCategoryBn(exp.category)}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {exp.supplierName && (
                          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium mb-0.5">
                            <Truck className="w-3.5 h-3.5" />{exp.supplierName}
                          </span>
                        )}
                        {exp.notes || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px] h-5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-normal">
                          {exp.paymentMethod || 'Cash'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600 dark:text-red-400 tabular-nums">
                        {formatPrice(Number(exp.amount ?? 0))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(exp)}
                            className="h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(exp.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{dateFilterMode !== 'today' ? t('no_expenses_date') : t('no_expenses_today')}</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
          {filteredExpenses.length > 0 && (
            <div className="flex justify-between items-center px-3 py-px border-t bg-slate-50/50 dark:bg-slate-900/30 shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">{t('total')}</span>
              <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPrice(filteredTotal)}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Edit Expense Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditExpense(null); } }}>
        <DialogContent className="sm:max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> {t('edit_expense')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('amount')} ({currency})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currency}</span>
                <Input
                  type="text"
                  value={editAmount}
                  onChange={(e) => setEditAmount(convertBengaliToEnglishNumerals(e.target.value))}
                  placeholder="0.00"
                  className="pl-8 text-lg font-bold tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('category')}</label>
              <Select value={editCategory} onValueChange={(v) => { setEditCategory(v); if (v !== 'Supplier Payment') setEditSupplierId(''); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{getCategoryBn(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editCategory === 'Supplier Payment' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> {t('supplier')}
                  </label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1 dark:hover:bg-emerald-950/20"
                    onClick={() => setShowAddSupplier(true)}>
                    <UserPlus className="w-3 h-3" /> {t('new')}
                  </Button>
                </div>
                <Popover open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={editSupplierOpen}
                      className="w-full justify-between font-normal px-3 h-9"
                    >
                      <span className="truncate">
                        {editSupplierId && editSupplierId !== 'none'
                          ? suppliers.find((s) => s.id === editSupplierId)?.name
                          : t('select_supplier')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput
                        value={supplierSearch}
                        onValueChange={setSupplierSearch}
                        placeholder={t('select_supplier')}
                      />
                      <CommandList>
                        <CommandEmpty>{t('no_supplier_found')}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              setEditSupplierId('none');
                              setEditSupplierOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                editSupplierId === 'none' || !editSupplierId ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {t('no_supplier')}
                          </CommandItem>
                          {suppliers.map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={`${supplier.name} ${supplier.nameEn || ''}`}
                              onSelect={() => {
                                setEditSupplierId(supplier.id);
                                setEditSupplierOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  editSupplierId === supplier.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {supplier.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('notes')}</label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder={t('optional_description')} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('date')}</label>
              <Input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                max={today}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">পেমেন্ট পদ্ধতি</label>
              <Select value={editPaymentMethod} onValueChange={(v) => {
                setEditPaymentMethod(v);
                if (v === 'Mixed' && editAmount) {
                  const totalAmt = parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0;
                  const currentCash = parseFloat(editCashAmount) || 0;
                  const currentUpi = parseFloat(editUpiAmount) || 0;
                  if (currentCash + currentUpi === 0) {
                    setEditCashAmount(totalAmt.toString());
                    setEditUpiAmount('0');
                  }
                } else if (v !== 'Mixed') {
                  setEditCashAmount('');
                  setEditUpiAmount('');
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
            {editPaymentMethod === 'Mixed' && (() => {
              const totalAmt = parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0;
              const cashVal = parseFloat(editCashAmount) || 0;
              const upiVal = parseFloat(editUpiAmount) || 0;
              const mixedSum = cashVal + upiVal;
              const isMixedOk = Math.abs(mixedSum - totalAmt) < 0.01;
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium flex items-center gap-1">
                        💵 নগদ ({currency})
                      </label>
                      <Input
                        type="text"
                        value={editCashAmount}
                        onChange={(e) => {
                          const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                          setEditCashAmount(val);
                          const cashV = parseFloat(val) || 0;
                          if (cashV <= totalAmt) {
                            setEditUpiAmount((totalAmt - cashV).toFixed(2).replace(/\.00$/, ''));
                          } else {
                            setEditUpiAmount('0');
                          }
                        }}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium flex items-center gap-1">
                        📱 ইউপিআই ({currency})
                      </label>
                      <Input
                        type="text"
                        value={editUpiAmount}
                        onChange={(e) => {
                          const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                          setEditUpiAmount(val);
                          const upiV = parseFloat(val) || 0;
                          if (upiV <= totalAmt) {
                            setEditCashAmount((totalAmt - upiV).toFixed(2).replace(/\.00$/, ''));
                          } else {
                            setEditCashAmount('0');
                          }
                        }}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${isMixedOk
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                    }`}>
                    <span>নগদ {currency}{formatStringNumbers(cashVal)} + ইউপিআই {currency}{formatStringNumbers(upiVal)}</span>
                    <span className="font-semibold">{isMixedOk ? '✓ মিলেছে' : `বাকি: ${formatPrice(Math.abs(totalAmt - mixedSum))}`}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2 shrink-0">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditExpense(null); }}>
              {t('cancel')}
            </Button>
            <Button onClick={handleUpdateExpense} disabled={isSavingEdit || !editAmount || !editCategory || !editDate} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600">
              {isSavingEdit && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddSupplier} onOpenChange={setShowAddSupplier}>
        <DialogContent className="sm:max-w-sm w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> {t('add_supplier')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <Label htmlFor="new-supplier-name">{t('supplier_name')}</Label>
            <Input
              id="new-supplier-name"
              value={newSupplierName}
              onChange={e => setNewSupplierName(e.target.value)}
              placeholder={t('enter_name')}
              onKeyDown={e => e.key === 'Enter' && handleAddSupplier()}
              autoFocus
              className="h-9"
            />
          </div>
          <DialogFooter className="gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowAddSupplier(false)}>{t('cancel')}</Button>
            <Button onClick={handleAddSupplier} disabled={addingSupplier || !newSupplierName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600">
              {addingSupplier && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t('add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

export default Expenses;
