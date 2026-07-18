'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, Download, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { HorizontalRankChart } from '@/components/pos/report-charts';
import type { TopCustomer } from '../types';
import { downloadCSV } from '../utils';

export function CustomersTab({
  topCustomers,
  isLoading,
  error,
  dateFilter,
  customDateInputs,
  onNavigate,
  onSelectCustomer,
}: {
  topCustomers: TopCustomer[];
  isLoading: boolean;
  error: string | null;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
  onSelectCustomer: (c: TopCustomer) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatStringNumbers } = useNumberFormat();

  const customerChartData = useMemo(
    () =>
      topCustomers.slice(0, 8).map((c) => ({
        name: c.name,
        spent: c.totalSpent,
        profit: Number(c.profit ?? 0),
      })),
    [topCustomers],
  );

  return (
    <>
      {customDateInputs && <div className="mb-3">{customDateInputs}</div>}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>{t('top_customers')}</CardTitle>
            <CardDescription>{t('highest_spending')}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {dateFilter}
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                onClick={() => onNavigate('customers-report')}
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => downloadCSV(
                [['#', 'Customer', 'Phone', 'Spent', 'Profit', 'Margin %', 'Orders', 'AOV'], ...topCustomers.map((c, i) => [
                  i + 1, c.name, c.phone || '', c.totalSpent.toFixed(2),
                  Number(c.profit ?? 0).toFixed(2), Number(c.margin ?? 0).toFixed(1),
                  c.orderCount, c.aov.toFixed(2),
                ])],
                'top-customers',
              )}
            >
              <Download className="w-4 h-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isLoading && customerChartData.length > 0 && (
            <HorizontalRankChart
              title={t('customers_chart_title')}
              description={t('customers_chart_desc')}
              data={customerChartData}
              valueKey="spent"
              secondValueKey="profit"
              valueLabel={t('spent')}
              secondLabel={t('profit')}
              color="var(--chart-1)"
              secondColor="var(--chart-2)"
              emptyLabel={t('no_customer_data')}
            />
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('customer')}</TableHead>
                  <TableHead className="text-right">{t('spent')}</TableHead>
                  <TableHead className="text-right">{t('profit')}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t('margin_col')}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t('orders')}</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">{t('loading_customers')}</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-destructive">{error}</TableCell></TableRow>
                ) : topCustomers.length > 0 ? topCustomers.map((c, i: number) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectCustomer(c)}>
                    <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <p className="text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone || 'N/A'}</p>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(c.totalSpent)}</TableCell>
                    <TableCell className={`text-right font-medium ${(c.profit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatPrice(c.profit ?? 0)}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-muted-foreground text-sm tabular-nums">
                      {formatStringNumbers(String(c.margin ?? 0))}%
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell"><Badge variant="outline">{c.orderCount}</Badge></TableCell>
                    <TableCell className="text-right"><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      {t('no_customer_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
