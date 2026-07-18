'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SafeResponsiveContainer } from '@/components/ui/chart';
import { Download, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { EXPENSE_CHART_COLORS, parseDateSafe } from './utils';

export function ExpensesTabContent({
  expenses,
  dateParams,
  onNavigate,
  isLoading,
}: {
  expenses: any[];
  dateParams: string;
  onNavigate?: (page: string) => void;
  isLoading?: boolean;
}) {
  const { formatPrice: fp, formatCompact, formatStringNumbers } = useNumberFormat();

  const filtered = useMemo(() => {
    const p = new URLSearchParams(dateParams);
    const from = p.get('from') ? new Date(p.get('from')!) : null;
    const to = p.get('to') ? new Date(p.get('to')!) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return expenses.filter((e) => {
      const d = parseDateSafe(e.date);
      return (!from || d >= from) && (!to || d <= to);
    });
  }, [expenses, dateParams]);

  const total = filtered.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      map[e.category] = (map[e.category] ?? 0) + Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const pieData = categoryTotals.map(([name, value]) => ({ name, value }));

  const daysDiff = useMemo(() => {
    const p = new URLSearchParams(dateParams);
    const from = p.get('from') ? new Date(p.get('from')!) : null;
    const to = p.get('to') ? new Date(p.get('to')!) : new Date();
    if (!from) return 30;
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [dateParams]);

  const trendData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      const k =
        daysDiff <= 1
          ? format(parseDateSafe(e.date), 'HH:00')
          : daysDiff <= 60
            ? format(parseDateSafe(e.date), 'dd MMM')
            : format(parseDateSafe(e.date), 'MMM yy');
      map[k] = (map[k] ?? 0) + Number(e.amount ?? 0);
    });
    return Object.entries(map).map(([label, amount]) => ({ label, amount }));
  }, [filtered, daysDiff]);

  const t = useTranslations('Expenses');
  const trendTitle = daysDiff <= 1 ? t('hourly') : daysDiff <= 60 ? t('daily') : t('monthly');

  const handleDownloadCSV = () => {
    if (!filtered.length) return;
    const rows = [
      ['Date', 'Category', 'Supplier', 'Notes', 'Amount'],
      ...filtered.map((e) => [
        format(parseDateSafe(e.date), 'dd/MM/yyyy'),
        e.category,
        e.supplierName || '',
        e.notes || '',
        Number(e.amount) || 0,
      ]),
      ['', '', '', 'Total', total],
    ];
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">{t('loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {t('total_filtered_expense')}: <span className="font-bold text-red-600">{fp(total)}</span> ({filtered.length})
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleDownloadCSV}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          {onNavigate && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => onNavigate('expenses-report')}
            >
              <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{trendTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">{t('no_data')}</p>
            ) : (
              <SafeResponsiveContainer height={200}>
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatStringNumbers} />
                  <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <RechartsTooltip formatter={(v: number) => [fp(v), t('expense')]} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </SafeResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('by_category')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">{t('no_data')}</p>
            ) : (
              <SafeResponsiveContainer height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={EXPENSE_CHART_COLORS[i % EXPENSE_CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => fp(v)} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </SafeResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('category_breakdown')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('category')}</TableHead>
                <TableHead className="text-right">{t('count')}</TableHead>
                <TableHead className="text-right">{t('total')}</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryTotals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                    {t('no_data')}
                  </TableCell>
                </TableRow>
              ) : (
                categoryTotals.map(([cat, amt]) => (
                  <TableRow key={cat}>
                    <TableCell className="text-sm">{cat}</TableCell>
                    <TableCell className="text-right text-sm">
                      {filtered.filter((e) => e.category === cat).length}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{fp(amt)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {total > 0
                        ? formatStringNumbers(((amt / total) * 100).toFixed(1))
                        : formatStringNumbers(0)}
                      %
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
