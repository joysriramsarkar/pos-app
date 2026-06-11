'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Tag, Download, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';
import { subDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

type ProductSortField = 'quantity' | 'revenue' | 'profit';
type ChartMetric = 'quantity' | 'revenue' | 'profit';

interface ProductsReportProps {
  onBack: () => void;
}

export function ProductsReport({ onBack }: ProductsReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<ProductSortField>('revenue');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  
  // Date states
  const [preset, setPreset] = useState('30');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    setLoading(true);
    let url = `/api/reports/products?from=${dateFrom}&to=${dateTo}T23:59:59`;
    if (preset !== 'custom') {
      url = `/api/reports/products?days=${preset}`;
    }
    
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.topProducts) {
          setProducts(res.topProducts ?? []);
        }
      })
      .catch((err) => console.error('Failed to fetch product stats:', err))
      .finally(() => setLoading(false));
  }, [preset, dateFrom, dateTo]);

  // Totals
  const summaryStats = useMemo(() => {
    let distinctCount = products.length;
    let totalQty = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let topProdRevenue = { name: '—', value: 0 };
    let topProdProfit = { name: '—', value: 0 };
    
    products.forEach((p) => {
      const q = Number(p.quantity || 0);
      const r = Number(p.revenue || 0);
      const pr = Number(p.profit || 0);
      
      totalQty += q;
      totalRevenue += r;
      totalProfit += pr;
      
      if (r > topProdRevenue.value) {
        topProdRevenue = { name: p.name, value: r };
      }
      if (pr > topProdProfit.value) {
        topProdProfit = { name: p.name, value: pr };
      }
    });
    
    return {
      distinctCount,
      totalQty,
      totalRevenue,
      totalProfit,
      topProdRevenue,
      topProdProfit
    };
  }, [products]);

  // Filtered and Sorted list
  const processedProducts = useMemo(() => {
    return products
      .filter((p) => {
        return (
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.nameBn || '').includes(searchQuery)
        );
      })
      .sort((a, b) => {
        const fieldA = Number(a[sortField] || 0);
        const fieldB = Number(b[sortField] || 0);
        return fieldB - fieldA;
      });
  }, [products, searchQuery, sortField]);

  // Chart data: Top 10 by selected metric
  const chartData = useMemo(() => {
    return [...products]
      .sort((a, b) => {
        const valA = Number(a[chartMetric] || 0);
        const valB = Number(b[chartMetric] || 0);
        return valB - valA;
      })
      .slice(0, 10)
      .map((p) => ({
        name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
        [chartMetric]: Number(p[chartMetric] || 0)
      }));
  }, [products, chartMetric]);

  const handleDownloadCSV = () => {
    if (!processedProducts.length) return;
    const header = ['Rank', 'Product Name', 'Unit', 'Qty Sold', 'Revenue', 'Cost of Goods', 'Profit', 'Margin %'];
    const rows = [
      header,
      ...processedProducts.map((p, index) => {
        const cost = Number(p.revenue || 0) - Number(p.profit || 0);
        const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
        return [
          index + 1,
          p.name,
          p.unit,
          p.quantity,
          p.revenue.toFixed(2),
          cost.toFixed(2),
          p.profit.toFixed(2),
          margin.toFixed(1) + '%'
        ];
      })
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-sales-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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

  const yFmt = (v: number) => {
    if (chartMetric === 'quantity') return formatStringNumbers(v);
    return `${currencySymbol}${v >= 1000 ? formatStringNumbers((v / 1000).toFixed(1)) + 'k' : formatStringNumbers(v)}`;
  };
  const tooltipStyle = { borderRadius: '8px', fontSize: '12px' };

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
              {t('top_products')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('best_items')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!processedProducts.length}>
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
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Sales Qty</p>
            <p className="text-lg md:text-xl font-extrabold text-blue-600 mt-1">{formatNumber(summaryStats.totalQty)} units</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Products Sold</p>
            <p className="text-lg md:text-xl font-extrabold text-indigo-600 mt-1">{formatNumber(summaryStats.distinctCount)} items</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Top Product (Revenue)</p>
            <p className="text-xs font-semibold text-blue-700 truncate mt-1">{summaryStats.topProdRevenue.name}</p>
            <p className="text-sm font-bold text-blue-600">{formatPrice(summaryStats.topProdRevenue.value)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Top Product (Profit)</p>
            <p className="text-xs font-semibold text-emerald-700 truncate mt-1">{summaryStats.topProdProfit.name}</p>
            <p className="text-sm font-bold text-emerald-600">{formatPrice(summaryStats.topProdProfit.value)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphical Chart comparison */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">Top 10 Product Sales Comparison</CardTitle>
            <div className="flex gap-1 bg-muted p-0.5 rounded-lg">
              {(['revenue', 'profit', 'quantity'] as ChartMetric[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={chartMetric === m ? 'default' : 'ghost'}
                  className="h-7 text-[10px] px-2.5 rounded-md"
                  onClick={() => setChartMetric(m)}
                >
                  {m.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [chartMetric === 'quantity' ? formatNumber(v) : formatPrice(v)]} contentStyle={tooltipStyle} />
                  <Bar dataKey={chartMetric} name={chartMetric.toUpperCase()} fill={chartMetric === 'revenue' ? '#3b82f6' : chartMetric === 'profit' ? '#10b981' : '#f59e0b'} radius={[4, 4, 0, 0]} maxBarSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table Records list */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">All Items Performance Listing</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-44">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs w-full"
              />
            </div>
            <Select value={sortField} onValueChange={(v) => setSortField(v as ProductSortField)}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Sort by Revenue</SelectItem>
                <SelectItem value="profit">Sort by Profit</SelectItem>
                <SelectItem value="quantity">Sort by Volume</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead className="text-xs w-10">Rank</TableHead>
                  <TableHead className="text-xs">Product Name</TableHead>
                  <TableHead className="text-right text-xs">Qty Sold</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-right text-xs">Net Profit</TableHead>
                  <TableHead className="text-right text-xs">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                  </TableRow>
                ) : processedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  processedProducts.map((p, index) => {
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-semibold text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="text-xs">
                          <p className="font-semibold text-xs">{p.name}</p>
                          {p.nameBn && <p className="text-[10px] text-muted-foreground">{p.nameBn}</p>}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {formatNumber(p.quantity)} <span className="text-[10px] text-muted-foreground font-normal">{p.unit}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">{formatPrice(p.revenue)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatPrice(p.profit)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(Number(margin.toFixed(1)))}%</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
