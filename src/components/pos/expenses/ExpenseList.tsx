'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Receipt, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { CATEGORY_CONFIG, type Expense } from './types';

export interface ExpenseListProps {
  expenses: Expense[];
  filteredTotal: number;
  dateFilterMode: 'today' | 'yesterday' | 'custom';
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  getCategoryBn: (cat: string) => string;
  formatPrice: (n: number) => string;
}

export function ExpenseList({
  expenses,
  filteredTotal,
  dateFilterMode,
  onEdit,
  onDelete,
  getCategoryBn,
  formatPrice,
}: ExpenseListProps) {
  const t = useTranslations('Expenses');
  const locale = useLocale();
  const getSupplierName = (exp: Expense) =>
    locale === 'en' && exp.supplierNameEn ? exp.supplierNameEn : exp.supplierName;

  return (
    <Card className="col-span-1 lg:col-span-2 rounded-2xl shadow-sm border border-border/50 flex flex-col h-fit lg:h-full lg:min-h-[350px]">
      <CardHeader className="py-2 px-3 md:pb-3 md:pt-4 md:px-4 shrink-0 border-b">
        <CardTitle className="text-sm md:text-base flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-500" /> {dateFilterMode !== 'today' ? t('expense_list') : t('today_expense_list')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 lg:flex-1 lg:overflow-y-auto">
        {/* Mobile card list */}
        <div className="md:hidden divide-y">
          {expenses.length > 0 ? expenses.map((exp: Expense) => {
            const config = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG['Other'];
            const Icon = config.icon;
            return (
              <div key={exp.id} className="flex items-start gap-3 p-3 active:bg-muted/40">
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{getCategoryBn(exp.category)}</p>
                      {exp.supplierName && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                          <Truck className="w-3 h-3 shrink-0" />{getSupplierName(exp)}
                        </p>
                      )}
                      {exp.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{exp.notes}</p>
                      )}
                      <Badge variant="secondary" className="text-[10px] h-5 mt-1.5 font-normal">
                        {exp.paymentMethod || 'Cash'}
                      </Badge>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-red-600 dark:text-red-400 tabular-nums">
                        {formatPrice(Number(exp.amount ?? 0))}
                      </p>
                      <div className="flex justify-end gap-0.5 mt-1">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(exp)}
                          className="h-9 w-9 text-muted-foreground hover:text-emerald-600 touch-manipulation">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(exp.id)}
                          className="h-9 w-9 text-muted-foreground hover:text-destructive touch-manipulation">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="text-center text-muted-foreground py-12 px-4">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{dateFilterMode !== 'today' ? t('no_expenses_date') : t('no_expenses_today')}</p>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
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
              {expenses.length > 0 ? expenses.map((exp: Expense) => {
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
                          <Truck className="w-3.5 h-3.5" />{getSupplierName(exp)}
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
                        <Button variant="ghost" size="icon" onClick={() => onEdit(exp)}
                          className="h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(exp.id)}
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
        </div>
      </CardContent>
      {expenses.length > 0 && (
        <div className="flex justify-between items-center px-3 py-px border-t bg-slate-50/50 dark:bg-slate-900/30 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">{t('total')}</span>
          <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPrice(filteredTotal)}</span>
        </div>
      )}
    </Card>
  );
}
