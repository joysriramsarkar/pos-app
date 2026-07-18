'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { ChartStyle, ViewMode } from './types';

const supplierChartConfig: ChartConfig = {
  amount: { label: 'কেনাকাটা', color: 'var(--chart-1)' },
};

interface SupplierChartsProps {
  loading: boolean;
  processedChartData: any[];
  viewMode: ViewMode;
  chartStyle: ChartStyle;
  onChartStyleChange: (s: ChartStyle) => void;
  dateFrom: string;
  dateTo: string;
  isBn: boolean;
  formatPrice: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  formatCompact: (n: number) => string;
  t: (key: string) => string;
}

export function SupplierCharts({
  loading,
  processedChartData,
  viewMode,
  chartStyle,
  onChartStyleChange,
  dateFrom,
  dateTo,
  isBn,
  formatPrice,
  formatStringNumbers,
  formatCompact,
  t,
}: SupplierChartsProps) {
  const tickFormatter = (v: string) => {
    if (viewMode === 'daily') {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        const rangeDays = Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 3600 * 24));
        if (rangeDays <= 7) return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', { weekday: 'short' });
        if (rangeDays > 300) return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', { month: 'short', year: '2-digit' });
      }
    }
    return formatStringNumbers(v);
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-semibold">{t('stock_purchasing_trend')}</CardTitle>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 w-full flex items-center justify-center">
            <p className="text-muted-foreground text-xs">{t('loading')}</p>
          </div>
        ) : processedChartData.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">{t('no_sales_period') || 'No purchases recorded in this period.'}</p>
        ) : (
          <ChartContainer config={supplierChartConfig} className="h-[224px] w-full">
            {chartStyle === 'bar' ? (
              <BarChart data={processedChartData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                <Bar dataKey="amount" name="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} maxBarSize={25} />
              </BarChart>
            ) : chartStyle === 'line' ? (
              <LineChart data={processedChartData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                <Line type="monotone" dataKey="amount" name="amount" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2, fill: 'var(--chart-1)' }} />
              </LineChart>
            ) : (
              <AreaChart data={processedChartData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="supplierAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                <Area type="monotone" dataKey="amount" name="amount" stroke="var(--chart-1)" fillOpacity={1} fill="url(#supplierAreaGrad)" strokeWidth={2} />
              </AreaChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
