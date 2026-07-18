'use client';

import React, { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { SafeResponsiveContainer } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { CustomerDetail, TopCustomer } from './types';

export function CustomerDetailContent({
  customer,
  dateParams,
  detail,
  setDetail,
  isLoading,
  setIsLoading,
}: {
  customer: TopCustomer | null;
  dateParams: string;
  detail: CustomerDetail | null;
  setDetail: (d: CustomerDetail) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}) {
  useEffect(() => {
    if (!customer) return;
    setIsLoading(true);
    fetch(`/api/reports/customers?customerId=${customer.id}&${dateParams}`)
      .then((r) => r.json())
      .then(setDetail)
      .finally(() => setIsLoading(false));
  }, [customer?.id, dateParams, setIsLoading, setDetail]);

  const t = useTranslations('Reports');
  const { formatPrice, formatCompact, formatStringNumbers } = useNumberFormat();
  if (isLoading) return <div className="py-10 text-center text-muted-foreground">{t('loading')}</div>;
  if (!detail) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('total_spent'), value: formatPrice(detail.totalSpent), color: 'text-primary' },
          {
            label: t('profit'),
            value: formatPrice(detail.totalProfit ?? 0),
            color: (detail.totalProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500',
          },
          {
            label: t('margin_label'),
            value: `${formatStringNumbers(String(detail.profitMargin ?? 0))}%`,
            color: '',
          },
          { label: t('orders'), value: formatStringNumbers(detail.orderCount), color: '' },
        ].map((s) => (
          <div key={s.label} className="bg-muted rounded-lg p-3 text-center">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {detail.monthlyTrend?.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">{t('monthly_spending')}</p>
          <SafeResponsiveContainer height={160}>
            <BarChart data={detail.monthlyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatStringNumbers} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
              <RechartsTooltip formatter={(v: number) => formatPrice(v)} contentStyle={{ borderRadius: '8px' }} />
              <Bar dataKey="spent" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      )}

      {detail.topProducts?.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">{t('top_products_label')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('product')}</TableHead>
                <TableHead className="text-right">{t('qty')}</TableHead>
                <TableHead className="text-right">{t('revenue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.topProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.name}</TableCell>
                  <TableCell className="text-right text-sm">{formatStringNumbers(p.qty)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatPrice(p.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
