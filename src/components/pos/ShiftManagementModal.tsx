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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Clock,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Printer,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNumberFormat } from '@/hooks/use-number-format';

export interface ShiftManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShiftStatusChange?: (shift: any | null) => void;
}

export function ShiftManagementModal({
  open,
  onOpenChange,
  onShiftStatusChange,
}: ShiftManagementModalProps) {
  const { toast } = useToast();
  const { formatPrice } = useNumberFormat();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [shiftSummary, setShiftSummary] = useState<any | null>(null);

  // Open Shift Form State
  const [openingCash, setOpeningCash] = useState<string>('0');
  const [openNotes, setOpenNotes] = useState<string>('');

  // Close Shift Form State
  const [actualCash, setActualCash] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [confirmClose, setConfirmClose] = useState(false);

  // Fetch current active shift
  const fetchCurrentShift = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/shifts');
      if (!res.ok) throw new Error('Failed to check active shift');
      const data = await res.json();

      if (data.success && data.data) {
        setActiveShift(data.data);
        onShiftStatusChange?.(data.data);

        // Fetch detailed summary for active shift
        const summaryRes = await fetch(`/api/shifts/${data.data.id}`);
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          if (summaryData.success) {
            setShiftSummary(summaryData.data);
          }
        }
      } else {
        setActiveShift(null);
        setShiftSummary(null);
        onShiftStatusChange?.(null);
      }
    } catch (err: any) {
      console.error('Error fetching shift status:', err);
    } finally {
      setLoading(false);
    }
  }, [onShiftStatusChange]);

  useEffect(() => {
    if (open) {
      fetchCurrentShift();
      setConfirmClose(false);
      setActualCash('');
      setCloseNotes('');
    }
  }, [open, fetchCurrentShift]);

  // Handle Open Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatAmount = parseFloat(openingCash) || 0;
    if (floatAmount < 0) {
      toast({
        title: 'ভুল ইনপুট',
        description: 'প্রারম্ভিক ক্যাশ ঋণাত্মক হতে পারে না।',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          openingCash: floatAmount,
          notes: openNotes || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'শিফট শুরু করা সম্ভব হয়নি');
      }

      toast({
        title: 'শিফট শুরু হয়েছে!',
        description: `প্রারম্ভিক ক্যাশ: ${formatPrice(floatAmount)}`,
      });
      await fetchCurrentShift();
    } catch (err: any) {
      toast({
        title: 'ত্রুটি',
        description: err.message || 'শিফট তৈরি ব্যর্থ হয়েছে',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Close Shift
  const handleCloseShift = async () => {
    if (!activeShift) return;
    const countedCash = parseFloat(actualCash);
    if (isNaN(countedCash) || countedCash < 0) {
      toast({
        title: 'ভুল ইনপুট',
        description: 'ড্রয়ারের প্রকৃত ক্যাশ সঠিকভাবে লিখুন।',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/shifts/${activeShift.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          actualCash: countedCash,
          notes: closeNotes || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'শিফট সমাপ্ত করা সম্ভব হয়নি');
      }

      toast({
        title: 'শিফট সম্পন্ন হয়েছে!',
        description: 'শিফট সফলভাবে বন্ধ এবং ব্যালেন্স রিকনসাইল করা হয়েছে।',
      });
      setActiveShift(null);
      setShiftSummary(null);
      onShiftStatusChange?.(null);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'ত্রুটি',
        description: err.message || 'শিফট ক্লোজ করতে সমস্যা হয়েছে',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Discrepancy calculation
  const counted = parseFloat(actualCash) || 0;
  const expected = shiftSummary?.expectedCash ?? activeShift?.openingCash ?? 0;
  const discrepancy = counted - expected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              ক্যাশ রেজিস্টার শিফট
            </DialogTitle>
            {activeShift && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                শিফট চলমান
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {activeShift
              ? 'চলতি শিফটের ক্যাশ ও বিক্রয় হিসাব দেখুন এবং দিন শেষে ক্লোজ করুন।'
              : 'নতুন বিক্রয় শুরু করার পূর্বে ড্রয়ারের প্রারম্ভিক ক্যাশ দিয়ে শিফট শুরু করুন।'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">শিফট ডেটা লোড হচ্ছে...</p>
          </div>
        ) : !activeShift ? (
          /* ========================================================
             OPEN SHIFT FORM
             ======================================================== */
          <form onSubmit={handleOpenShift} className="space-y-4 pt-2">
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-primary" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">শিফট ক্যাশ ফ্লট</p>
                <p className="text-muted-foreground">আজ সকালে ড্রয়ারে কত নগদ নিয়ে ক্যাশ শুরু করছেন?</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="openingCash" className="text-xs font-semibold">
                প্রারম্ভিক ক্যাশ (Opening Float) *
              </Label>
              <div className="relative">
                <Input
                  id="openingCash"
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                  className="h-12 text-lg font-bold pr-12 rounded-xl"
                  autoFocus
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  টাকা
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="openNotes" className="text-xs font-semibold">
                মন্তব্য (ঐচ্ছিক)
              </Label>
              <Textarea
                id="openNotes"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="যেমন: খুচরা ৫০০ টাকা, ১০০ টাকার নোট ৫টি..."
                className="resize-none rounded-xl text-xs h-20"
              />
            </div>

            <DialogFooter className="pt-2 sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                বাতিল
              </Button>
              <Button type="submit" disabled={submitting} className="rounded-xl gap-2 font-semibold">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                শিফট শুরু করুন
              </Button>
            </DialogFooter>
          </form>
        ) : (
          /* ========================================================
             ACTIVE SHIFT SUMMARY & CLOSE FORM
             ======================================================== */
          <div className="space-y-4 pt-1">
            {/* Shift info card */}
            <Card className="rounded-2xl border-border/60 bg-muted/30 overflow-hidden shadow-xs">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>শুরু হয়েছে:</span>
                  <span className="font-semibold text-foreground">
                    {new Date(activeShift.openedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-background border border-border/50">
                    <span className="text-[10px] text-muted-foreground block">প্রারম্ভিক ক্যাশ</span>
                    <span className="text-sm font-bold text-foreground">
                      {formatPrice(Number(activeShift.openingCash))}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-background border border-border/50">
                    <span className="text-[10px] text-muted-foreground block">নগদ বিক্রয় (+)</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {formatPrice(shiftSummary?.cashSales ?? 0)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-background border border-border/50">
                    <span className="text-[10px] text-muted-foreground block">নগদ খরচ/তুলে নেওয়া (-)</span>
                    <span className="text-sm font-bold text-amber-600">
                      {formatPrice(shiftSummary?.cashExpenses ?? 0)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-background border border-border/50">
                    <span className="text-[10px] text-muted-foreground block">নগদ ফেরত (-)</span>
                    <span className="text-sm font-bold text-rose-600">
                      {formatPrice(shiftSummary?.cashRefunds ?? 0)}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="text-xs font-bold text-primary">প্রত্যাশিত ড্রয়ার ক্যাশ:</span>
                  <span className="text-base font-extrabold text-primary">
                    {formatPrice(expected)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Close shift inputs */}
            {!confirmClose ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="actualCash" className="text-xs font-semibold">
                    ড্রয়ারে গণনাকৃত নগদ টাকা (Counted Cash) *
                  </Label>
                  <div className="relative">
                    <Input
                      id="actualCash"
                      type="number"
                      step="any"
                      min="0"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      placeholder={expected.toString()}
                      className="h-12 text-lg font-bold pr-12 rounded-xl"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      টাকা
                    </span>
                  </div>
                </div>

                {actualCash !== '' && (
                  <div
                    className={cn(
                      'p-3 rounded-xl border flex items-center justify-between text-xs',
                      discrepancy === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                        : discrepancy > 0
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {discrepancy === 0 ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : discrepancy > 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      <span className="font-semibold">
                        {discrepancy === 0
                          ? 'হিসাব সঠিক আছে (Exact Match)'
                          : discrepancy > 0
                          ? `ক্যাশ বেশি আছে (+${formatPrice(discrepancy)})`
                          : `ক্যাশ ঘাটতি আছে (${formatPrice(discrepancy)})`}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="closeNotes" className="text-xs font-semibold">
                    সমাপ্তি মন্তব্য / হিসাবের গরমিল কারণ
                  </Label>
                  <Textarea
                    id="closeNotes"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="হিসাবে কোন অমিল থাকলে কারণ উল্লেখ করুন..."
                    className="resize-none rounded-xl text-xs h-18"
                  />
                </div>

                <DialogFooter className="pt-2 sm:justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                    বন্ধ করুন
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!actualCash) {
                        toast({
                          title: 'ক্যাশ লিখুন',
                          description: 'দয়া করে ড্রয়ারে প্রাপ্ত ক্যাশ হিসাব করে লিখুন।',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setConfirmClose(true);
                    }}
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                  >
                    শিফট সমাপ্তির প্রস্তুতি
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              /* Confirmation Screen */
              <div className="space-y-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  শিফট সমাপ্তি নিশ্চিতকরণ
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  আপনি এই শিফট বন্ধ করতে যাচ্ছেন। বন্ধ করার পর নতুন বিক্রির জন্য পুনরায় শিফট চালু করতে হবে।
                </p>

                <div className="bg-background/80 p-3 rounded-xl space-y-1.5 border border-border/50">
                  <div className="flex justify-between">
                    <span>প্রত্যাশিত ক্যাশ:</span>
                    <span className="font-bold">{formatPrice(expected)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>প্রকৃত প্রাপ্ত ক্যাশ:</span>
                    <span className="font-bold">{formatPrice(counted)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-bold">
                    <span>পার্থক্য (Discrepancy):</span>
                    <span className={discrepancy < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {formatPrice(discrepancy)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmClose(false)}
                    className="rounded-xl"
                  >
                    ফিরে যান
                  </Button>
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={handleCloseShift}
                    className="rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    হ্যাঁ, শিফট বন্ধ করুন
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
