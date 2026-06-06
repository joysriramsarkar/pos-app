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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductStat {
  id: string;
  name: string;
  nameBn?: string | null;
  unit: string;
  quantity: number;
  revenue: number;
  profit: number;
}

interface StockHistoryEntry {
  id: string;
  changeType: string;
  quantity: number;
  reason?: string | null;
  referenceId?: string | null;
  createdAt: string;
}

interface DailySale { date: string; qty: number; revenue: number; }
interface HourlySale { hour: number; qty: number; }

interface ProductDetail {
  product: {
    id: string; name: string; nameBn?: string | null; category: string;
    buyingPrice: number; sellingPrice: number; unit: string;
    currentStock: number; minStockLevel: number; barcode?: string | null;
    createdAt: string;
  };
  summary: { totalQtySold: number; totalRevenue: number; totalProfit: number; totalStockAdded: number; };
  stockHistory: StockHistoryEntry[];
  dailySales: DailySale[];
  hourlySales: HourlySale[];
}

interface ProductStatisticsProps { onBack: () => void; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatQuantity = (value: number) => {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
};

const changeTypeLabel: Record<string, { key: string; color: string; icon: React.ReactNode }> = {
  purchase: { key: 'type_purchase', color: 'text-green-600', icon: <Plus className="w-3 h-3" /> },
  sale:     { key: 'type_sale',     color: 'text-blue-600',  icon: <ShoppingCart className="w-3 h-3" /> },
  adjustment:{ key: 'type_adjustment',color: 'text-amber-600', icon: <RefreshCw className="w-3 h-3" /> },
  return:   { key: 'type_return',   color: 'text-purple-600',icon: <RotateCcw className="w-3 h-3" /> },
};

// ─── Detail View ──────────────────────────────────────────────────────────────

function ProductDetailView({ productId, days, onBack }: { productId: string; days: string; onBack: () => void }) {
  const t = useTranslations('Reports');
  const { formatPrice, formatStringNumbers } = useNumberFormat();
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'stock' | 'sales'>('overview');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/product-detail?productId=${productId}&days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [productId, days]);

