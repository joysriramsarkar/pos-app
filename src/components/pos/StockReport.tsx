'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Package, Download, Search, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';

type StockFilterStatus = 'All' | 'Low' | 'Out' | 'In';

interface StockReportProps {
  onBack: () => void;
}

export function StockReport({ onBack }: StockReportProps) {
  const t = useTranslations('Reports');
  const tStock = useTranslations('Stock');
  const { formatPrice, formatNumber, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState<StockFilterStatus>('All');
  
  useEffect(() => {
    setLoading(true);
    // Fetch all products to calculate valuation
    fetch('/api/products?limit=10000')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.data) {
          setProducts(res.data ?? []);
        }
      })
      .catch((err) => console.error('Failed to load products for stock report:', err))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Calculations
  const stats = useMemo(() => {
    let totalStockQty = 0;
    let totalStockValueAtCost = 0; // Buying price * stock
    let totalStockValueAtRetail = 0; // Selling price * stock
    let activeProductsCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    
    products.forEach((p) => {
      if (!p.isActive) return;
      activeProductsCount++;
      
      const stock = Number(p.currentStock || 0);
      const buyPrice = Number(p.buyingPrice || 0);
      const sellPrice = Number(p.sellingPrice || 0);
      const minLevel = Number(p.minStockLevel || 0);
      
      totalStockQty += stock;
      totalStockValueAtCost += (buyPrice * stock);
      totalStockValueAtRetail += (sellPrice * stock);
      
      if (stock === 0) {
        outOfStockCount++;
      } else if (stock <= minLevel) {
        lowStockCount++;
      }
    });
    
    const potentialProfit = Math.max(0, totalStockValueAtRetail - totalStockValueAtCost);
    
    return {
      totalStockQty,
      totalStockValueAtCost,
      totalStockValueAtRetail,
      potentialProfit,
      activeProductsCount,
      lowStockCount,
      outOfStockCount
    };
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.isActive) return false;
      
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.nameBn || '').includes(searchQuery) ||
        (p.barcode || '').includes(searchQuery);
        
      const matchesCategory = filterCategory === 'All' || p.category === filterCategory;
      
      const stock = Number(p.currentStock || 0);
      const minLevel = Number(p.minStockLevel || 0);
      
      let matchesStatus = true;
      if (filterStatus === 'Low') {
        matchesStatus = stock > 0 && stock <= minLevel;
      } else if (filterStatus === 'Out') {
        matchesStatus = stock === 0;
      } else if (filterStatus === 'In') {
        matchesStatus = stock > minLevel;
      }
      
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, filterCategory, filterStatus]);

  // Chart data: Top 12 lowest stock items (that are not out of stock, sorted by ratio of stock/minLevel)
  const lowestStockChartData = useMemo(() => {
    return products
      .filter((p) => p.isActive && Number(p.currentStock) > 0 && Number(p.currentStock) <= Number(p.minStockLevel))
      .map((p) => ({
        name: p.name,
        stock: Number(p.currentStock),
        minLevel: Number(p.minStockLevel)
      }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 15);
  }, [products]);

  // Category wise valuation table
  const categorySummary = useMemo(() => {
    const map: Record<string, { count: number; qty: number; costVal: number; retailVal: number }> = {};
    
    products.forEach((p) => {
      if (!p.isActive) return;
      const cat = p.category || 'Uncategorized';
      
      if (!map[cat]) {
        map[cat] = { count: 0, qty: 0, costVal: 0, retailVal: 0 };
      }
      
      const stock = Number(p.currentStock || 0);
      const buyPrice = Number(p.buyingPrice || 0);
      const sellPrice = Number(p.sellingPrice || 0);
      
      map[cat].count += 1;
      map[cat].qty += stock;
      map[cat].costVal += (buyPrice * stock);
      map[cat].retailVal += (sellPrice * stock);
    });
    
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.costVal - a.costVal);
  }, [products]);

  const handleDownloadCSV = () => {
    if (!filteredProducts.length) return;
    const header = ['Product Name', 'Barcode', 'Category', 'Stock Qty', 'Unit', 'Min Level', 'Buying Price', 'Selling Price', 'Cost Valuation', 'Retail Valuation'];
    const rows = [
      header,
      ...filteredProducts.map((p) => {
        const stock = Number(p.currentStock || 0);
        const buy = Number(p.buyingPrice || 0);
        const sell = Number(p.sellingPrice || 0);
        return [
          p.name,
          p.barcode || '',
          p.category || '',
          stock,
          p.unit || 'pcs',
          p.minStockLevel || 0,
          buy.toFixed(2),
          sell.toFixed(2),
          (buy * stock).toFixed(2),
          (sell * stock).toFixed(2)
        ];
      })
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-valuation-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              <Package className="w-5 h-5 text-indigo-500" />
              {tStock('title') || 'Stock Valuation Report'}
            </h1>
            <p className="text-muted-foreground text-xs">{tStock('detailed_desc') || 'Advanced stock level metrics & inventory cost valuations'}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!filteredProducts.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="rounded-2xl shadow-sm bg-indigo-50/50 dark:bg-indigo-950/10 border-indigo-100 dark:border-indigo-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">{tStock('total_stock_value') || 'Valuation (Cost)'}</p>
            <p className="text-lg md:text-xl font-extrabold text-indigo-700 mt-1">{formatPrice(stats.totalStockValueAtCost)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{tStock('total_retail_value') || 'Valuation (Retail)'}</p>
            <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(stats.totalStockValueAtRetail)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">{tStock('potential_profit') || 'Potential Profit'}</p>
            <p className="text-lg md:text-xl font-extrabold text-amber-700 mt-1">{formatPrice(stats.potentialProfit)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30 animate-pulse">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-red-600 tracking-wider">{tStock('low_stock') || 'Low / Out of Stock'}</p>
            <p className="text-lg md:text-xl font-extrabold text-red-700 mt-1">
              {formatStringNumbers(stats.lowStockCount)} / {formatStringNumbers(stats.outOfStockCount)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{tStock('items') || 'Total Active Products'}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(stats.activeProductsCount)} items</p>
          </CardContent>
        </Card>
      </div>

      {/* Recharts Graphical Visualisation of Low Stock */}
      {lowestStockChartData.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('critical_stock')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lowestStockChartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="stock" name={t('current_stock_bar')} fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="minLevel" name={t('min_level_bar')} fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side-by-side category totals & Stock list filters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category Table */}
        <Card className="rounded-2xl shadow-sm col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('valuation_by_category')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('tab_categories')}</TableHead>
                  <TableHead className="text-right text-xs">{tStock('items') || 'Items'}</TableHead>
                  <TableHead className="text-right text-xs">{t('cost_val')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorySummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  categorySummary.map((cat) => (
                    <TableRow key={cat.name} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-semibold">{cat.name}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(cat.count)}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatPrice(cat.costVal)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Stock List table search and filters */}
        <Card className="rounded-2xl shadow-sm col-span-1 lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">{tStock('all_items') || 'Product Stock Ledger'}</CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="relative h-8 w-36">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-8 text-[11px] w-full"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 text-[11px] w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StockFilterStatus)}>
                <SelectTrigger className="h-8 text-[11px] w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Status</SelectItem>
                  <SelectItem value="In">In Stock</SelectItem>
                  <SelectItem value="Low">Low Stock</SelectItem>
                  <SelectItem value="Out">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[350px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-right text-xs">Stock</TableHead>
                    <TableHead className="text-right text-xs">Cost Price</TableHead>
                    <TableHead className="text-right text-xs">Retail Price</TableHead>
                    <TableHead className="text-right text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                    </TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map((p) => {
                      const stock = Number(p.currentStock || 0);
                      const minLevel = Number(p.minStockLevel || 0);
                      const buy = Number(p.buyingPrice || 0);
                      const sell = Number(p.sellingPrice || 0);
                      
                      let statusBadge = <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px]">In Stock</Badge>;
                      if (stock === 0) {
                        statusBadge = <Badge variant="destructive" className="text-[10px]">Out of Stock</Badge>;
                      } else if (stock <= minLevel) {
                        statusBadge = <Badge className="bg-amber-500 hover:bg-amber-600 text-[10px]">Low Stock</Badge>;
                      }
                      
                      return (
                        <TableRow key={p.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs">
                            <p className="font-semibold text-xs">{p.name}</p>
                            {p.nameBn && <p className="text-[10px] text-muted-foreground">{p.nameBn}</p>}
                          </TableCell>
                          <TableCell className={`text-right text-xs font-semibold ${stock === 0 ? 'text-red-500' : stock <= minLevel ? 'text-amber-500' : ''}`}>
                            {formatNumber(stock)} <span className="text-[10px] text-muted-foreground font-normal">{p.unit || 'pcs'}</span>
                          </TableCell>
                          <TableCell className="text-right text-xs">{formatPrice(buy)}</TableCell>
                          <TableCell className="text-right text-xs">{formatPrice(sell)}</TableCell>
                          <TableCell className="text-right text-xs">{statusBadge}</TableCell>
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
    </div>
  );
}
