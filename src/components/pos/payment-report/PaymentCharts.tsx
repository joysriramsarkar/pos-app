'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { COLORS, type TrendDatum } from './types';

const payPieConfig: ChartConfig = {
  value: { label: 'পেমেন্ট', color: 'var(--chart-1)' },
};
const payBarConfig: ChartConfig = {
  cash: { label: 'নগদ', color: 'var(--chart-2)' },
  upi: { label: 'UPI', color: 'var(--chart-1)' },
  prepaid: { label: 'Prepaid', color: 'var(--chart-3)' },
};

interface PaymentChartsProps {
  loading: boolean;
  pieData: { name: string; value: number }[];
  trendData: TrendDatum[];
  formatPrice: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  formatCompact: (n: number) => string;
  t: (key: string) => string;
}

export function PaymentCharts({
  loading,
  pieData,
  trendData,
  formatPrice,
  formatStringNumbers,
  formatCompact,
  t,
}: PaymentChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="rounded-2xl shadow-sm col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('payment_breakdown')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 w-full flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('loading')}</p></div>
          ) : pieData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">{t('no_data')}</p>
          ) : (
            <ChartContainer config={payPieConfig} className="h-[192px] w-full">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm col-span-1 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('payment_method_trends')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 w-full flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('loading')}</p></div>
          ) : trendData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">{t('no_data')}</p>
          ) : (
            <ChartContainer config={payBarConfig} className="h-[192px] w-full">
              <BarChart data={trendData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={formatStringNumbers} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="cash" name="cash" fill="var(--color-cash)" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={20} />
                <Bar dataKey="upi" name="upi" fill="var(--color-upi)" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={20} />
                <Bar dataKey="prepaid" name="prepaid" fill="var(--color-prepaid)" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
