'use client';

import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import { chartConfig } from './types';

interface SalesTrendChartProps {
  chartData: { date: string; sales: number; expenses: number }[];
  todaySales?: number;
}

export function SalesTrendChart({ chartData, todaySales }: SalesTrendChartProps) {
  const t = useTranslations('Dashboard');
  const { formatPrice, formatNumber, formatStringNumbers } = useNumberFormat();

  const translatedChartConfig = {
    sales: {
      label: t('sales_chart'),
      color: 'var(--chart-1)',
    },
    expenses: {
      label: t('expenses_chart'),
      color: 'var(--chart-3)',
    },
  };

  return (
    <Card className="shadow-md animate-stagger-in bg-gradient-to-b from-background to-muted/10 dark:from-background dark:to-muted/5 overflow-hidden" style={{ animationDelay: '0.25s' }}>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">{t('sales_trend')}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t('last_7_days')}</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 hidden sm:inline-flex">
            {t('last_7_days')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 && chartData.some(d => d.sales > 0 || d.expenses > 0) ? (
          <ChartContainer config={translatedChartConfig} className="h-[220px] sm:h-[280px] w-full aspect-auto">
            <BarChart data={chartData} margin={{ top: 10, right: 4, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.7} />
                </linearGradient>
                <filter id="barShadow" x="-10%" y="-5%" width="120%" height="115%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="var(--chart-1)" floodOpacity={0.2} />
                </filter>
              </defs>
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="hsl(var(--border) / 0.5)"
              />
              {chartData.length > 0 && todaySales && todaySales > 0 && (
                <ReferenceLine
                  y={Math.round(chartData.reduce((sum, d) => sum + d.sales, 0) / chartData.length)}
                  stroke="var(--chart-1)"
                  strokeOpacity={0.4}
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: t('average'),
                    position: 'right',
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 10,
                  }}
                />
              )}
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatStringNumbers}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => {
                  if (value >= 1000) return formatNumber(value / 1000) + 'k';
                  return formatNumber(value);
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label = name === 'sales' ? t('sales_chart') : t('expenses_chart');
                      return (
                        <div className="flex items-center justify-between gap-4 min-w-[140px]">
                          <span className="text-muted-foreground text-xs">{label}</span>
                          <span className="font-bold text-foreground tabular-nums">
                            {formatPrice(Number(value))}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <ChartLegend
                content={<ChartLegendContent />}
              />
              <Bar
                dataKey="sales"
                fill="url(#salesGradient)"
                radius={[8, 8, 2, 2]}
                maxBarSize={44}
                filter="url(#barShadow)"
              />
              <Bar
                dataKey="expenses"
                fill="url(#expensesGradient)"
                radius={[8, 8, 2, 2]}
                maxBarSize={44}
                filter="url(#barShadow)"
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('no_sales_trend')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
