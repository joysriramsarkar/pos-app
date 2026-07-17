'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { 
  Calculator, TrendingUp, TrendingDown, Trash2, Edit2, 
  Loader2, Calendar, FileSpreadsheet, Plus, AlertCircle 
} from 'lucide-react';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DailyRecord {
  id: string;
  date: string;
  sales: number;
  expenses: number;
  profit: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function DailyProfitCalculator() {
  const t = useTranslations('DailyCalculator');
  const tc = useTranslations('Common');
  const { formatPrice, formatDate } = useNumberFormat();
  const { toast } = useToast();
  const currency = useSettingsStore((s) => s.settings.currency_symbol || '₹');

  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form State
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [salesInput, setSalesInput] = useState('');
  const [expensesInput, setExpensesInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Load records on mount
  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/daily-manual-records');
      if (res.ok) {
        const { data } = await res.json();
        setRecords(data);
        // Sync local storage as backup cache
        localStorage.setItem('daily-manual-records-cache', JSON.stringify(data));
      } else {
        // Fallback to local storage if offline
        const cache = localStorage.getItem('daily-manual-records-cache');
        if (cache) setRecords(JSON.parse(cache));
      }
    } catch (e) {
      console.error(e);
      const cache = localStorage.getItem('daily-manual-records-cache');
      if (cache) setRecords(JSON.parse(cache));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Live calculated profit
  const liveProfit = useMemo(() => {
    const s = parseFloat(convertBengaliToEnglishNumerals(salesInput)) || 0;
    const e = parseFloat(convertBengaliToEnglishNumerals(expensesInput)) || 0;
    return s - e;
  }, [salesInput, expensesInput]);

  // Aggregate stats
  const totalSales = useMemo(() => records.reduce((sum, r) => sum + r.sales, 0), [records]);
  const totalExpenses = useMemo(() => records.reduce((sum, r) => sum + r.expenses, 0), [records]);
  const totalProfit = useMemo(() => records.reduce((sum, r) => sum + r.profit, 0), [records]);

  // Handle save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !salesInput || !expensesInput) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/daily-manual-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          sales: parseFloat(convertBengaliToEnglishNumerals(salesInput)) || 0,
          expenses: parseFloat(convertBengaliToEnglishNumerals(expensesInput)) || 0,
          notes: notesInput.trim() || null,
        }),
      });

      if (res.ok) {
        toast({ title: t('success_save') });
        // Reset form
        setSalesInput('');
        setExpensesInput('');
        setNotesInput('');
        setEditingId(null);
        setSelectedDate(todayStr);
        fetchRecords();
      } else {
        const err = await res.json();
        toast({ title: 'Save failed', description: err.error || 'Failed to save record.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error occurred.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Load record for editing
  const handleEdit = (record: DailyRecord) => {
    setEditingId(record.id);
    setSelectedDate(record.date);
    setSalesInput(record.sales.toString());
    setExpensesInput(record.expenses.toString());
    setNotesInput(record.notes || '');
    // Scroll form into view if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const res = await fetch(`/api/daily-manual-records?id=${deleteId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({ title: t('success_delete') });
        fetchRecords();
      } else {
        toast({ title: 'Delete failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  // Format date display nicely
  const formatDateBnEn = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMMM yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-y-auto gap-4 p-4 pb-24 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <Card className="overflow-hidden shadow-sm border-blue-200 dark:border-blue-900/50">
          <CardContent className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/30 dark:from-blue-950/40 dark:to-blue-900/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shrink-0">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground whitespace-nowrap">{t('total_sales')}</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap tabular-nums">{formatPrice(totalSales)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-red-200 dark:border-red-900/50">
          <CardContent className="p-4 bg-gradient-to-br from-red-50/80 to-red-100/30 dark:from-red-950/40 dark:to-red-900/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md shrink-0">
                <TrendingDown className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground whitespace-nowrap">{t('total_expenses')}</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">{formatPrice(totalExpenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "overflow-hidden shadow-sm border-emerald-200 dark:border-emerald-900/50",
          totalProfit < 0 && "border-rose-200 dark:border-rose-900/50"
        )}>
          <CardContent className={cn(
            "p-4 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 dark:from-emerald-950/40 dark:to-emerald-900/20",
            totalProfit < 0 && "from-rose-50/80 to-rose-100/30 dark:from-rose-950/40 dark:to-rose-900/20"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shrink-0",
                totalProfit < 0 && "from-rose-500 to-rose-600"
              )}>
                <Calculator className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground whitespace-nowrap">{t('total_profit')}</p>
                <p className={cn(
                  "text-xl font-bold whitespace-nowrap tabular-nums",
                  totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}>
                  {formatPrice(totalProfit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 flex-1">
        {/* Input Form */}
        <Card className="col-span-1 h-fit rounded-2xl shadow-sm border border-border/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" />
              {editingId ? t('edit_record') : t('add_record')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <form onSubmit={handleSave} className="space-y-4">
              {/* Date */}
              <div className="space-y-1.5">
                <Label htmlFor="record-date">{t('date')}</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="record-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-9 h-9"
                    max={todayStr}
                    required
                  />
                </div>
              </div>

              {/* Sales */}
              <div className="space-y-1.5">
                <Label htmlFor="record-sales">{t('sales')}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currency}</span>
                  <Input
                    id="record-sales"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={salesInput}
                    onChange={(e) => setSalesInput(convertBengaliToEnglishNumerals(e.target.value))}
                    className="pl-8 h-9 text-base font-medium tabular-nums"
                    required
                  />
                </div>
              </div>

              {/* Expenses */}
              <div className="space-y-1.5">
                <Label htmlFor="record-expenses">{t('expenses')}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currency}</span>
                  <Input
                    id="record-expenses"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={expensesInput}
                    onChange={(e) => setExpensesInput(convertBengaliToEnglishNumerals(e.target.value))}
                    className="pl-8 h-9 text-base font-medium tabular-nums"
                    required
                  />
                </div>
              </div>

              {/* Net Profit Display */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-dashed flex justify-between items-center">
                <span className="text-xs font-semibold text-muted-foreground">{t('net_profit')}:</span>
                <span className={cn(
                  "text-lg font-black tabular-nums",
                  liveProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}>
                  {formatPrice(liveProfit)}
                </span>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="record-notes">{t('notes')}</Label>
                <Textarea
                  id="record-notes"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder={t('notes_placeholder')}
                  className="h-16 resize-none"
                />
              </div>

              <div className="flex gap-2">
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-9"
                    onClick={() => {
                      setEditingId(null);
                      setSalesInput('');
                      setExpensesInput('');
                      setNotesInput('');
                      setSelectedDate(todayStr);
                    }}
                  >
                    {tc('cancel')}
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1 h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('saving')}
                    </>
                  ) : (
                    t('save')
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Records List */}
        <Card className="col-span-1 lg:col-span-2 h-fit rounded-2xl shadow-sm border border-border/50">
          <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              {t('view_history')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto border rounded-xl">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-900/30">
                  <TableRow>
                    <TableHead className="w-[30%]">{t('date')}</TableHead>
                    <TableHead className="text-right">{t('sales')}</TableHead>
                    <TableHead className="text-right">{t('expenses')}</TableHead>
                    <TableHead className="text-right">{t('profit')}</TableHead>
                    <TableHead className="w-[20%]">{t('notes')}</TableHead>
                    <TableHead className="text-right">{tc('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">{tc('loading')}</span>
                      </TableCell>
                    </TableRow>
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        <AlertCircle className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
                        {t('no_records')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => (
                      <TableRow key={record.id} className="hover:bg-slate-50/30">
                        <TableCell className="font-semibold text-xs whitespace-nowrap">
                          {formatDateBnEn(record.date)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-xs">
                          {formatPrice(record.sales)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-xs text-rose-600">
                          {formatPrice(record.expenses)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold tabular-nums text-xs",
                          record.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {formatPrice(record.profit)}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]" title={record.notes || ''}>
                          {record.notes || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1.5 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                              onClick={() => handleEdit(record)}
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              onClick={() => setDeleteId(record.id)}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="w-[95vw] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('delete_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {tc('delete') || 'মুছুন'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
