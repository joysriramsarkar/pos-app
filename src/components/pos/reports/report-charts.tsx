'use client';

import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  SafeResponsiveContainer,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useTranslations } from 'next-intl';

const CHART_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function shortLabel(name: string, max = 12) {
  if (!name) return '—';
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/** Horizontal bar ranking chart (products, customers, dues, stock, …) */
export function HorizontalRankChart({
  title,
  description,
  data,
  valueKey = 'value',
  nameKey = 'name',
  color = 'var(--chart-1)',
  height = 260,
  emptyLabel,
  formatValue,
  secondValueKey,
  secondColor = 'var(--chart-2)',
  secondLabel,
  valueLabel,
}: {
  title: string;
  description?: string;
  data: Record<string, string | number>[];
  valueKey?: string;
  nameKey?: string;
  color?: string;
  height?: number;
  emptyLabel?: string;
  formatValue?: (n: number) => string;
  secondValueKey?: string;
  secondColor?: string;
  secondLabel?: string;
  valueLabel?: string;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatCompact } = useNumberFormat();
  const fmt = formatValue ?? formatPrice;
  const empty = emptyLabel ?? t('no_data');
  const primaryLabel = valueLabel ?? t('amount');
  const secondaryLabel = secondLabel ?? t('revenue');
  const chartData = useMemo(
    () =>
      data.slice(0, 10).map((row) => ({
        ...row,
        [nameKey]: shortLabel(String(row[nameKey] ?? ''), 14),
      })),
    [data, nameKey],
  );

  const config = {
    [valueKey]: { label: primaryLabel, color },
    ...(secondValueKey
      ? { [secondValueKey]: { label: secondaryLabel, color: secondColor } }
      : {}),
  } satisfies ChartConfig;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                type="number"
                tickFormatter={formatCompact}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey={nameKey}
                width={88}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(v, name) => (
                      <div className="flex items-center justify-between gap-3 min-w-[120px]">
                        <span className="text-muted-foreground text-xs">{String(name)}</span>
                        <span className="font-bold tabular-nums">{fmt(Number(v))}</span>
                      </div>
                    )}
                  />
                }
              />
              {secondValueKey && <Legend wrapperStyle={{ fontSize: 11 }} />}
              <Bar
                dataKey={valueKey}
                name={primaryLabel}
                fill={color}
                radius={[0, 4, 4, 0]}
                maxBarSize={secondValueKey ? 12 : 18}
              />
              {secondValueKey && (
                <Bar
                  dataKey={secondValueKey}
                  name={secondaryLabel}
                  fill={secondColor}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={12}
                />
              )}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Area trend (revenue / profit over time) */
