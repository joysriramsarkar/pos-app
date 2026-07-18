'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Tag, Download } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { subDays, format } from 'date-fns';

// CSS token colors — auto-switch light/dark
const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-1)',
  'var(--chart-2)', 'var(--chart-3)'
];

function ChartSkeleton({ height = 192 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      <div className="h-full rounded-lg bg-muted/50 flex items-end justify-around px-3 pb-3 gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-t-sm bg-muted" style={{ height: `${40 + Math.sin(i) * 25}%` }} />
        ))}
      </div>
    </div>
  );
}

interface CategoriesReportProps {
  onBack: () => void;
}

export function CategoriesReport({ onBack }: CategoriesReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, formatStringNumbers, formatCompact } = useNumberFormat();

  const pieChartConfig: ChartConfig = {
    revenue: { label: t('chart_revenue'), color: 'var(--chart-1)' },
  };

  const barChartConfig: ChartConfig = {
    profit: { label: t('chart_profit'), color: 'var(--chart-2)' },
  };
  
  const [categories, setCategories] = useState<any[]>([]);
  const [subCategories, setSubCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Date states
  const [preset, setPreset] = useState('30');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    setLoading(true);
    let url = `/api/reports/categories?from=${dateFrom}&to=${dateTo}T23:59:59&tzOffset=${new Date().getTimezoneOffset()}`;
    if (preset !== 'custom') {
      url = `/api/reports/categories?days=${preset}&tzOffset=${new Date().getTimezoneOffset()}`;
    }
    
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.categories) {
          setCategories(res.categories ?? []);
        }
      })
      .catch((err) => console.error('Failed to fetch category stats:', err))
      .finally(() => setLoading(false));

    // Also fetch sub-categories
    const subUrl = preset !== 'custom'
      ? `/api/reports/categories?days=${preset}&subCategory=true&tzOffset=${new Date().getTimezoneOffset()}`
      : `/api/reports/categories?from=${dateFrom}&to=${dateTo}T23:59:59&subCategory=true&tzOffset=${new Date().getTimezoneOffset()}`;
    fetch(subUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => { if (res && res.categories) setSubCategories(res.categories ?? []); })
      .catch((err) => console.error('Failed to fetch sub-category stats:', err));
  }, [preset, dateFrom, dateTo]);

  // Summary Metrics
  const stats = useMemo(() => {
    let count = categories.length;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalQty = 0;
    let topCategory = { name: '—', value: 0 };
    
    categories.forEach((c) => {
      const rev = Number(c.revenue || 0);
      totalRevenue += rev;
      totalProfit += Number(c.profit || 0);
      totalQty += Number(c.qty || 0);
      
      if (rev > topCategory.value) {
        topCategory = { name: c.name, value: rev };
      }
    });
    
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    return {
      count,
      totalRevenue,
      totalProfit,
      totalQty,
      topCategory,
      averageMargin
    };
  }, [categories]);

  const pieData = useMemo(() => {
    return categories.map((c) => ({
      name: c.name,
      value: Number(c.revenue)
    }));
  }, [categories]);

  const barData = useMemo(() => {
    return categories
      .map((c) => ({
        name: c.name,
        profit: Number(c.profit)
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [categories]);

  const handleDownloadCSV = () => {
    if (!categories.length) return;
    const header = ['Category Name', 'Items Sold', 'Revenue', 'Profit', 'Margin %', 'Revenue Share %'];
    const rows = [
      header,
      ...categories.map((c) => [
        c.name,
        c.qty,
        Number(c.revenue).toFixed(2),
        Number(c.profit).toFixed(2),
        c.margin + '%',
        c.percentage + '%'
      ]),
      ['Total', stats.totalQty, stats.totalRevenue.toFixed(2), stats.totalProfit.toFixed(2), stats.averageMargin.toFixed(1) + '%', '100%']
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `categories-sales-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePresetChange = (p: string) => {
    setPreset(p);
    if (p !== 'custom') {
      const days = parseInt(p);
      setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
      setDateTo(format(new Date(), 'yyyy-MM-dd'));
    }
  };



  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Tag className="w-5 h-5 text-indigo-500" />
              {t('category_revenue')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('category_breakdown_desc')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!categories.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      {/* Date Filters Card */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={preset === String(d) ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => handlePresetChange(String(d))}
              >
                {formatStringNumbers(d)}d
              </Button>
            ))}
            <Button
              size="sm"
              variant={preset === 'custom' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setPreset('custom')}
            >
              {t('custom')}
            </Button>
          </div>
          
          {preset === 'custom' && (
            <div className="flex items-center gap-2 mt-2 md:mt-0">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">{t('top_category_sales')}</p>
            <p className="text-sm font-semibold text-blue-700 truncate mt-1">{stats.topCategory.name}</p>
            <p className="text-sm font-bold text-blue-600">{formatPrice(stats.topCategory.value)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{t('avg_profit_margin')}</p>
            <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatNumber(Number(stats.averageMargin.toFixed(1)))}%</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('total_category_revenue')}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatPrice(stats.totalRevenue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('active_categories_label')}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(stats.count)} {t('category')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphical Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie Chart: Revenue shares */}
        <Card className="rounded-2xl shadow-sm col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('rev_dist_share')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 w-full flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('loading')}</p></div>
            ) : pieData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-12">{t('no_data')}</p>
            ) : (
              <ChartContainer config={pieChartConfig} className="h-[192px] w-full">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(v) => (
                      <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>
                    )} />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart: Profit comparison */}
        <Card className="rounded-2xl shadow-sm col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('net_profit_contrib')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 w-full flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('loading')}</p></div>
            ) : barData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-12">{t('no_data')}</p>
            ) : (
              <ChartContainer config={barChartConfig} className="h-[192px] w-full">
                <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={70} />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(v) => (
                      <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>
                    )} />}
                  />
                  <Bar dataKey="profit" name="profit" fill="var(--color-profit)" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid List Table breakdown */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('category_breakdown')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Category Name</TableHead>
                <TableHead className="text-right text-xs">Items Sold</TableHead>
                <TableHead className="text-right text-xs">Gross Revenue</TableHead>
                <TableHead className="text-right text-xs">Net Profit</TableHead>
                <TableHead className="text-right text-xs">Margin</TableHead>
                <TableHead className="text-right text-xs">Revenue Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                </TableRow>
              ) : categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                </TableRow>
              ) : (
                categories.map((c, index) => (
                  <TableRow key={c.name} className="hover:bg-muted/30">
                    <TableCell className="text-xs font-semibold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                      {c.name}
                    </TableCell>
                    <TableCell className="text-right text-xs">{formatNumber(c.qty)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatPrice(c.revenue)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatPrice(c.profit)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(Number(c.margin))}%</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground font-medium">{formatNumber(Number(c.percentage))}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sub-Category Report */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('sub_category_breakdown')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('category')}</TableHead>
                <TableHead className="text-xs">{t('sub_category_name')}</TableHead>
                <TableHead className="text-right text-xs">Items Sold</TableHead>
                <TableHead className="text-right text-xs">{t('revenue')}</TableHead>
                <TableHead className="text-right text-xs">{t('profit')}</TableHead>
                <TableHead className="text-right text-xs">{t('margin_col')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                </TableRow>
              ) : subCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">{t('no_sub_category_data')}</TableCell>
                </TableRow>
              ) : (
                subCategories.map((c, index) => (
                  <TableRow key={`${c.parentCategory}-${c.name}`} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground">{c.parentCategory}</TableCell>
                    <TableCell className="text-xs font-semibold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                      {c.name}
                    </TableCell>
                    <TableCell className="text-right text-xs">{formatNumber(c.qty)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatPrice(c.revenue)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatPrice(c.profit)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(Number(c.margin))}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
