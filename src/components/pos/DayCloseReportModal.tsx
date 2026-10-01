'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarCheck,
  Printer,
  Share2,
  DollarSign,
  TrendingUp,
  Banknote,
  Receipt,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import { cn } from '@/lib/utils';

export interface DayCloseReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName?: string;
}

export function DayCloseReportModal({
  open,
  onOpenChange,
  businessName = 'আমার দোকান',
}: DayCloseReportModalProps) {
  const { toast } = useToast();
  const { formatPrice } = useNumberFormat();

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);

  const fetchDailySummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/daily-summary');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `হিসাব লোড করতে সমস্যা হয়েছে (স্ট্যাটাস: ${res.status})`);
      }
      if (data?.data) {
        setSummary(data.data);
      }
    } catch (err: any) {
      toast({
        title: 'হিসাব লোড ত্রুটি',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchDailySummary();
    }
  }, [open, fetchDailySummary]);

  // WhatsApp Share text generator
  const handleShareWhatsApp = () => {
    if (!summary) return;
    const dateStr = new Date().toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const todaySales = summary.todaySalesTotal ?? summary.totalSalesAmount ?? 0;
    const salesCount = summary.salesCount ?? summary.totalSalesCount ?? 0;
    const expenses = summary.todayExpensesNonSupplier ?? summary.totalExpenses ?? 0;

    const text =
      `*📊 দৈনিক সমাপ্তি প্রতিবেদন (Z-Report)*\n` +
      `🏪 *${businessName}*\n` +
      `📅 তারিখ: ${dateStr}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 *মোট বিক্রয়:* ${formatPrice(todaySales)}\n` +
      `💵 নগদ বিক্রয়: ${formatPrice(summary.todayCashTotal || 0)}\n` +
      `📱 ডিজিটাল (UPI): ${formatPrice(summary.todayUpiTotal || 0)}\n` +
      `📑 নতুন বাকি: ${formatPrice(summary.newDuesCreated || 0)}\n` +
      `📥 বাকি আদায়: ${formatPrice(summary.duesCollected || 0)}\n` +
      `💸 মোট খরচ: ${formatPrice(expenses)}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📈 *দৈনিক নিট লাভ:* ${formatPrice(summary.netProfit || 0)}\n` +
      `🏦 *ড্রয়ার ক্যাশ:* ${formatPrice(summary.todayCashTotal || 0)}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `_লখন ভাণ্ডার পিওএস সিস্টেম_`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Browser Print Thermal Z-Report
  const handlePrintZReport = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary" />
              দিনের সমাপ্তি (Closing the Day)
            </DialogTitle>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              Z-Report
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            আজকের সারাদিনের সর্বমোট বিক্রয়, ক্যাশ সংগ্রহ এবং নিট লাভের সারসংক্ষেপ।
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">আজকের হিসাব সমন্বয় করা হচ্ছে...</p>
          </div>
        ) : summary ? (
          <div className="space-y-4 pt-1">
            {/* Top Net Revenue Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground block">আজকের মোট বিক্রয়</span>
                <span className="text-2xl font-black text-foreground">
                  {formatPrice(summary.todaySalesTotal ?? summary.totalSalesAmount ?? 0)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  মোট চালান: {summary.salesCount ?? summary.totalSalesCount ?? 0}টি
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">আজকের নিট লাভ</span>
                <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatPrice(summary.netProfit || 0)}
                </span>
              </div>
            </div>

            {/* Detailed Breakdown Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-card border border-border/60">
                <span className="text-muted-foreground block text-[10px]">নগদ আদায় (Cash)</span>
                <span className="text-sm font-bold text-foreground">
                  {formatPrice(summary.todayCashTotal || 0)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/60">
                <span className="text-muted-foreground block text-[10px]">ইউপিআই / ব্যাংক</span>
                <span className="text-sm font-bold text-foreground">
                  {formatPrice(summary.todayUpiTotal || 0)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/60">
                <span className="text-muted-foreground block text-[10px]">আজকের বাকি তৈরি</span>
                <span className="text-sm font-bold text-amber-600">
                  {formatPrice(summary.newDuesCreated || 0)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/60">
                <span className="text-muted-foreground block text-[10px]">পুরোনো বাকি আদায়</span>
                <span className="text-sm font-bold text-emerald-600">
                  {formatPrice(summary.duesCollected || 0)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/60">
                <span className="text-muted-foreground block text-[10px]">দোকানের খরচ (-)</span>
                <span className="text-sm font-bold text-rose-600">
                  {formatPrice(summary.todayExpensesNonSupplier ?? summary.totalExpenses ?? 0)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/60">
                <span className="text-muted-foreground block text-[10px]">সাপ্লায়ার পেমেন্ট</span>
                <span className="text-sm font-bold text-foreground">
                  {formatPrice(summary.todaySupplierPayments || 0)}
                </span>
              </div>
            </div>

            <Separator />

            {/* Final Cash in Drawer reconciliation */}
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 font-bold">
                <Banknote className="w-4 h-4 text-emerald-600" />
                ড্রয়ারে প্রকৃত ক্যাশ থাকা উচিত:
              </span>
              <span className="text-base font-extrabold">
                {formatPrice(summary.todayCashTotal || 0)}
              </span>
            </div>
          </div>
        ) : (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-xs text-muted-foreground">দৈনিক সারাংশ লোড করা সম্ভব হয়নি।</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchDailySummary}
              className="rounded-xl gap-2 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              পুনরায় চেষ্টা করুন
            </Button>
          </div>
        )}

        <DialogFooter className="pt-3 sm:justify-between gap-2 border-t border-border/40 mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleShareWhatsApp}
            disabled={!summary}
            className="rounded-xl gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>হোয়াটসঅ্যাপে পাঠান</span>
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrintZReport}
              disabled={!summary}
              className="rounded-xl gap-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>প্রিন্ট Z-Report</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs font-semibold"
            >
              সম্পন্ন
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
