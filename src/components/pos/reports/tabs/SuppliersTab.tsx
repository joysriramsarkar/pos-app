'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { HorizontalRankChart } from '@/components/pos/report-charts';
import { downloadCSV } from '../utils';

export function SuppliersTab({
  purchasesData,
  isLoading,
  error,
  dateFilter,
  customDateInputs,
  onNavigate,
}: {
  purchasesData: any;
  isLoading: boolean;
  error: string | null;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber } = useNumberFormat();

  const supplierChartData = useMemo(
    () =>
      (purchasesData?.topSuppliers || []).slice(0, 8).map((s: { name: string; totalAmount: number; orderCount: number }) => ({
        name: s.name,
        spent: Number(s.totalAmount),
        orders: Number(s.orderCount),
      })),
    [purchasesData],
  );

  return (
    <>
      {customDateInputs && <div className="mb-3">{customDateInputs}</div>}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>{t('supplier_purchases')}</CardTitle>
            <CardDescription>{t('supplier_report_desc')}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {dateFilter}
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                onClick={() => onNavigate('supplier-report')}
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => downloadCSV(
                [['#', 'Supplier Name', 'Orders', 'Spent Amount'], ...(purchasesData?.topSuppliers || []).map((s: any, i: number) => [i + 1, s.name, s.orderCount, s.totalAmount.toFixed(2)])],
                'suppliers-summary',
              )}
            >
              <Download className="w-4 h-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isLoading && supplierChartData.length > 0 && (
            <HorizontalRankChart
              title={t('suppliers_chart_title')}
              description={t('suppliers_chart_desc')}
              data={supplierChartData}
              valueKey="spent"
              valueLabel={t('spent_amount_col')}
              color="var(--chart-5)"
              emptyLabel={t('no_data')}
            />
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('rank_col')}</TableHead>
                  <TableHead>{t('supplier_name_col')}</TableHead>
                  <TableHead className="text-right">{t('orders_placed_col')}</TableHead>
                  <TableHead className="text-right">{t('spent_amount_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">{t('loading')}</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{error}</TableCell></TableRow>
                ) : (purchasesData?.topSuppliers || []).length > 0 ? (purchasesData.topSuppliers.map((s: any, i: number) => (
                  <TableRow key={s.id || i}>
                    <TableCell className="text-muted-foreground text-sm">{formatNumber(i + 1)}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right"><Badge variant="outline">{s.orderCount}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(s.totalAmount)}</TableCell>
                  </TableRow>
                ))) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      {t('no_data')}
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
