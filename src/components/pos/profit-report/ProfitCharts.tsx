'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import {
  DonutShareChart,
  HorizontalRankChart,
  MarginGauge,
} from '@/components/pos/report-charts';
import type { GroupBy, ProfitChartDatum, ProfitSummary } from './types';

interface ProfitChartsProps {
  loading: boolean;
  chartData: ProfitChartDatum[];
  filteredRows: any[];
  groupBy: GroupBy;
  summary: ProfitSummary | null;
  chartConfig: ChartConfig;
  formatStringNumbers: (v: string | number) => string;
  t: (key: string) => string;
}

export function ProfitCharts({
  loading,
  chartData,
  filteredRows,
  groupBy,
  summary,
  chartConfig,
  formatStringNumbers,
  t,
}: ProfitChartsProps) {
  if (loading || (chartData.length === 0 && !summary)) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 space-y-3">
        {chartData.length > 0 && (
          <HorizontalRankChart
            title={t('profit_chart_title')}
            description={t('profit_report_subtitle')}
            data={chartData.map((d) => ({
              name: d.name,
              profit: d.profit,
              revenue: d.revenue,
            }))}
            valueKey="profit"
            secondValueKey="revenue"
            valueLabel={t('profit')}
            secondLabel={t('revenue')}
            color="var(--chart-2)"
            secondColor="var(--chart-1)"
            emptyLabel={t('no_data')}
            height={280}
          />
        )}
        {chartData.length > 0 && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t('profit_margin_bars')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart
                  data={filteredRows.slice(0, 10).map((r) => ({
                    name:
                      groupBy === 'orders'
                        ? String(r.invoiceNumber || '').slice(-8)
                        : String(r.name || '').slice(0, 12),
                    margin: Number(r.margin || 0),
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span className="font-bold tabular-nums">
                            {formatStringNumbers(Number(value).toFixed(1))}%
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="margin" name={t('margin_col')} fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="space-y-3">
        <MarginGauge
          title={t('margin_gauge_title')}
          description={t('margin_gauge_desc')}
          marginPct={summary?.profitMargin ?? 0}
          emptyLabel={t('no_data')}
        />
        <DonutShareChart
          title={t('profit_composition')}
          description={t('profit_composition_desc')}
          data={[
            {
              name: t('cogs'),
              value: Math.max(0, summary?.totalCost ?? 0),
              color: 'var(--chart-4)',
            },
            {
              name: t('profit'),
              value: Math.max(0, summary?.totalProfit ?? 0),
              color: 'var(--chart-2)',
            },
          ].filter((s) => s.value > 0)}
          emptyLabel={t('no_data')}
        />
      </div>
    </div>
  );
}