export function AreaTrendChart({
  title,
  description,
  data,
  xKey = 'date',
  series,
  height = 240,
  emptyLabel,
  xTickFormatter,
  formatValue,
}: {
  title: string;
  description?: string;
  data: Record<string, string | number>[];
  xKey?: string;
  series: { key: string; label: string; color: string }[];
  height?: number;
  emptyLabel?: string;
  xTickFormatter?: (v: string) => string;
  formatValue?: (n: number) => string;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatCompact } = useNumberFormat();
  const fmt = formatValue ?? formatPrice;
  const empty = emptyLabel ?? t('no_data');
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey={xKey}
                tickFormatter={xTickFormatter}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(v, name) => (
                      <div className="flex items-center justify-between gap-3 min-w-[120px]">
                        <span className="text-muted-foreground text-xs">{String(name)}</span>
                        <span className="font-bold tabular-nums">{fmt(Number(v))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  fill={`url(#fill-${s.key})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Composed chart: bars + line (e.g. orders volume + avg ticket) */
export function ComposedVolumeChart({
  title,
  description,
  data,
  xKey = 'date',
  barKey,
  barLabel,
  lineKey,
  lineLabel,
  height = 220,
  emptyLabel,
  xTickFormatter,
  formatBar,
  formatLine,
}: {
  title: string;
  description?: string;
  data: Record<string, string | number>[];
  xKey?: string;
  barKey: string;
  barLabel: string;
  lineKey?: string;
  lineLabel?: string;
  height?: number;
  emptyLabel?: string;
  xTickFormatter?: (v: string) => string;
  formatBar?: (n: number) => string;
  formatLine?: (n: number) => string;
}) {
  const t = useTranslations('Reports');
  const { formatNumber, formatPrice, formatCompact } = useNumberFormat();
  const empty = emptyLabel ?? t('no_data');
  const resolvedBarLabel = barLabel || t('orders');
  const resolvedLineLabel = lineLabel || t('aov');
  const config = {
    [barKey]: { label: resolvedBarLabel, color: 'var(--chart-3)' },
    ...(lineKey ? { [lineKey]: { label: resolvedLineLabel, color: 'var(--chart-1)' } } : {}),
  } satisfies ChartConfig;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey={xKey}
                tickFormatter={xTickFormatter}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={formatCompact}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              {lineKey && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={formatCompact}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
              )}
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(v, name) => {
                      const isLine = lineKey && String(name) === resolvedLineLabel;
                      const text = isLine
                        ? (formatLine ?? formatPrice)(Number(v))
                        : (formatBar ?? formatNumber)(Number(v));
                      return (
                        <div className="flex items-center justify-between gap-3 min-w-[120px]">
                          <span className="text-muted-foreground text-xs">{String(name)}</span>
                          <span className="font-bold tabular-nums">{text}</span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey={barKey}
                name={resolvedBarLabel}
                fill={`var(--color-${barKey})`}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              {lineKey && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey={lineKey}
                  name={resolvedLineLabel}
                  stroke={`var(--color-${lineKey})`}
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Donut / pie for share breakdowns */
export function DonutShareChart({
  title,
  description,
  data,
  height = 240,
  emptyLabel,
  formatValue,
  colors,
}: {
  title: string;
  description?: string;
  data: { name: string; value: number; color?: string }[];
  height?: number;
  emptyLabel?: string;
  formatValue?: (n: number) => string;
  colors?: string[];
}) {
  const t = useTranslations('Reports');
  const { formatPrice } = useNumberFormat();
  const fmt = formatValue ?? formatPrice;
  const empty = emptyLabel ?? t('no_data');
  const palette = colors || CHART_PALETTE;
  const config = Object.fromEntries(
    data.map((d, i) => [d.name, { label: d.name, color: d.color || palette[i % palette.length] }]),
  ) satisfies ChartConfig;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 || data.every((d) => d.value <= 0) ? (
          <div className="h-48 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                strokeWidth={2}
                paddingAngle={2}
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={d.color || palette[i % palette.length]} />
                ))}
              </Pie>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(v, name) => (
                      <div className="flex items-center justify-between gap-3 min-w-[120px]">
                        <span className="text-muted-foreground text-xs">{String(name)}</span>
                        <span className="font-bold tabular-nums">{fmt(Number(v))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Radial progress-style margin gauge (0–100) */
export function MarginGauge({
  title,
  description,
  marginPct,
  emptyLabel,
}: {
  title: string;
  description?: string;
  marginPct: number;
  emptyLabel?: string;
}) {
  const t = useTranslations('Reports');
  const { formatStringNumbers } = useNumberFormat();
  const empty = emptyLabel ?? t('no_data');
  const marginWord = t('margin_label');
  const clamped = Math.max(0, Math.min(100, Number.isFinite(marginPct) ? marginPct : 0));
  const color =
    clamped >= 25 ? 'var(--chart-2)' : clamped >= 12 ? 'var(--chart-3)' : 'var(--chart-4)';
  const data = [{ name: marginWord, value: clamped, fill: color }];

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {!Number.isFinite(marginPct) ? (
          <div className="h-40 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <div className="relative h-40">
            <SafeResponsiveContainer height={160}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="68%"
                outerRadius="100%"
                barSize={14}
                data={data}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar background dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </SafeResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-2xl font-extrabold tabular-nums" style={{ color }}>
                {formatStringNumbers(clamped.toFixed(1))}%
              </p>
              <p className="text-[10px] text-muted-foreground tracking-wide">{marginWord}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Simple vertical bar for category revenue / stock levels */
export function VerticalBarChart({
  title,
  description,
  data,
  xKey = 'name',
  yKey = 'value',
  color = 'var(--chart-1)',
  height = 240,
  emptyLabel,
  formatValue,
  valueLabel,
}: {
  title: string;
  description?: string;
  data: Record<string, string | number>[];
  xKey?: string;
  yKey?: string;
  color?: string;
  height?: number;
  emptyLabel?: string;
  formatValue?: (n: number) => string;
  valueLabel?: string;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatCompact } = useNumberFormat();
  const fmt = formatValue ?? formatPrice;
  const empty = emptyLabel ?? t('no_data');
  const seriesLabel = valueLabel ?? t('amount');
  const chartData = useMemo(
    () =>
      data.slice(0, 12).map((row) => ({
        ...row,
        [xKey]: shortLabel(String(row[xKey] ?? ''), 10),
      })),
    [data, xKey],
  );
  const config = { [yKey]: { label: seriesLabel, color } } satisfies ChartConfig;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(v, name) => (
                      <div className="flex items-center justify-between gap-3 min-w-[100px]">
                        <span className="text-muted-foreground text-xs">{String(name || seriesLabel)}</span>
                        <span className="font-bold tabular-nums">{fmt(Number(v))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey={yKey} name={seriesLabel} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export { CHART_PALETTE };
