'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Plus, Truck, UserPlus, Check, ChevronsUpDown,
} from 'lucide-react';
import { convertBengaliToEnglishNumerals, cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { CATEGORIES, type Supplier } from './types';

export interface ExpenseFormProps {
  currency: string;
  amount: string;
  setAmount: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  paymentMethod: string;
  setPaymentMethod: (v: string) => void;
  cashAmount: string;
  setCashAmount: (v: string) => void;
  upiAmount: string;
  setUpiAmount: (v: string) => void;
  supplierId: string;
  setSupplierId: (v: string) => void;
  supplierOpen: boolean;
  setSupplierOpen: (v: boolean) => void;
  suppliers: Supplier[];
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  isLoading: boolean;
  onAddExpense: () => void;
  onShowAddSupplier: () => void;
  getCategoryBn: (cat: string) => string;
  formatPrice: (n: number) => string;
  formatStringNumbers: (n: string | number) => string;
}

export function ExpenseForm({
  currency,
  amount,
  setAmount,
  category,
  setCategory,
  notes,
  setNotes,
  paymentMethod,
  setPaymentMethod,
  cashAmount,
  setCashAmount,
  upiAmount,
  setUpiAmount,
  supplierId,
  setSupplierId,
  supplierOpen,
  setSupplierOpen,
  suppliers,
  supplierSearch,
  setSupplierSearch,
  isLoading,
  onAddExpense,
  onShowAddSupplier,
  getCategoryBn,
  formatPrice,
  formatStringNumbers,
}: ExpenseFormProps) {
  const t = useTranslations('Expenses');

  return (
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
              onKeyDown={(e) => e.key === 'Enter' && onAddExpense()}
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
                onClick={onShowAddSupplier}>
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
              <SelectItem value="Cash">নগদ</SelectItem>
              <SelectItem value="UPI">ইউপিআই</SelectItem>
              <SelectItem value="Mixed">মিশ্র</SelectItem>
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
                      const cashV = parseFloat(val) || 0;
                      if (cashV <= totalAmt) {
                        setUpiAmount((totalAmt - cashV).toFixed(2).replace(/\.00$/, ''));
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
                      const upiV = parseFloat(val) || 0;
                      if (upiV <= totalAmt) {
                        setCashAmount((totalAmt - upiV).toFixed(2).replace(/\.00$/, ''));
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
        <Button className="w-full h-9 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600" onClick={onAddExpense} disabled={isLoading || !amount}>
          <Plus className="w-4 h-4 mr-2" /> {t('add')}
        </Button>
      </CardContent>
    </Card>
  );
}
