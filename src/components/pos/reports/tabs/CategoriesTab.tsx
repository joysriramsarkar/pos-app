'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { SafeResponsiveContainer } from '@/components/ui/chart';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { VerticalBarChart } from '@/components/pos/report-charts';
import type { CategoryData } from '../types';
import { categorySliceColor, mergeSmallSlices } from '../utils';

export function CategoriesTab({
  categoryData,
  isLoading,
  error,
  dateFilter,
  customDateInputs,
  onNavigate,
}: {
  categoryData: CategoryData[];
  isLoading: boolean;
  error: string | null;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber } = useNumberFormat();

  const categoryBarData = useMemo(
    () =>
      categoryData.slice(0, 10).map((c) => ({
        name: c.name,
        revenue: Number(c.revenue),
        margin: Number(c.margin),
      })),
    [categoryData],
  );

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3 justify-between items-center w-full">
        <div className="flex flex-wrap gap-2">{dateFilter}</div>
        {onNavigate && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            onClick={() => onNavigate('categories-report')}
          >
            <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
          </Button>
        )}
      </div>
      {customDateInputs}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>{t('category_revenue')}</CardTitle>
            <CardDescription>{t('category_breakdown_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full min-h-64">
              {isLoading ? (
                <div className="w-full h-64 flex items-center justify-center"><p className="text-muted-foreground">{t('loading')}</p></div>
              ) : categoryData.length > 0 ? (
                <SafeResponsiveContainer height={256}>
                  <PieChart>
                    {(() => {
                      const d = mergeSmallSlices(categoryData.map((c) => ({ name: c.name, value: c.revenue })));
                      return (
                        <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                          {d.map((slice, i) => (
                            <Cell key={slice.name} fill={categorySliceColor(i)} />
                          ))}
                        </Pie>
                      );
                    })()}
                    <RechartsTooltip formatter={(v: number) => formatPrice(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </SafeResponsiveContainer>
              ) : (
                <div className="w-full h-64 flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-muted-foreground">{t('no_data')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <VerticalBarChart
          title={t('category_bar_title')}
          description={t('category_bar_desc')}
          data={categoryBarData.map((c) => ({ name: c.name, value: c.revenue }))}
          valueLabel={t('revenue')}
          emptyLabel={isLoading ? t('loading') : t('no_category_data')}
        />
        <Card className="rounded-xl md:col-span-2">
          <CardHeader>
            <CardTitle>{t('category_breakdown')}</CardTitle>
            <CardDescription>{t('revenue_profit_margin')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('category')}</TableHead>
                    <TableHead className="text-right">{t('revenue')}</TableHead>
                    <TableHead className="text-right">{t('margin_col')}</TableHead>
                    <TableHead className="text-right">{t('share')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">{t('loading')}</TableCell></TableRow>
                  ) : error ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{error}</TableCell></TableRow>
                  ) : categoryData.length > 0 ? categoryData.map((c, i) => (
                    <TableRow key={c.name}>
                      <TableCell className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: categorySliceColor(i) }} />
                        {c.name}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(Number(c.revenue))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(Number(c.margin))}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(Number(c.percentage))}%</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        {t('no_category_data')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
