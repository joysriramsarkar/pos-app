'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ChartRow, ViewMode } from './types';

interface SalesTableProps {
  loading: boolean;
  viewMode: ViewMode;
  processedChartData: ChartRow[];
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function SalesTable({
  loading,
  viewMode,
  processedChartData,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  t,
}: SalesTableProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t('tab_sales')} {t('revenue_profit_margin')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{viewMode === 'daily' ? t('time') || 'Hour' : t('date') || 'Date'}</TableHead>
              <TableHead className="text-right text-xs">{t('invoices') || 'Invoices'}</TableHead>
              <TableHead className="text-right text-xs">{t('revenue')}</TableHead>
              <TableHead className="text-right text-xs">{t('profit')}</TableHead>
              <TableHead className="text-right text-xs">{t('margin_col')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
              </TableRow>
            ) : processedChartData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
              </TableRow>
            ) : (
              processedChartData.map((row) => {
                const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                return (
                  <TableRow key={row.date} className="hover:bg-muted/30">
                    <TableCell className="text-xs font-medium">{formatStringNumbers(row.date)}</TableCell>
                    <TableCell className="text-right text-xs">{formatNumber(row.count)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatPrice(row.revenue)}</TableCell>
                    <TableCell className="text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(row.profit)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(Number(margin.toFixed(1)))}%</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
