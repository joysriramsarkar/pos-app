'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Plus, Receipt, IndianRupee, Truck, BarChart3, UserPlus, CalendarDays, Pencil, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { convertBengaliToEnglishNumerals, cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Other'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Rent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Utilities: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Salaries: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Supplies: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

type Supplier = { id: string; name: string };

interface Expense {
  id: string;
  amount: number;
  category: string;
  notes?: string | null;
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('Supplies');
  const [notes, setNotes] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Supplies');
  const [editNotes, setEditNotes] = useState('');
  const [editSupplierId, setEditSupplierId] = useState<string>('');
  const [editDate, setEditDate] = useState('');
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const { toast } = useToast();

  const today = format(new Date(), 'yyyy-MM-dd');
  const selectedDate = useCustomDate && customDate ? customDate : today;

  const todayExpenses = useMemo(
    () => expenses.filter(e => format(new Date(e.date), 'yyyy-MM-dd') === today),
    [expenses, today]
  );

  const todayTotal = useMemo(
    () => todayExpenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    [todayExpenses]
  );

  const displayDateLabel = useMemo(
    () => (useCustomDate && customDate ? format(new Date(customDate), 'dd MMMM yyyy') : format(new Date(), 'dd MMMM yyyy')),
    [useCustomDate, customDate]
  );

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) {
        const { data } = await res.json();
        setExpenses(data);
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
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchSuppliers(supplierSearch), 200);
    return () => window.clearTimeout(timer);
  }, [fetchSuppliers, supplierSearch]);

  // Selected date expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => format(new Date(e.date), 'yyyy-MM-dd') === selectedDate);
  }, [expenses, selectedDate]);

  const filteredTotal = useMemo(() => filteredExpenses.reduce((s, e) => s + Number(e.amount ?? 0), 0), [filteredExpenses]);

  const handleAddExpense = async () => {
    if (!amount || !category) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: convertBengaliToEnglishNumerals(amount),
          category,
          notes,
          date: selectedDate,
          supplierId: category === 'Supplies' && supplierId && supplierId !== 'none' ? supplierId : null,
        }),
      });
      if (res.ok) {
        toast({ title: 'খরচ যোগ হয়েছে' });
        setAmount('');
        setNotes('');
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
        toast({ title: 'সাপ্লায়ার যোগ হয়েছে', description: `"${data.name}" যোগ করা হয়েছে।` });
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
    setEditCategory(expense.category || 'Supplies');
    setEditNotes(expense.notes ?? '');
    setEditSupplierId(expense.supplierId ?? '');
    setEditDate(format(new Date(expense.date), 'yyyy-MM-dd'));
    setShowEditDialog(true);
  };

  const handleUpdateExpense = async () => {
    if (!editExpense || !editAmount || !editCategory || !editDate) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editExpense.id,
          amount: convertBengaliToEnglishNumerals(editAmount),
          category: editCategory,
          notes: editNotes,
          date: editDate,
          supplierId: editCategory === 'Supplies' && editSupplierId && editSupplierId !== 'none' ? editSupplierId : null,
        }),
      });
      if (res.ok) {
        toast({ title: 'খরচ আপডেট হয়েছে' });
        fetchExpenses();
        setShowEditDialog(false);
        setEditExpense(null);
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
        toast({ title: 'মুছে ফেলা হয়েছে' });
        fetchExpenses();
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6" /> Expenses
          </h1>
          <p className="text-muted-foreground text-sm">{displayDateLabel} — খরচ</p>
        </div>
        <Button variant="outline" onClick={onReport} className="gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400">
          <BarChart3 className="w-4 h-4" /> রিপোর্ট
        </Button>
      </div>

      {/* Today's Total */}
      <Card className="rounded-2xl shadow-sm bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/40">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-200/50 dark:bg-red-800/50 flex items-center justify-center shrink-0">
            <IndianRupee className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">আজকের মোট খরচ</p>
            <p className="text-2xl font-black text-red-700 dark:text-red-400">{formatPrice(todayTotal)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">{todayExpenses.length}টি এন্ট্রি</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Add Expense Form */}
        <Card className="col-span-1 h-fit rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> খরচ যোগ করুন</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">পরিমাণ (₹)</label>
              <Input
                type="text"
                value={amount}
                onChange={(e) => setAmount(convertBengaliToEnglishNumerals(e.target.value))}
                placeholder="0.00"
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ক্যাটাগরি</label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSupplierId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {category === 'Supplies' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> সাপ্লায়ার
                  </label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-blue-600 hover:text-blue-700 px-1"
                    onClick={() => setShowAddSupplier(true)}>
                    <UserPlus className="w-3 h-3" /> নতুন
                  </Button>
                </div>
                <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierOpen}
                      className="w-full justify-between font-normal px-3"
                    >
                      <span className="truncate">
                        {supplierId && supplierId !== 'none'
                          ? suppliers.find((s) => s.id === supplierId)?.name
                          : "সাপ্লায়ার নির্বাচন করুন"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput
                        value={supplierSearch}
                        onValueChange={setSupplierSearch}
                        placeholder="সাপ্লায়ার খুঁজুন..."
                      />
                      <CommandList>
                        <CommandEmpty>কোনো সাপ্লায়ার পাওয়া যায়নি।</CommandEmpty>
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
                            — কোনো সাপ্লায়ার নেই —
                          </CommandItem>
                          {suppliers.map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={supplier.name}
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
              <label className="text-sm font-medium">নোট</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ঐচ্ছিক বিবরণ..." />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">তারিখ</label>
                <Button
                  type="button"
                  variant={useCustomDate ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-xs gap-1 px-2"
                  onClick={() => { setUseCustomDate(v => !v); setCustomDate(''); }}
                >
                  <CalendarDays className="w-3 h-3" /> কাস্টম
                </Button>
              </div>
              {useCustomDate ? (
                <Input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  max={today}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{format(new Date(), 'dd MMM yyyy')} (আজ)</p>
              )}
            </div>
            <Button className="w-full" onClick={handleAddExpense} disabled={isLoading || !amount || (useCustomDate && !customDate)}>
              <Plus className="w-4 h-4 mr-2" /> যোগ করুন
            </Button>
          </CardContent>
        </Card>

        {/* Today's Expense List */}
        <Card className="col-span-1 md:col-span-2 rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-red-500" /> {useCustomDate && customDate ? 'খরচের তালিকা' : 'আজকের খরচের তালিকা'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ক্যাটাগরি</TableHead>
                  <TableHead>নোট / সাপ্লায়ার</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead className="w-10 text-right">কর্ম</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length > 0 ? filteredExpenses.map((exp: Expense) => (
                  <TableRow key={exp.id}>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS.Other}`}>
                        {exp.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {exp.supplierName && (
                        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium mb-0.5">
                          <Truck className="w-3 h-3" />{exp.supplierName}
                        </span>
                      )}
                      {exp.notes || '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatPrice(Number(exp.amount ?? 0))}</TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(exp)}
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(exp.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{useCustomDate && customDate ? 'এই তারিখে কোনো খরচ নেই।' : 'আজকে কোনো খরচ নেই।'}</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {filteredExpenses.length > 0 && (
              <div className="flex justify-end px-4 py-3 border-t">
                <span className="text-sm font-semibold">মোট: {formatPrice(filteredTotal)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Expense Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) setShowEditDialog(false); }}>
        <DialogContent className="sm:max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> খরচ সম্পাদনা করুন
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">পরিমাণ (₹)</label>
              <Input
                type="text"
                value={editAmount}
                onChange={(e) => setEditAmount(convertBengaliToEnglishNumerals(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ক্যাটাগরি</label>
              <Select value={editCategory} onValueChange={(v) => { setEditCategory(v); if (v !== 'Supplies') setEditSupplierId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editCategory === 'Supplies' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> সাপ্লায়ার
                  </label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-blue-600 hover:text-blue-700 px-1"
                    onClick={() => setShowAddSupplier(true)}>
                    <UserPlus className="w-3 h-3" /> নতুন
                  </Button>
                </div>
                <Popover open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={editSupplierOpen}
                      className="w-full justify-between font-normal px-3"
                    >
                      <span className="truncate">
                        {editSupplierId && editSupplierId !== 'none'
                          ? suppliers.find((s) => s.id === editSupplierId)?.name
                          : "সাপ্লায়ার নির্বাচন করুন"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput
                        value={supplierSearch}
                        onValueChange={setSupplierSearch}
                        placeholder="সাপ্লায়ার খুঁজুন..."
                      />
                      <CommandList>
                        <CommandEmpty>কোনো সাপ্লায়ার পাওয়া যায়নি।</CommandEmpty>
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
                            — কোনো সাপ্লায়ার নেই —
                          </CommandItem>
                          {suppliers.map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={supplier.name}
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
              <label className="text-sm font-medium">নোট</label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="ঐচ্ছিক বিবরণ..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">তারিখ</label>
              <Input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                max={today}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditExpense(null); }}>
              বাতিল
            </Button>
            <Button onClick={handleUpdateExpense} disabled={isSavingEdit || !editAmount || !editCategory || !editDate}>
              <Plus className="w-4 h-4 mr-1" /> সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddSupplier} onOpenChange={setShowAddSupplier}>
        <DialogContent className="sm:max-w-sm w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> নতুন সাপ্লায়ার যোগ করুন
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <Label htmlFor="new-supplier-name">সাপ্লায়ারের নাম</Label>
            <Input
              id="new-supplier-name"
              value={newSupplierName}
              onChange={e => setNewSupplierName(e.target.value)}
              placeholder="নাম লিখুন..."
              onKeyDown={e => e.key === 'Enter' && handleAddSupplier()}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddSupplier(false)}>বাতিল</Button>
            <Button onClick={handleAddSupplier} disabled={addingSupplier || !newSupplierName.trim()}>
              <Plus className="w-4 h-4 mr-1" /> যোগ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>খরচ মুছবেন?</AlertDialogTitle>
            <AlertDialogDescription>এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Expenses;
