'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GitCompare } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ChartRow, ChartStyle, ViewMode } from './types';
import { ChartSkeleton } from './ChartSkeleton';

export const salesChartConfig = {
  revenue: { label: 'রাজস্ব', color: 'var(--chart-1)' },
  profit: { label: 'মুনাফা', color: 'var(--chart-2)' },
  prevRevenue: { label: 'পূর্ববর্তী পিরিয়ড', color: 'var(--chart-4)' },
} satisfies ChartConfig;

interface SalesChartsProps {
  loading: boolean;
  chartDataWithComparison: ChartRow[];
  processedChartData: ChartRow[];
  viewMode: ViewMode;
  chartStyle: ChartStyle;
  onChartStyleChange: (s: ChartStyle) => void;
  showComparison: boolean;
  onToggleComparison: () => void;
  avgRevenue: number;
  formatPrice: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  formatCompact: (n: number) => string;
  t: (key: string) => string;
}

export function SalesCharts({
  loading,
  chartDataWithComparison,
  processedChartData,
  viewMode,
  chartStyle,
  onChartStyleChange,
  showComparison,
  onToggleComparison,
  avgRevenue,
  formatPrice,
  formatStringNumbers,
  formatCompact,
  t,
}: SalesChartsProps) {
  const renderChart = () => {
    const commonProps = {
      data: chartDataWithComparison,
      margin: { top: 10, right: 5, left: 0, bottom: 5 },
    };

    const commonAxes = (
      <>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatStringNumbers}
        />
        <YAxis
          tickFormatter={formatCompact}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          width={55}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex items-center justify-between gap-4 min-w-[160px]">
                  <span className="text-muted-foreground text-xs">
                    {name === 'revenue' ? t('total_revenue')
                      : name === 'profit' ? t('net_profit')
                      : t('prev_period') || 'Prev Period'}
                  </span>
                  <span className="font-bold text-foreground tabular-nums">
                    {formatPrice(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {avgRevenue > 0 && viewMode !== 'daily' && (
          <ReferenceLine
            y={Math.round(avgRevenue)}
            stroke="var(--chart-1)"
            strokeOpacity={0.4}
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: 'গড়',
              position: 'right',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
            }}
          />
        )}
      </>
    );

    if (chartStyle === 'bar') {
      return (
        <BarChart {...commonProps}>
          <defs>
            <linearGradient id="sr-revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="sr-profGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          {commonAxes}
          <Bar dataKey="revenue" name="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} maxBarSize={28} minPointSize={2} />
          <Bar dataKey="profit" name="profit" fill="var(--color-profit)" radius={[4, 4, 0, 0]} maxBarSize={28} minPointSize={2} />
          {showComparison && viewMode !== 'daily' && (
            <Bar dataKey="prevRevenue" name="prevRevenue" fill="var(--color-prevRevenue)" fillOpacity={0.4} radius={[4, 4, 0, 0]} maxBarSize={28} />
          )}
        </BarChart>
      );
    }

    if (chartStyle === 'line') {
      return (
        <LineChart {...commonProps}>
          {commonAxes}
          <Line type="monotone" dataKey="revenue" name="revenue" stroke="var(--color-revenue)" strokeWidth={2.5} dot={{ r: 2, fill: 'var(--color-revenue)' }} />
          <Line type="monotone" dataKey="profit" name="profit" stroke="var(--color-profit)" strokeWidth={2.5} dot={{ r: 2, fill: 'var(--color-profit)' }} />
          {showComparison && viewMode !== 'daily' && (
            <Line type="monotone" dataKey="prevRevenue" name="prevRevenue" stroke="var(--color-prevRevenue)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          )}
        </LineChart>
      );
    }

    return (
      <AreaChart {...commonProps}>
        <defs>
          <linearGradient id="sr-areaRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="sr-areaProf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {commonAxes}
        <Area type="monotone" dataKey="revenue" name="revenue" stroke="var(--color-revenue)" fill="url(#sr-areaRev)" strokeWidth={2.5} />
        <Area type="monotone" dataKey="profit" name="profit" stroke="var(--color-profit)" fill="url(#sr-areaProf)" strokeWidth={2.5} />
        {showComparison && viewMode !== 'daily' && (
          <Area type="monotone" dataKey="prevRevenue" name="prevRevenue" stroke="var(--color-prevRevenue)" fill="none" strokeWidth={1.5} strokeDasharray="5 3" />
        )}
      </AreaChart>
    );
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-semibold">{t('sales_trend')}</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {viewMode !== 'daily' && (
            <Button
              size="sm"
              variant={showComparison ? 'default' : 'outline'}
              className="h-7 text-[10px] px-2.5 rounded-md gap-1"
              onClick={onToggleComparison}
            >
              <GitCompare className="w-3 h-3" />
              {t('compare_prev') || 'Prev Period'}
            </Button>
          )}
          <div className="flex gap-1 bg-muted p-0.5 rounded-lg">
            {(['bar', 'line', 'area'] as ChartStyle[]).map((style) => (
              <Button
                key={style}
                size="sm"
                variant={chartStyle === style ? 'default' : 'ghost'}
                className="h-7 text-[10px] px-2.5 rounded-md"
                onClick={() => onChartStyleChange(style)}
              >
                {style.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton height={260} />
        ) : processedChartData.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">{t('no_sales_data')}</p>
        ) : (
          <ChartContainer config={salesChartConfig} className="h-[260px] w-full">
            {renderChart()}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
