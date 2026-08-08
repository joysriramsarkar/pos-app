'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import {
  paymentMethodLabelBn,
  paymentMethodLabelEn,
} from '@/lib/report-filters';
import { HorizontalRankChart } from '@/components/pos/report-charts';
import type { SummaryData } from '../types';
import {
  buildPaymentChartConfig,
  paymentSliceColor,
  mergeSmallSlices,
} from '../utils';

export function PaymentTab({
  summaryData,
  isLoading,
  dateFilter,
  customDateInputs,
  onNavigate,
}: {
  summaryData: SummaryData | null;
  isLoading: boolean;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, isBn } = useNumberFormat();

  const paymentBreakdown = useMemo(() => {
    if (!summaryData?.paymentBreakdown) return [];
    return Object.entries(summaryData.paymentBreakdown)
      .filter(([, value]) => Number(value) > 0)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }, [summaryData]);

  const paymentChartConfig = useMemo(
    () => buildPaymentChartConfig(paymentBreakdown.map((p) => p.name), isBn, t),
    [paymentBreakdown, isBn, t],
  );

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3 justify-between items-center w-full">
        <div className="flex flex-wrap gap-2">{dateFilter}</div>
        {onNavigate && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 min-h-9 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            onClick={() => onNavigate('payment-report')}
          >
            <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
          </Button>
        )}
      </div>
      {customDateInputs}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>{t('payment_breakdown')}</CardTitle>
            <CardDescription>{t('revenue_by_payment')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full h-64">
              {paymentBreakdown.length > 0 ? (
                <ChartContainer config={paymentChartConfig} className="w-full h-full aspect-auto">
                  <PieChart>
                    {(() => {
                      const d = mergeSmallSlices(paymentBreakdown).map((slice) => ({
                        ...slice,
                        displayName: isBn
                          ? paymentMethodLabelBn(slice.name)
                          : paymentMethodLabelEn(slice.name),
                      }));
                      return (
                        <Pie
                          data={d}
                          dataKey="value"
                          nameKey="displayName"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={80}
                          strokeWidth={2}
                          paddingAngle={2}
                        >
                          {d.map((slice, i) => (
                            <Cell
                              key={slice.name}
                              fill={paymentSliceColor(slice.name, i)}
                            />
                          ))}
                        </Pie>
                      );
                    })()}
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <div className="flex items-center justify-between gap-3 min-w-[120px]">
                              <span className="text-muted-foreground text-xs">{String(name)}</span>
                              <span className="font-bold tabular-nums">{formatPrice(Number(value))}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-muted-foreground">{isLoading ? t('loading') : t('no_data')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <HorizontalRankChart
          title={t('payment_bar_title')}
          description={t('payment_bar_desc')}
          data={paymentBreakdown.map((p) => ({
            name: isBn ? paymentMethodLabelBn(p.name) : paymentMethodLabelEn(p.name),
            value: p.value,
          }))}
          valueKey="value"
          valueLabel={t('amount')}
          color="var(--chart-1)"
          emptyLabel={isLoading ? t('loading') : t('no_payment_data')}
        />
        <Card className="rounded-xl md:col-span-2">
          <CardHeader>
            <CardTitle>{t('payment_summary')}</CardTitle>
            <CardDescription>{t('totals_per_method')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('method')}</TableHead>
                  <TableHead className="text-right">{t('amount')}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentBreakdown.length > 0 ? paymentBreakdown.map((p, i) => {
                  const total = paymentBreakdown.reduce((s, x) => s + (x.value as number), 0);
                  return (
                    <TableRow key={p.name}>
                      <TableCell className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block shrink-0"
                          style={{ background: paymentSliceColor(p.name, i) }}
                        />
                        {isBn ? paymentMethodLabelBn(p.name) : paymentMethodLabelEn(p.name)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatPrice(p.value as number)}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{total > 0 ? formatNumber(Number(((p.value as number / total) * 100).toFixed(1))) : 0}%</TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                      {isLoading ? t('loading') : t('no_payment_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
