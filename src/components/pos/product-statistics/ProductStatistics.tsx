'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, BarChart2, Search, TrendingUp, TrendingDown,
  Package, Plus, Minus, RefreshCw, ShoppingCart, RotateCcw,
} from 'lucide-react';
import { useProductsStore } from '@/stores/pos-store';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';

import type { ProductStat, ProductStatisticsProps } from './types';
import { formatQuantity } from './utils';
import { ProductDetailView } from './ProductDetailView';
export type { ProductStatisticsProps } from './types';

export function ProductStatistics({ onBack }: ProductStatisticsProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatStringNumbers } = useNumberFormat();
  const [stats, setStats] = useState<ProductStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'profit'>('revenue');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const products = useProductsStore((s) => s.products);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/products?days=${days}&tzOffset=${new Date().getTimezoneOffset()}`)
      .then(r => r.ok ? r.json() : { topProducts: [] })
      .then(({ topProducts }) => setStats(topProducts ?? []))
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [days]);

  const totalStockValue = useMemo(
    () => products.filter(p => p.isActive).reduce((s, p) => s + p.currentStock * p.buyingPrice, 0),
    [products]
  );
  const totalProducts = products.filter(p => p.isActive).length;
  const outOfStock = products.filter(p => p.isActive && p.currentStock === 0).length;
  const lowStock = products.filter(p => p.isActive && p.currentStock > 0 && p.currentStock <= p.minStockLevel).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return stats
      .filter(s => s.name.toLowerCase().includes(q) || s.nameBn?.includes(search))
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [stats, search, sortBy]);

  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const totalProfit = filtered.reduce((s, p) => s + p.profit, 0);
  const totalDistinctProductsSold = filtered.length;

  // Show detail view if a product is selected
  if (selectedProductId) {
    return (
      <ProductDetailView
        productId={selectedProductId}
        days={days}
        onBack={() => setSelectedProductId(null)}
      />
    );
  }

  const periodText = days === '1'
    ? t('today_sales_info')
    : t('last_days_info', { days: formatStringNumbers(days) });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background p-2.5 sm:p-4 space-y-2 sm:space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-1.5 truncate">
              <BarChart2 className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" />
              <span>{t('product_stats')}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate hidden sm:block">{t('click_product_details')}</p>
          </div>
        </div>

        {/* Inventory summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          <div className="p-1.5 sm:p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
            <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 leading-tight">{t('total_products')}</p>
            <p className="text-xs sm:text-lg font-bold text-blue-700 dark:text-blue-300 leading-tight mt-0.5">{formatStringNumbers(totalProducts)}</p>
          </div>
          <div className="p-1.5 sm:p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30">
            <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 leading-tight">{t('stock_value')}</p>
            <p className="text-xs sm:text-lg font-bold text-green-700 dark:text-green-300 leading-tight mt-0.5">{formatPrice(totalStockValue)}</p>
          </div>
          <div className="p-1.5 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30">
            <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 leading-tight">{t('low_stock')}</p>
            <p className="text-xs sm:text-lg font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">{formatStringNumbers(lowStock)}</p>
          </div>
          <div className="p-1.5 sm:p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
            <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 leading-tight">{t('out_of_stock')}</p>
            <p className="text-xs sm:text-lg font-bold text-red-700 dark:text-red-300 leading-tight mt-0.5">{formatStringNumbers(outOfStock)}</p>
          </div>
        </div>

        {/* Sales summary */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="p-1.5 sm:p-2.5 rounded-lg bg-muted/50 text-center">
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{t('total_sales')}</p>
            <p className="font-bold text-xs sm:text-sm leading-tight mt-0.5">{formatPrice(totalRevenue)}</p>
          </div>
          <div className="p-1.5 sm:p-2.5 rounded-lg bg-muted/50 text-center">
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{t('total_profit')}</p>
            <p className={`font-bold text-xs sm:text-sm leading-tight mt-0.5 ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(totalProfit)}</p>
          </div>
          <div className="p-1.5 sm:p-2.5 rounded-lg bg-muted/50 text-center">
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{t('total_items_sold')}</p>
            <p className="font-bold text-xs sm:text-sm leading-tight mt-0.5">{formatStringNumbers(totalDistinctProductsSold)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-row gap-1.5 sm:gap-2 items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder={t('search_product')} value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs sm:text-sm" />
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-20 sm:w-28 h-8 text-xs sm:text-sm px-2 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t('today_sales_option')}</SelectItem>
              <SelectItem value="7">{t('days_7')}</SelectItem>
              <SelectItem value="30">{t('days_30')}</SelectItem>
              <SelectItem value="90">{t('days_90')}</SelectItem>
              <SelectItem value="365">{t('year_1')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-28 sm:w-36 h-8 text-xs sm:text-sm px-2 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">{t('by_sales')}</SelectItem>
              <SelectItem value="quantity">{t('by_quantity')}</SelectItem>
              <SelectItem value="profit">{t('by_profit')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content (Mobile Cards & Desktop Table) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Mobile Card List */}
        <div className="block sm:hidden p-2 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-xs">{t('loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t('no_data')}</p>
            </div>
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                onClick={() => setSelectedProductId(p.id)}
                className="p-2.5 bg-card border rounded-xl shadow-xs active:bg-muted/60 transition-colors flex flex-col gap-2 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                      {formatStringNumbers(i + 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-foreground truncate">{p.name}</p>
                      {p.nameBn && <p className="text-[10px] text-muted-foreground truncate">{p.nameBn}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center">
                    {p.profit >= 0 ? (
                      <span className="flex items-center text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                        <TrendingUp className="w-3 h-3 mr-0.5" /> {t('profit')}
                      </span>
                    ) : (
                      <span className="flex items-center text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                        <TrendingDown className="w-3 h-3 mr-0.5" /> {t('loss')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t text-center">
                  <div className="bg-muted/40 p-1.5 rounded-lg">
                    <p className="text-[9px] text-muted-foreground">{t('revenue')}</p>
                    <p className="text-xs font-bold text-foreground">{formatPrice(p.revenue)}</p>
                  </div>
                  <div className="bg-muted/40 p-1.5 rounded-lg">
                    <p className="text-[9px] text-muted-foreground">{t('profit')}</p>
                    <p className={`text-xs font-bold ${p.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPrice(p.profit)}
                    </p>
                  </div>
                  <div className="bg-muted/40 p-1.5 rounded-lg">
                    <p className="text-[9px] text-muted-foreground">{t('qty')}</p>
                    <p className="text-xs font-bold text-foreground">{formatStringNumbers(formatQuantity(p.quantity))} {p.unit}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t('product')}</TableHead>
                <TableHead className="text-right">{t('qty')}</TableHead>
                <TableHead className="text-right">{t('revenue')}</TableHead>
                <TableHead className="text-right">{t('profit')}</TableHead>
                <TableHead className="text-center">{t('trend')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{t('loading')}</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">{t('no_data')}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p, i) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-primary/5 transition-colors"
                    onClick={() => setSelectedProductId(p.id)}
                  >
                    <TableCell className="text-muted-foreground text-sm">{formatStringNumbers(i + 1)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      {p.nameBn && <p className="text-xs text-muted-foreground">{p.nameBn}</p>}
                    </TableCell>
                    <TableCell className="text-right">{formatStringNumbers(formatQuantity(p.quantity))} {p.unit}</TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(p.revenue)}</TableCell>
                    <TableCell className="text-right">
                      <span className={p.profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {formatPrice(p.profit)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.profit >= 0
                        ? <TrendingUp className="w-4 h-4 text-green-500 mx-auto" />
                        : <TrendingDown className="w-4 h-4 text-red-500 mx-auto" />}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="shrink-0 border-t bg-muted/30 p-2 sm:p-3 text-xs sm:text-sm text-muted-foreground text-center">
        {t('stats_summary', { count: formatStringNumbers(filtered.length), period: periodText })}
      </div>
    </div>
  );
}

export default ProductStatistics;
