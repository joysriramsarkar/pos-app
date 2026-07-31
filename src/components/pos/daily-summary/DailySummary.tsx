'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Printer,
  X,
  TrendingUp,
  Wallet,
  CreditCard,
  ArrowUpRight,
  CircleDollarSign,
  Package,
  AlertTriangle,
  ShoppingCart,
  Smartphone,
  Banknote,
  Scale,
  Store,
} from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';

import type {
  DailySummaryProps,
  DailySummaryData,
} from './types';
import { SectionCard, MetricItem, DailySummarySkeleton } from './sections';

export type { DailySummaryProps } from './types';

export function DailySummary({ open, onOpenChange }: DailySummaryProps) {
  const t = useTranslations('DailySummary');
  const settings = useSettingsStore((s) => s.settings);
  const [data, setData] = useState<DailySummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  const { formatPrice: formatTaka, formatNumber, isBn } = useNumberFormat();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/daily-summary');
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch daily summary:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const paymentMethods = [
    { key: 'নগদ' as const, icon: Banknote, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', label: t('cash') },
    { key: 'ইউপিআই' as const, icon: Smartphone, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', label: t('upi') },
    { key: 'মিশ্র' as const, icon: CreditCard, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', label: t('mixed') },
    { key: 'বাকি' as const, icon: Wallet, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', label: t('due') },
  ];

  const expenseCategoryLabels: Record<string, string> = {
    ভাড়া: 'ভাড়া',
    ইউটিলিটি: 'ইউটিলিটি',
    বেতন: 'বেতন',
    সামগ্রী: 'সামগ্রী',
    রক্ষণাবেক্ষণ: 'রক্ষণাবেক্ষণ',
    অন্যান্য: 'অন্যান্য',
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('end_of_day')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div id="receipt-content" className="py-2 space-y-4">
            {loading ? (
              <DailySummarySkeleton />
            ) : data ? (
              <>
                {/* Report Header */}
                <div className="text-center space-y-1 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 dark:from-primary/20 dark:via-primary/10 dark:to-primary/20 rounded-xl p-4">
                  <h2 className="text-xl font-bold text-primary">
                    {settings.store_name_bn || 'লক্ষ্মণ ভাণ্ডার'}
                  </h2>
                  <p className="text-lg font-semibold text-foreground">{t('daily_summary_of')}</p>
                  <p className="text-sm text-muted-foreground font-medium">{data.date}</p>
                  {settings.store_address && (
                    <p className="text-xs text-muted-foreground">{settings.store_address}</p>
                  )}
                </div>

                {/* Sales Summary Section */}
                <SectionCard
                  icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
                  iconBg="bg-green-100 dark:bg-green-900/30"
                  title={t('sales_summary')}
                  gradient="from-green-50/50 to-transparent dark:from-green-950/20 dark:to-transparent"
                  delay={0}
                >
                  <div className="grid grid-cols-3 gap-3">
                    <MetricItem label={t('total_sales')} value={formatTaka(data.totalSalesAmount)} color="text-green-600 dark:text-green-400" />
                    <MetricItem label={t('total_orders')} value={formatNumber(data.totalSalesCount) + ' ' + t('count')} color="text-green-600 dark:text-green-400" />
                    <MetricItem label={t('avg_order')} value={formatTaka(data.avgOrderValue)} color="text-green-600 dark:text-green-400" />
                  </div>
                </SectionCard>

                {/* Purchases Summary Section */}
                <SectionCard
                  icon={<Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
                  iconBg="bg-orange-100 dark:bg-orange-900/30"
                  title={t('purchases_summary')}
                  gradient="from-orange-50/50 to-transparent dark:from-orange-950/20 dark:to-transparent"
                  delay={1}
                >
                  <div className="grid grid-cols-1">
                    <MetricItem label={t('total_purchases')} value={formatTaka(data.totalPurchasesAmount || 0)} color="text-orange-600 dark:text-orange-400" />
                  </div>
                </SectionCard>

                {/* Payment Details Section */}
                <SectionCard
                  icon={<CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                  iconBg="bg-blue-100 dark:bg-blue-900/30"
                  title={t('payment_details')}
                  gradient="from-blue-50/50 to-transparent dark:from-blue-950/20 dark:to-transparent"
                  delay={1}
                >
                  <div className="space-y-2.5">
                    {paymentMethods.map((method) => {
                      const bd = data.paymentBreakdown[method.key];
                      const amount = bd?.amount ?? 0;
                      const count = bd?.count ?? 0;
                      const percentage = data.totalSalesAmount > 0 ? ((amount / data.totalSalesAmount) * 100).toFixed(1) : '0';
                      const Icon = method.icon;
                      return (
                        <div key={method.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-background/60 border border-border/30">
                          <div className={`h-8 w-8 rounded-lg ${method.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`h-4 w-4 ${method.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{method.label}</span>
                              <span className="text-sm font-bold">{formatTaka(amount)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-xs text-muted-foreground">{formatNumber(count)} {t('count')}</span>
                              <span className="text-xs text-muted-foreground">{formatNumber(parseFloat(percentage))}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted dark:bg-muted/60 overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  method.key === 'নগদ' ? 'bg-green-500' :
                                  method.key === 'ইউপিআই' ? 'bg-blue-500' :
                                  method.key === 'মিশ্র' ? 'bg-purple-500' : 'bg-orange-500'
                                }`}
                                style={{ width: `${Math.min(parseFloat(percentage), 100)}%` }}
                                
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Expense Details Section */}
                <SectionCard
                  icon={<ArrowUpRight className="h-4 w-4 text-red-600 dark:text-red-400" />}
                  iconBg="bg-red-100 dark:bg-red-900/30"
                  title={t('expense_details')}
                  gradient="from-red-50/50 to-transparent dark:from-red-950/20 dark:to-transparent"
                  delay={2}
                >
                  <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/50 dark:border-red-800/30">
                    <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('expense_details')}</p>
                      <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatTaka(data.totalExpenses)}</p>
                    </div>
                  </div>
                  {Object.keys(data.expenseByCategory).length > 0 && (
                    <div className="space-y-1.5">
                      {Object.entries(data.expenseByCategory).map(([cat, amount]) => (
                        <div key={cat} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-md bg-muted/30">
                          <span className="text-muted-foreground">{expenseCategoryLabels[cat] || cat}</span>
                          <span className="font-medium">{formatTaka(amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Profit Section */}
                <SectionCard
                  icon={<CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                  iconBg="bg-emerald-100 dark:bg-emerald-900/30"
                  title={t('profit_section')}
                  gradient="from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent"
                  delay={3}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <span className="text-muted-foreground">{t('total_sales')}</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{formatTaka(data.totalSalesAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <span className="text-muted-foreground">{t('cost_of_goods')}</span>
                      <span className="font-medium text-red-600 dark:text-red-400">−{formatTaka(data.costOfGoodsSold)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30">
                      <span className="font-medium">{t('gross_profit')}</span>
                      <span className={`font-bold ${data.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatTaka(data.grossProfit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <span className="text-muted-foreground">{t('expenses_deducted')}</span>
                      <span className="font-medium text-red-600 dark:text-red-400">−{formatTaka(data.totalExpenses)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40 border border-emerald-200/50 dark:border-emerald-800/30">
                      <span className="font-bold">{t('net_profit')}</span>
                      <span className={`text-xl font-bold ${data.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatTaka(data.netProfit)}
                      </span>
                    </div>
                  </div>
                </SectionCard>

                {/* Due Collection Section */}
                <SectionCard
                  icon={<Wallet className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
                  iconBg="bg-orange-100 dark:bg-orange-900/30"
                  title={t('due_collection')}
                  gradient="from-orange-50/50 to-transparent dark:from-orange-950/20 dark:to-transparent"
                  delay={4}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200/50 dark:border-green-800/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('dues_collected')}</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatTaka(data.duesCollected)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-800/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('new_dues')}</p>
                      <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatTaka(data.newDuesCreated)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                    <span className="text-muted-foreground">{t('customer_dues_total')}</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">{formatTaka(data.totalCustomerDues)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                    <span className="text-muted-foreground">{t('customers_with_due')}</span>
                    <span className="font-semibold">{formatNumber(data.customersWithDueCount)} {t('count')}</span>
                  </div>
                </SectionCard>

                {/* Top Products Section */}
                <SectionCard
                  icon={<ShoppingCart className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
                  iconBg="bg-teal-100 dark:bg-teal-900/30"
                  title={t('top_products')}
                  gradient="from-teal-50/50 to-transparent dark:from-teal-950/20 dark:to-transparent"
                  delay={5}
                >
                  {data.topProducts.length > 0 ? (
                    <div className="space-y-1.5">
                      {data.topProducts.map((product, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                            {formatNumber(idx + 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{isBn ? (product.nameBn || product.name) : (product.name || product.nameBn)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">{formatTaka(product.revenue)}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(product.quantity)} {t('sold')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('no_data')}</p>
                  )}
                </SectionCard>

                {/* Stock Alerts Section */}
                <SectionCard
                  icon={<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                  iconBg="bg-amber-100 dark:bg-amber-900/30"
                  title={t('stock_alerts')}
                  gradient="from-amber-50/50 to-transparent dark:from-amber-950/20 dark:to-transparent"
                  delay={6}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/50 dark:border-red-800/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('out_of_stock_count')}</p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatNumber(data.outOfStockCount)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('low_stock_count')}</p>
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatNumber(data.lowStockCount)}</p>
                    </div>
                  </div>
                  {data.lowStockProducts.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {data.lowStockProducts.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs p-1.5 rounded-md bg-muted/30">
                          <span className="truncate">{p.nameBn || p.name}</span>
                          <Badge variant={p.currentStock === 0 ? 'destructive' : 'secondary'} className="text-[10px] ml-2 shrink-0">
                            {p.currentStock === 0 ? t('out_of_stock') : `${p.currentStock}`}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.lowStockCount === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">{t('all_stocked')}</p>
                  )}
                </SectionCard>

                {/* Balance Summary Section */}
                <SectionCard
                  icon={<Scale className="h-4 w-4 text-primary" />}
                  iconBg="bg-primary/10"
                  title={t('balance_summary')}
                  gradient="from-primary/5 to-transparent dark:from-primary/10 dark:to-transparent"
                  delay={7}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <span className="text-muted-foreground">{t('opening_balance')}</span>
                      <span className="font-medium">{formatTaka(data.openingBalance)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-green-50/50 dark:bg-green-950/20">
                      <span className="text-muted-foreground">+ {t('today_cash')}</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{formatTaka(data.todayCashTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20">
                      <span className="text-muted-foreground">+ {t('today_upi')}</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{formatTaka(data.todayUpiTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-red-50/50 dark:bg-red-950/20">
                      <span className="text-muted-foreground">− {t('expense_details')}</span>
                      <span className="font-medium text-red-600 dark:text-red-400">{formatTaka(data.totalExpenses)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border border-primary/20">
                      <span className="font-bold">{t('closing_balance')}</span>
                      <span className="text-xl font-bold text-primary">{formatTaka(data.closingBalance)}</span>
                    </div>
                  </div>
                </SectionCard>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">{t('no_data')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons with Liquid Glass Effect */}
        <div className="flex gap-3 mt-4 liquid-glass-panel no-print shrink-0">
          <Button
            className="flex-1 h-12 bg-primary/90 hover:bg-primary dark:bg-primary/80 dark:hover:bg-primary text-primary-foreground backdrop-blur-md shadow-md font-semibold transition-all active:scale-[0.98] rounded-full"
            onClick={handlePrint}
            disabled={loading || !data}
          >
            <Printer className="h-5 w-5 mr-2" />
            {t('print_report')}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 bg-background/50 hover:bg-accent/70 backdrop-blur-md border-slate-200/80 dark:border-slate-800/80 transition-all active:scale-[0.98] rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5 mr-2" />
            {t('close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Section Card Component

export default DailySummary;
