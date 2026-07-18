'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { HorizontalRankChart } from '@/components/pos/report-charts';
import type { StockItem } from '../types';

export function StockTab({
  stockData,
  isLoading,
  error,
  onNavigate,
}: {
  stockData: StockItem[];
  isLoading: boolean;
  error: string | null;
  onNavigate?: (page: string) => void;
}) {
  const t = useTranslations('Reports');
  const { formatNumber } = useNumberFormat();

  const stockChartData = useMemo(
    () =>
      stockData.slice(0, 8).map((s) => ({
        name: s.name,
        stock: Number(s.currentStock),
        min: Number(s.minStockLevel),
      })),
    [stockData],
  );

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle>{t('auto_restock')}</CardTitle>
          <CardDescription>{t('low_stock_desc')}</CardDescription>
        </div>
        <div className="flex gap-2">
          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              onClick={() => onNavigate('stock-report')}
            >
              <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const itemsText = stockData.map((i) => `${i.name} - Stock: ${i.currentStock}`).join('\n');
              const blob = new Blob([itemsText], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `restock-list-${format(new Date(), 'yyyy-MM-dd')}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            {t('download_list')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && stockChartData.length > 0 && (
          <HorizontalRankChart
            title={t('stock_levels_chart')}
            description={t('stock_levels_desc')}
            data={stockChartData}
            valueKey="stock"
            secondValueKey="min"
            valueLabel={t('stock')}
            secondLabel={t('min_level')}
            color="var(--chart-4)"
            secondColor="var(--chart-5)"
            formatValue={(n) => formatNumber(n)}
            emptyLabel={t('all_stocked')}
          />
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('product')}</TableHead>
                <TableHead className="text-right">{t('stock')}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">{t('min_level')}</TableHead>
                <TableHead className="text-right">{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">{t('loading_stock')}</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{error}</TableCell></TableRow>
              ) : stockData?.length > 0 ? stockData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <p className="text-sm">{item.name}</p>
                    {item.nameBn && <p className="text-xs text-muted-foreground">{item.nameBn}</p>}
                  </TableCell>
                  <TableCell className="text-right text-red-500 font-bold">{item.currentStock} {item.unit}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right">{item.minStockLevel} {item.unit}</TableCell>
                  <TableCell className="text-right">
                    {item.currentStock === 0
                      ? <Badge variant="destructive" className="text-xs">{t('out_of_stock')}</Badge>
                      : <Badge variant="destructive" className="text-xs bg-orange-500 hover:bg-orange-600">{t('low')}</Badge>
                    }
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    {t('all_stocked')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
