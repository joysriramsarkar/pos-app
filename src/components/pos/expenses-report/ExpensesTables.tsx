'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown, Truck } from 'lucide-react';
import { CATEGORY_COLORS, type ViewMode } from './types';

interface ExpensesTablesProps {
  viewMode: ViewMode;
  filtered: any[];
  chartData: any[];
  chartKey: string;
  tableColor: string;
  singleDate: string;
  supplierTotals: { name: string; total: number }[];
  formatPrice: (n: number) => string;
  formatDate: (d: Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string, values?: any) => string;
}

export function ExpensesTables({
  viewMode,
  filtered,
  chartData,
  chartKey,
  tableColor,
  singleDate,
  supplierTotals,
  formatPrice,
  formatDate,
  formatStringNumbers,
  t,
}: ExpensesTablesProps) {
  return (
    <>
      {viewMode === 'daily' && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" /> {formatDate(new Date(singleDate), { day: '2-digit', month: 'short', year: 'numeric' })} — {t('entry_list')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('description')}</TableHead>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead className="text-right">{t('amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">{t('no_data')}</TableCell></TableRow>
                ) : filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">
                      {e.supplierName && (
                        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-medium mb-0.5">
                          <Truck className="w-3 h-3" />{e.supplierName}
                        </span>
                      )}
                      {e.notes || '—'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.Other}`}>{t(`categories_map.${e.category}`)}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm text-red-600">{formatPrice(Number(e.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {viewMode !== 'daily' && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              {viewMode === 'weekly' ? t('weekly_list') : t('monthly_list')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{viewMode === 'weekly' ? t('week') : t('month')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground text-sm">{t('no_data')}</TableCell></TableRow>
                ) : (chartData as any[]).map((g: any) => (
                  <TableRow key={g[chartKey]}>
                    <TableCell className="text-sm">{formatStringNumbers(g[chartKey])}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${tableColor}`}>{formatPrice(g.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {supplierTotals.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> {t('supplier_expenses')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('supplier_label')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierTotals.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="text-sm flex items-center gap-1.5 font-medium">
                      <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />{s.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatPrice(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
