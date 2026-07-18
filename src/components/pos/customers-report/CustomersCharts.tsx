'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const customerChartConfig: ChartConfig = {
  spent: { label: 'Revenue', color: 'var(--chart-1)' },
  profit: { label: 'Profit', color: 'var(--chart-2)' },
};

interface CustomersChartsProps {
  chartData: { name: string; spent: number; profit: number }[];
  formatPrice: (n: number) => string;
  formatCompact: (n: number) => string;
  t: (key: string) => string;
}

export function CustomersCharts({
  chartData,
  formatPrice,
  formatCompact,
  t,
}: CustomersChartsProps) {
  if (chartData.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t('top_customers_comp')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={customerChartConfig} className="h-[220px] w-full">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border) / 0.5)" />
            <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={80} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
            <Bar dataKey="spent" name="spent" fill="var(--color-spent)" radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="profit" name="profit" fill="var(--color-profit)" radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
