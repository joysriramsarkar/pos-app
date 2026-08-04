'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, Download, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { HorizontalRankChart, VerticalBarChart } from '@/components/pos/report-charts';
import type { TopProduct } from '../types';
import { downloadCSV } from '../utils';

export function ProductsTab({
  topProducts,
  isLoading,
  error,
  dateFilter,
  customDateInputs,
  onNavigate,
  onSelectProduct,
}: {
  topProducts: TopProduct[];
  isLoading: boolean;
  error: string | null;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
  onSelectProduct: (p: TopProduct) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, formatStringNumbers } = useNumberFormat();

  const productChartData = useMemo(
    () =>
      topProducts.slice(0, 8).map((p) => ({
        name: p.name,
        revenue: p.revenue,
        profit: p.profit,
        quantity: p.quantity,
      })),
    [topProducts],
  );

  return (
    <>
      {customDateInputs && <div className="mb-3">{customDateInputs}</div>}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>{t('top_products')}</CardTitle>
            <CardDescription>{t('best_items')}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {dateFilter}
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                onClick={() => onNavigate('products-report')}
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => downloadCSV(
                [['#', 'Product', 'Qty Sold', 'Revenue', 'Profit', 'Margin %'], ...topProducts.map((p, i) => {
                  const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : '0';
                  return [i + 1, p.name, p.quantity, p.revenue.toFixed(2), p.profit.toFixed(2), margin];
                })],
                'top-products',
              )}
            >
              <Download className="w-4 h-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isLoading && productChartData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HorizontalRankChart
                title={t('products_revenue_chart')}
                description={t('products_chart_desc')}
                data={productChartData}
                valueKey="revenue"
                secondValueKey="profit"
                valueLabel={t('revenue')}
                secondLabel={t('profit')}
                color="var(--chart-1)"
                secondColor="var(--chart-2)"
                emptyLabel={t('no_product_data')}
              />
              <VerticalBarChart
                title={t('products_qty_chart')}
                description={t('products_qty_desc')}
                data={productChartData.map((p) => ({ name: p.name, value: p.quantity }))}
                formatValue={(n) => formatNumber(n)}
                color="var(--chart-3)"
                valueLabel={t('qty_sold')}
                emptyLabel={t('no_product_data')}
              />
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('product')}</TableHead>
                  <TableHead className="text-right">{t('qty_sold')}</TableHead>
                  <TableHead className="text-right">{t('revenue')}</TableHead>
                  <TableHead className="text-right">{t('profit')}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t('margin_col')}</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">{t('loading_products')}</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-destructive">{error}</TableCell></TableRow>
                ) : topProducts?.length > 0 ? topProducts.map((p, i) => {
                  const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100) : 0;
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectProduct(p)}>
                      <TableCell className="text-muted-foreground text-sm">{formatNumber(i + 1)}</TableCell>
                      <TableCell className="font-medium">
                        <p className="text-sm">{p.name}</p>
                        {p.nameBn && <p className="text-xs text-muted-foreground">{p.nameBn}</p>}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(p.quantity)} <span className="text-muted-foreground text-xs">{p.unit}</span></TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(p.revenue)}</TableCell>
                      <TableCell className={`text-right font-medium ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatPrice(p.profit)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs hidden sm:table-cell tabular-nums">
                        {formatStringNumbers(margin.toFixed(1))}%
                      </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      {t('no_product_data')}
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
