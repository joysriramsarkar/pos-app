'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tag } from 'lucide-react';
import { CATEGORY_COLORS, CHART_COLORS, type ViewMode } from './types';

const expenseChartConfig: ChartConfig = {
  amount: { label: 'খরচ', color: 'var(--chart-5)' },
};

interface ExpensesChartsProps {
  viewMode: ViewMode;
  chartData: any[];
  chartKey: string;
  chartColor: string;
  pieData: { name: string; value: number }[];
  categoryTotals: [string, number][];
  total: number;
  formatPrice: (n: number) => string;
  formatStringNumbers: (v: string | number) => string;
  formatCompact: (n: number) => string;
  t: (key: string, values?: any) => string;
}

export function ExpensesCharts({
  viewMode,
  chartData,
  chartKey,
  chartColor,
  pieData,
  categoryTotals,
  total,
  formatPrice,
  formatStringNumbers,
  formatCompact,
  t,
}: ExpensesChartsProps) {
  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {viewMode === 'daily' ? `${t('daily')} ${t('title')}` : viewMode === 'weekly' ? `${t('weekly')} ${t('title')}` : `${t('monthly')} ${t('title')}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">{t('no_data')}</p>
          ) : (
            <ChartContainer config={expenseChartConfig} className="h-[220px] w-full">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey={chartKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v) => {
                  if (viewMode === 'daily') {
                    return formatStringNumbers(v);
                  }
                  if (viewMode === 'weekly') {
                    return v;
                  }
                  if (viewMode === 'monthly') {
                    return v;
                  }
                  return formatStringNumbers(v);
                }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(v, _, props) => (
                        <div className="flex items-center justify-between gap-4 min-w-[140px]">
                          <span className="text-muted-foreground text-xs">{viewMode === 'daily' ? (props.payload?.label || t('title')) : t('title')}</span>
                          <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="amount" name="amount" fill={chartColor} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> {t('category_pie_chart')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">{t('no_data')}</p>
            ) : (
              <ChartContainer config={expenseChartConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${t(`categories_map.${name}`)} ${formatStringNumbers((percent * 100).toFixed(0))}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> {t('category_breakdown')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTotals.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">{t('no_data')}</TableCell></TableRow>
                ) : categoryTotals.map(([cat, amt]) => (
                  <TableRow key={cat}>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other}`}>{t(`categories_map.${cat}`)}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{formatPrice(amt)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{total > 0 ? formatStringNumbers(((amt / total) * 100).toFixed(1)) : formatStringNumbers(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