  if (loading) return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b bg-background p-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0"><ArrowLeft className="w-4 h-4" /></Button>
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b bg-background p-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0"><ArrowLeft className="w-4 h-4" /></Button>
        <p className="text-destructive text-sm">{t('load_error')}</p>
      </div>
    </div>
  );

  const { product, summary, stockHistory, dailySales, hourlySales } = data;
  const peakHour = hourlySales.reduce((a, b) => b.qty > a.qty ? b : a, hourlySales[0]);
  const maxDailyQty = Math.max(...dailySales.map(d => d.qty), 1);
  const maxHourlyQty = Math.max(...hourlySales.map(h => h.qty), 1);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold truncate">{product.name}</h2>
            {product.nameBn && <p className="text-xs text-muted-foreground">{product.nameBn}</p>}
          </div>
          <Badge variant="outline">{product.category}</Badge>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
            <p className="text-[10px] text-blue-600 dark:text-blue-400">{t('sold')}</p>
            <p className="font-bold text-blue-700 dark:text-blue-300">{formatStringNumbers(formatQuantity(summary.totalQtySold))} {product.unit}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30">
            <p className="text-[10px] text-green-600 dark:text-green-400">{t('total_sales')}</p>
            <p className="font-bold text-green-700 dark:text-green-300">{formatPrice(summary.totalRevenue)}</p>
          </div>
          <div className={`p-2.5 rounded-lg border ${summary.totalProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/30'}`}>
            <p className={`text-[10px] ${summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{t('total_profit')}</p>
            <p className={`font-bold ${summary.totalProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{formatPrice(summary.totalProfit)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/30">
            <p className="text-[10px] text-purple-600 dark:text-purple-400">{t('stock_added')}</p>
            <p className="font-bold text-purple-700 dark:text-purple-300">{formatStringNumbers(summary.totalStockAdded)} {product.unit}</p>
          </div>
        </div>

        {/* Product info row */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{t('buying_price')}: <strong className="text-foreground">{formatPrice(product.buyingPrice)}</strong></span>
          <span>•</span>
          <span>{t('selling_price')}: <strong className="text-foreground">{formatPrice(product.sellingPrice)}</strong></span>
          <span>•</span>
          <span>{t('current_stock')}: <strong className={product.currentStock <= product.minStockLevel ? 'text-red-600' : 'text-foreground'}>{formatStringNumbers(product.currentStock)} {product.unit}</strong></span>
          {peakHour.qty > 0 && <><span>•</span><span>{t('peak_sales')}: <strong className="text-foreground">{formatStringNumbers(peakHour.hour)}:00–{formatStringNumbers(peakHour.hour + 1)}:00</strong></span></>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {(['overview', 'stock', 'sales'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === tabKey ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {tabKey === 'overview' ? t('daily_sales') : tabKey === 'stock' ? t('stock_history_label') : t('hourly_sales')}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">

        {/* Daily sales bar chart */}
        {tab === 'overview' && (
          dailySales.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">{t('no_sales_period')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground mb-3">
                {days === '1' ? t('today_sales') : t('daily_sales_days', { days: formatStringNumbers(days) })}
              </p>
              {dailySales.map(d => (
                <div key={d.date} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">
                    {format(new Date(d.date), 'dd MMM')}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full flex items-center px-2 transition-all ${d.qty > 0 ? 'bg-primary/70' : 'bg-muted-foreground/20'}`}
                      style={{ width: `${d.qty > 0 ? Math.max(4, (d.qty / maxDailyQty) * 100) : 100}%` }}
                    >
                      <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                        {d.qty > 0 ? `${formatStringNumbers(formatQuantity(d.qty))} ${product.unit}` : '—'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-medium w-16 text-right shrink-0">
                    {d.qty > 0 ? formatPrice(d.revenue) : ''}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {/* Stock history */}
        {tab === 'stock' && (
          stockHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">{t('no_stock_history')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stockHistory.map(h => {
                const meta = changeTypeLabel[h.changeType] ?? { key: 'type_adjustment', color: 'text-foreground', icon: null };
                return (
                  <div key={h.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-card">
                    <div className={`mt-0.5 ${meta.color}`}>{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${meta.color}`}>{t(meta.key)}</span>
                        <span className={`text-sm font-bold ${h.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {h.quantity > 0 ? '+' : ''}{formatStringNumbers(h.quantity)} {product.unit}
                        </span>
                      </div>
                      {h.reason && <p className="text-xs text-muted-foreground truncate">{h.reason}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(h.createdAt), 'dd MMM, HH:mm')}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Hourly heatmap */}
        {tab === 'sales' && (
          <div>
            <p className="text-xs text-muted-foreground mb-3">{t('peak_hours_desc')}</p>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {hourlySales.map(h => {
                const intensity = maxHourlyQty > 0 ? h.qty / maxHourlyQty : 0;
                const bg = intensity === 0
                  ? 'bg-muted'
                  : intensity < 0.33
                  ? 'bg-blue-200 dark:bg-blue-900/40'
                  : intensity < 0.66
                  ? 'bg-blue-400 dark:bg-blue-700'
                  : 'bg-blue-600 dark:bg-blue-500';
                return (
                  <div key={h.hour} className={`${bg} rounded-md p-2 text-center`}>
                    <p className="text-[10px] text-muted-foreground">{formatStringNumbers(h.hour)}:00</p>
                    <p className={`text-xs font-bold ${intensity > 0.5 ? 'text-white' : 'text-foreground'}`}>
                      {h.qty > 0 ? formatStringNumbers(h.qty) : '–'}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {peakHour.qty > 0
                ? t('peak_sales_info', {
                    time: `${formatStringNumbers(peakHour.hour)}:00–${formatStringNumbers(peakHour.hour + 1)}:00`,
                    qty: formatStringNumbers(formatQuantity(peakHour.qty)),
                    unit: product.unit,
                  })
                : t('no_sales_period')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

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
    fetch(`/api/reports/products?days=${days}`)
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
      <div className="shrink-0 border-b bg-background p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart2 className="w-6 h-6" />
              {t('product_stats')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('click_product_details')}</p>
          </div>
        </div>

        {/* Inventory summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
            <p className="text-xs text-blue-600 dark:text-blue-400">{t('total_products')}</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatStringNumbers(totalProducts)}</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30">
            <p className="text-xs text-green-600 dark:text-green-400">{t('stock_value')}</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">{formatPrice(totalStockValue)}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30">
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('low_stock')}</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatStringNumbers(lowStock)}</p>
          </div>
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
            <p className="text-xs text-red-600 dark:text-red-400">{t('out_of_stock')}</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-300">{formatStringNumbers(outOfStock)}</p>
          </div>
        </div>

        {/* Sales summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-2.5 rounded-lg bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">{t('total_sales')}</p>
            <p className="font-bold text-sm">{formatPrice(totalRevenue)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">{t('total_profit')}</p>
            <p className={`font-bold text-sm ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(totalProfit)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">{t('total_items_sold')}</p>
            <p className="font-bold text-sm">{formatStringNumbers(totalDistinctProductsSold)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t('search_product')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t('today_sales_option')}</SelectItem>
              <SelectItem value="7">{t('days_7')}</SelectItem>
              <SelectItem value="30">{t('days_30')}</SelectItem>
              <SelectItem value="90">{t('days_90')}</SelectItem>
              <SelectItem value="365">{t('year_1')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">{t('by_sales')}</SelectItem>
              <SelectItem value="quantity">{t('by_quantity')}</SelectItem>
              <SelectItem value="profit">{t('by_profit')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
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

      <div className="shrink-0 border-t bg-muted/30 p-3 text-sm text-muted-foreground text-center">
        {t('stats_summary', { count: formatStringNumbers(filtered.length), period: periodText })}
      </div>
    </div>
  );
}

export default ProductStatistics;
