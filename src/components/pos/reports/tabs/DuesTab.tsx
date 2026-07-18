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
import type { DueCustomer } from '../types';
import { downloadCSV } from '../utils';

export function DuesTab({
  dueData,
  outstandingDues,
  isLoading,
  error,
  onNavigate,
}: {
  dueData: DueCustomer[];
  outstandingDues: string;
  isLoading: boolean;
  error: string | null;
  onNavigate?: (page: string) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice } = useNumberFormat();

  const duesChartData = useMemo(
    () =>
      [...dueData]
        .sort((a, b) => Number(b.totalDue) - Number(a.totalDue))
        .slice(0, 8)
        .map((c) => ({ name: c.name, due: Number(c.totalDue) })),
    [dueData],
  );

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle>{t('outstanding_dues')}</CardTitle>
          <CardDescription>{t('pending_payments')} {formatPrice(Number(outstandingDues))}</CardDescription>
        </div>
        <div className="flex gap-2">
          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
              onClick={() => onNavigate('dues-report')}
            >
              <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => downloadCSV(
              [['Customer', 'Phone', 'Total Due', 'Last Purchase'], ...dueData.map((c) => [c.name, c.phone || '', Number(c.totalDue).toFixed(2), new Date(c.updatedAt).toLocaleDateString()])],
              'dues',
            )}
          >
            <Download className="w-4 h-4" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && duesChartData.length > 0 && (
          <HorizontalRankChart
            title={t('dues_chart_title')}
            description={t('dues_chart_desc')}
            data={duesChartData}
            valueKey="due"
            valueLabel={t('total_due')}
            color="var(--chart-4)"
            emptyLabel={t('no_dues')}
          />
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('customer')}</TableHead>
                <TableHead className="text-right">{t('total_due')}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">{t('last_purchase')}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">{t('orders')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">{t('loading_dues')}</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{error}</TableCell></TableRow>
              ) : dueData?.length > 0 ? dueData.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <p className="text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone || 'N/A'}</p>
                  </TableCell>
                  <TableCell className="text-right text-amber-600 font-bold">{formatPrice(Number(c.totalDue))}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right text-muted-foreground text-xs">{new Date(c.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right">
                    <Badge variant="outline">{c._count?.sales || 0}</Badge>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    {t('no_dues')}
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
