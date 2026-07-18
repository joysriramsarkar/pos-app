'use client';

import React, { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, Cell,
} from 'recharts';
import { SafeResponsiveContainer } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { ProductDetail, TopProduct } from './types';

export function ProductDetailContent({
  product,
  dateParams,
  detail,
  setDetail,
  isLoading,
  setIsLoading,
}: {
  product: TopProduct | null;
  dateParams: string;
  detail: ProductDetail | null;
  setDetail: (d: ProductDetail) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}) {
  useEffect(() => {
    if (!product) return;
    setIsLoading(true);
    fetch(`/api/reports/products/${product.id}?${dateParams}`)
      .then((r) => r.json())
      .then(setDetail)
      .finally(() => setIsLoading(false));
  }, [product?.id, dateParams, setIsLoading, setDetail]);

  const t = useTranslations('Reports');
  const { formatPrice, formatCompact, formatStringNumbers } = useNumberFormat();
  if (isLoading) return <div className="py-16 text-center text-muted-foreground">{t('loading')}</div>;
  if (!detail || !detail.summary || !detail.product) return null;

  const {
    summary,
    product: p,
    dailyTrend = [],
    hourlyPattern = [],
    weeklyPattern = [],
    topCustomers = [],
  } = detail;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('total_sold'), value: `${formatStringNumbers(summary.totalQty)} ${p.unit}`, color: 'text-blue-600' },
          { label: t('revenue'), value: formatPrice(summary.totalRevenue), color: 'text-primary' },
          { label: t('profit'), value: formatPrice(summary.totalProfit), color: summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500' },
          { label: t('margin_label'), value: `${formatStringNumbers(summary.profitMargin)}%`, color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('peak_hour'), value: formatStringNumbers(summary.peakHour) },
          { label: t('peak_day'), value: summary.peakDay },
          { label: t('avg_qty'), value: formatStringNumbers(summary.avgOrderQty.toFixed(1)) },
          {
            label: t('current_stock'),
            value: `${formatStringNumbers(p.currentStock)} ${p.unit}`,
            color: p.currentStock <= p.minStockLevel ? 'text-red-500' : 'text-emerald-600',
          },
        ].map((s) => (
          <div key={s.label} className="border rounded-xl p-3 text-center">
            <p className={`text-base font-semibold ${(s as { color?: string }).color ?? ''}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {dailyTrend?.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">{t('daily_trend')}</p>
          <SafeResponsiveContainer height={176}>
            <BarChart data={dailyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return formatStringNumbers(`${d.getDate()}/${d.getMonth() + 1}`);
                }}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
              <RechartsTooltip
                formatter={(v: number, n: string) => [
                  n === 'revenue' ? formatPrice(v) : formatStringNumbers(String(v)),
                  n === 'revenue' ? t('chart_revenue') : t('qty_sold'),
                ]}
                labelFormatter={(l) => new Date(l).toLocaleDateString()}
                contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="revenue" name={t('chart_revenue')} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="qty" name={t('qty_sold')} fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-semibold mb-2">{t('weekly_pattern')}</p>
          <SafeResponsiveContainer height={144}>
            <BarChart data={weeklyPattern} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatStringNumbers} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} tickFormatter={formatStringNumbers} />
              <RechartsTooltip formatter={(v: number) => [v, t('qty')]} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="qty" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={24}>
                {weeklyPattern.map((entry, i: number) => (
                  <Cell
                    key={i}
                    fill={entry.qty === Math.max(...weeklyPattern.map((w) => w.qty)) ? '#7c3aed' : '#8b5cf6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </SafeResponsiveContainer>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">{t('hourly_pattern')}</p>
          <SafeResponsiveContainer height={144}>
            <BarChart data={hourlyPattern} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={3} tickFormatter={formatStringNumbers} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} tickFormatter={formatStringNumbers} />
              <RechartsTooltip formatter={(v: number) => [v, t('qty')]} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="qty" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={16}>
                {hourlyPattern.map((entry, i: number) => (
                  <Cell
                    key={i}
                    fill={entry.qty === Math.max(...hourlyPattern.map((h) => h.qty)) ? '#d97706' : '#f59e0b'}
                  />
                ))}
              </Bar>
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      </div>

      {topCustomers?.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">{t('top_customers_product')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t('customer')}</TableHead>
                <TableHead className="text-right">{t('qty_bought')}</TableHead>
                <TableHead className="text-right">{t('revenue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.map((c, i: number) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.qty} <span className="text-xs text-muted-foreground">{p.unit}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPrice(c.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {topCustomers?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{t('walk_in_only')}</p>
      )}
    </div>
  );
}
