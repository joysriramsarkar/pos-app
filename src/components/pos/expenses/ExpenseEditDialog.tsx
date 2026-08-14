'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Pencil, Check, ChevronsUpDown, Truck, UserPlus, Loader2 } from 'lucide-react';
import { convertBengaliToEnglishNumerals, cn } from '@/lib/utils';
import { CATEGORIES, type Supplier } from './types';

interface ExpenseEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  editAmount: string;
  setEditAmount: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  editDate: string;
  setEditDate: (v: string) => void;
  editPaymentMethod: string;
  setEditPaymentMethod: (v: string) => void;
  editCashAmount: string;
  setEditCashAmount: (v: string) => void;
  editUpiAmount: string;
  setEditUpiAmount: (v: string) => void;
  editSupplierId: string;
  setEditSupplierId: (v: string) => void;
  editSupplierOpen: boolean;
  setEditSupplierOpen: (v: boolean) => void;
  suppliers: Supplier[];
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  isSavingEdit: boolean;
  today: string;
  onSave: () => void;
  onShowAddSupplier: () => void;
  getCategoryBn: (cat: string) => string;
  formatPrice: (n: number) => string;
  formatStringNumbers: (s: string) => string;
  labels: {
    editExpense: string;
    amount: string;
    category: string;
    supplier: string;
    new: string;
    selectSupplier: string;
    noSupplierFound: string;
    noSupplier: string;
    notes: string;
    optionalDescription: string;
    date: string;
    cancel: string;
    save: string;
  };
}

export function ExpenseEditDialog({
  open,
  onOpenChange,
  currency,
  editAmount,
  setEditAmount,
  editCategory,
  setEditCategory,
  editNotes,
  setEditNotes,
  editDate,
  setEditDate,
  editPaymentMethod,
  setEditPaymentMethod,
  editCashAmount,
  setEditCashAmount,
  editUpiAmount,
  setEditUpiAmount,
  editSupplierId,
  setEditSupplierId,
  editSupplierOpen,
  setEditSupplierOpen,
  suppliers,
  supplierSearch,
  setSupplierSearch,
  isSavingEdit,
  today,
  onSave,
  onShowAddSupplier,
  getCategoryBn,
  formatPrice,
  formatStringNumbers,
  labels,
}: ExpenseEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> {labels.editExpense}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{labels.amount} ({currency})</label>
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
            <label className="text-sm font-medium">{labels.category}</label>
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
                  <Truck className="w-3.5 h-3.5" /> {labels.supplier}
                </label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1 dark:hover:bg-emerald-950/20"
                  onClick={onShowAddSupplier}>
                  <UserPlus className="w-3 h-3" /> {labels.new}
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
                        : labels.selectSupplier}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput
                      value={supplierSearch}
                      onValueChange={setSupplierSearch}
                      placeholder={labels.selectSupplier}
                    />
                    <CommandList>
                      <CommandEmpty>{labels.noSupplierFound}</CommandEmpty>
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
                          {labels.noSupplier}
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
            <label className="text-sm font-medium">{labels.notes}</label>
            <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder={labels.optionalDescription} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{labels.date}</label>
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
                <SelectItem value="Cash">নগদ</SelectItem>
                <SelectItem value="UPI">ইউপিআই</SelectItem>
                <SelectItem value="Mixed">মিশ্র</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editPaymentMethod === 'Mixed' && (
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
                      if (cashV <= (parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0)) {
                        setEditUpiAmount(((parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0) - cashV).toFixed(2).replace(/\.00$/, ''));
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
                      if (upiV <= (parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0)) {
                        setEditCashAmount(((parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0) - upiV).toFixed(2).replace(/\.00$/, ''));
                      } else {
                        setEditCashAmount('0');
                      }
                    }}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
              </div>
              <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${Math.abs((parseFloat(editCashAmount) || 0) + (parseFloat(editUpiAmount) || 0) - (parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0)) < 0.01
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                }`}>
                <span>নগদ {currency}{formatStringNumbers(String(parseFloat(editCashAmount) || 0))} + ইউপিআই {currency}{formatStringNumbers(String(parseFloat(editUpiAmount) || 0))}</span>
                <span className="font-semibold">{Math.abs((parseFloat(editCashAmount) || 0) + (parseFloat(editUpiAmount) || 0) - (parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0)) < 0.01 ? '✓ মিলেছে' : `বাকি: ${formatPrice(Math.abs((parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0) - ((parseFloat(editCashAmount) || 0) + (parseFloat(editUpiAmount) || 0))))}`}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button onClick={onSave} disabled={isSavingEdit || !editAmount || !editCategory || !editDate || (editPaymentMethod === 'Mixed' && Math.abs((parseFloat(editCashAmount) || 0) + (parseFloat(editUpiAmount) || 0) - (parseFloat(convertBengaliToEnglishNumerals(editAmount)) || 0)) >= 0.01)} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600">
            {isSavingEdit && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
