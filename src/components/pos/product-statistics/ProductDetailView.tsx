'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, TrendingUp, TrendingDown,
  Package, Plus, Minus, RefreshCw, ShoppingCart, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { ProductDetail, StockHistoryEntry } from './types';

export const formatQuantity = (value: number) => {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
};

export const changeTypeLabel: Record<string, { key: string; color: string; icon: React.ReactNode }> = {
  purchase: { key: 'type_purchase', color: 'text-green-600', icon: <Plus className="w-3 h-3" /> },
  sale:     { key: 'type_sale',     color: 'text-blue-600',  icon: <ShoppingCart className="w-3 h-3" /> },
  adjustment:{ key: 'type_adjustment',color: 'text-amber-600', icon: <RefreshCw className="w-3 h-3" /> },
  return:   { key: 'type_return',   color: 'text-purple-600',icon: <RotateCcw className="w-3 h-3" /> },
};


export function ProductDetailView({ productId, days, onBack }: { productId: string; days: string; onBack: () => void }) {
  const t = useTranslations('Reports');
  const { formatPrice, formatStringNumbers } = useNumberFormat();
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'stock' | 'sales'>('overview');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/product-detail?productId=${productId}&days=${days}&tzOffset=${new Date().getTimezoneOffset()}`)
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
          <span>{t('current_stock')}: <strong className={Number(product.currentStock) <= Number(product.minStockLevel) ? 'text-red-600' : 'text-foreground'}>{formatStringNumbers(product.currentStock)} {product.unit}</strong></span>
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

