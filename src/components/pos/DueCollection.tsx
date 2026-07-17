'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useCustomersStore } from '@/stores/pos-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNumberFormat } from '@/hooks/use-number-format';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Search,
  Phone,
  User,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Wallet,
  Banknote,
  Smartphone,
  Sparkles,
  AlertTriangle,
  ArrowDownWideNarrow,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';

interface DueCustomer {
  id: string;
  name: string;
  nameEn: string | null;
  phone: string | null;
  dueAmount: number;
  updatedAt: string;
  lastPaymentDate: string | null;
}

type ViewState = 'list' | 'form' | 'success';
type PayMethod = 'Cash' | 'UPI' | 'Mixed';
type SortMode = 'due_desc' | 'name_asc' | 'oldest';

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

export default function DueCollection() {
  const t = useTranslations('DueCollection');
  const tc = useTranslations('Common');
  const updateCustomer = useCustomersStore((s) => s.updateCustomer);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [customers, setCustomers] = useState<DueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('due_desc');
  const [selectedCustomer, setSelectedCustomer] = useState<DueCustomer | null>(null);
  const [view, setView] = useState<ViewState>('list');
  const [collectAmount, setCollectAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successData, setSuccessData] = useState<{ collected: number; remaining: number } | null>(null);
  const [collectedToday, setCollectedToday] = useState(0);

  useEffect(() => {
    if (paymentMethod === 'Mixed') {
      const cash = parseFloat(convertBengaliToEnglishNumerals(cashAmount)) || 0;
      const upi = parseFloat(convertBengaliToEnglishNumerals(upiAmount)) || 0;
      setCollectAmount(String(toMoneyNumber(cash + upi)));
    }
  }, [cashAmount, upiAmount, paymentMethod]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/due-collection');
      const data = await res.json();
      if (data.success) {
        setCustomers(
          (data.data as DueCustomer[]).map((c) => ({
            ...c,
            dueAmount: toMoneyNumber(c.dueAmount),
          })),
        );
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Optional: today's collected from ledger-ish stats — best-effort from list refresh times
  useEffect(() => {
    // Track session-local total (reset on remount is fine)
  }, []);

  const totalDue = useMemo(
    () => customers.reduce((sum, c) => sum + c.dueAmount, 0),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = customers;
    if (term) {
      list = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.nameEn && c.nameEn.toLowerCase().includes(term)) ||
          (c.phone && c.phone.includes(term)),
      );
    }
    const sorted = [...list];
    if (sortMode === 'due_desc') {
      sorted.sort((a, b) => b.dueAmount - a.dueAmount);
    } else if (sortMode === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
    } else {
      sorted.sort((a, b) => {
        const da = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
        const db = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
        return da - db;
      });
    }
    return sorted;
  }, [customers, search, sortMode]);

  const topDebtors = useMemo(
    () => [...customers].sort((a, b) => b.dueAmount - a.dueAmount).slice(0, 5),
    [customers],
  );

  const handleSelectCustomer = (customer: DueCustomer) => {
    setSelectedCustomer(customer);
    setCollectAmount('');
    setPaymentMethod('Cash');
    setNotes('');
    setCashAmount('');
    setUpiAmount('');
    setView('form');
    setTimeout(() => amountInputRef.current?.focus(), 100);
  };

  const setAmount = (amt: number) => {
    const v = toMoneyNumber(Math.min(amt, selectedCustomer?.dueAmount ?? amt));
    if (paymentMethod === 'Mixed') {
      setCashAmount(String(v));
      setUpiAmount('0');
    } else {
      setCollectAmount(String(v));
    }
  };

  const handleSetFullAmount = () => {
    if (selectedCustomer) setAmount(selectedCustomer.dueAmount);
  };

  const handleSetHalfAmount = () => {
    if (selectedCustomer) setAmount(selectedCustomer.dueAmount / 2);
  };

  const parsedAmount = toMoneyNumber(
    parseFloat(convertBengaliToEnglishNumerals(collectAmount)) || 0,
  );

  const handleSubmit = () => {
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error(t('enter_amount'));
      return;
    }
    if (selectedCustomer && parsedAmount > selectedCustomer.dueAmount + 0.001) {
      toast.error(t('amount_exceeds'));
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmCollection = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    try {
      const amount = parsedAmount;
      const methodLabel =
        paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : t('mixed');
      const finalNotes =
        paymentMethod === 'Mixed'
          ? `${notes || ''} [Cash: ${currencySymbol}${cashAmount || 0}, UPI: ${currencySymbol}${upiAmount || 0}]`.trim()
          : notes;

      const res = await fetch('/api/due-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount,
          paymentMethod: paymentMethod, // English codes for API/ledger
          notes: finalNotes || `Due collection (${methodLabel})`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = data.data.customer;
        updateCustomer(selectedCustomer.id, {
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          notes: updated.notes,
          totalDue: updated.totalDue,
          totalPaid: updated.totalPaid,
          prepaidBalance: updated.prepaidBalance,
        });
        setSuccessData({
          collected: amount,
          remaining: toMoneyNumber(data.data.remainingDue),
        });
        setCollectedToday((prev) => toMoneyNumber(prev + amount));
        setShowConfirm(false);
        setView('success');
        toast.success(t('collection_success'));
        if (navigator?.vibrate) navigator.vibrate(40);
        fetchCustomers();
      } else {
        toast.error(data.error || t('collection_failed'));
      }
    } catch {
      toast.error(t('collection_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCollectMore = () => {
    if (selectedCustomer && successData) {
      setSelectedCustomer({
        ...selectedCustomer,
        dueAmount: successData.remaining,
      });
      setCollectAmount('');
      setPaymentMethod('Cash');
      setNotes('');
      setCashAmount('');
      setUpiAmount('');
      setView('form');
      setTimeout(() => amountInputRef.current?.focus(), 100);
    }
  };

  const handleDone = () => {
    setSelectedCustomer(null);
    setSuccessData(null);
    setView('list');
  };

  const { formatPrice: formatTaka, formatNumber, formatDate, formatStringNumbers, currencySymbol } = useNumberFormat();

  if (view === 'success' && successData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4 animate-in fade-in duration-300">
        <Card className="w-full max-w-md shadow-xl border-green-200 dark:border-green-900">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-green-400/20 rounded-full animate-ping" />
                <CheckCircle2 className="h-20 w-20 text-green-500 relative z-10" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">
                {t('collection_success')}
              </h2>
              <p className="text-muted-foreground">{selectedCustomer?.name}</p>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-green-50 dark:bg-green-950/30">
                <span className="text-sm text-muted-foreground">{t('amount_collected')}</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">
                  {formatTaka(successData.collected)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30">
                <span className="text-sm text-muted-foreground">{t('remaining_due')}</span>
                <span
                  className={`text-xl font-bold tabular-nums ${
                    successData.remaining > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {successData.remaining > 0 ? formatTaka(successData.remaining) : t('all_clear')}
                </span>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              {successData.remaining > 0 && (
                <Button onClick={handleCollectMore} variant="outline" className="flex-1 h-12 font-semibold">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t('collect_more')}
                </Button>
              )}
              <Button
                onClick={handleDone}
                className="flex-1 h-12 font-semibold bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t('done')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === 'form' && selectedCustomer) {
    const amount = parsedAmount;
    const remaining = toMoneyNumber(selectedCustomer.dueAmount - amount);
    const isValid = amount > 0 && amount <= selectedCustomer.dueAmount + 0.001;
    const ageDays = daysSince(selectedCustomer.lastPaymentDate);

    return (
      <div className="flex-1 overflow-y-auto w-full h-full pb-8">
        <div className="space-y-4 p-4 md:p-6 max-w-2xl mx-auto animate-in slide-in-from-right-2 duration-300">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setView('list');
                setSelectedCustomer(null);
              }}
              className="shrink-0 h-11 w-11"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{t('collect_amount')}</h1>
              <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>

          <Card className="border-orange-200 dark:border-orange-900 bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <User className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{selectedCustomer.name}</h3>
                  {selectedCustomer.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {selectedCustomer.phone}
                    </p>
                  )}
                  {ageDays !== null && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {t('last_payment')}: {ageDays === 0 ? t('today') || 'Today' : `${ageDays}d`}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{t('due_amount')}</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                    {formatTaka(selectedCustomer.dueAmount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <Label className="text-sm font-medium">{t('collect_amount')}</Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                    {currencySymbol}
                  </span>
                  <Input
                    ref={amountInputRef}
                    type="text"
                    inputMode="decimal"
                    value={collectAmount}
                    onChange={(e) =>
                      setCollectAmount(convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, ''))
                    }
                    placeholder={t('enter_amount')}
                    className="pl-9 text-2xl font-bold h-14"
                    readOnly={paymentMethod === 'Mixed'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isValid) handleSubmit();
                    }}
                  />
                </div>
              </div>

              {/* Full / half */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-10" onClick={handleSetFullAmount}>
                  <Wallet className="h-3.5 w-3.5" />
                  {t('collect_full')}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-10" onClick={handleSetHalfAmount}>
                  {t('collect_half')}
                </Button>
              </div>

              {/* Quick cash chips */}
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.filter((q) => q <= selectedCustomer.dueAmount).map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9 px-3 tabular-nums"
                    onClick={() => setAmount(q)}
                  >
                    {currencySymbol}{formatStringNumbers(q)}
                  </Button>
                ))}
              </div>

              {amount > 0 && isValid && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <span className="text-sm text-muted-foreground">{t('remaining_due')}</span>
                  <span className={`font-bold tabular-nums ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatTaka(remaining)}
                  </span>
                </div>
              )}

              {amount > selectedCustomer.dueAmount && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t('amount_exceeds')}
                </div>
              )}

              <Separator />

              <div>
                <Label className="text-sm font-medium">{t('payment_method')}</Label>
                <div className="flex gap-2 mt-1.5">
                  {(
                    [
                      { id: 'Cash' as const, icon: Banknote, label: t('cash') },
                      { id: 'UPI' as const, icon: Smartphone, label: t('upi') },
                      { id: 'Mixed' as const, icon: Sparkles, label: t('mixed') },
                    ] as const
                  ).map(({ id, icon: Icon, label }) => (
                    <Button
                      key={id}
                      variant={paymentMethod === id ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 gap-1.5 h-11"
                      onClick={() => {
                        setPaymentMethod(id);
                        if (id === 'Mixed') {
                          setCashAmount('');
                          setUpiAmount('');
                        }
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'Mixed' && (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('cash')}</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={cashAmount}
                      onChange={(e) =>
                        setCashAmount(convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, ''))
                      }
                      placeholder={t('cash')}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('upi')}</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={upiAmount}
                      onChange={(e) =>
                        setUpiAmount(convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, ''))
                      }
                      placeholder={t('upi')}
                      className="h-11"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">{t('notes')}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('notes_placeholder')}
                  className="mt-1.5 resize-none"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full h-14 text-lg font-bold shadow-lg bg-orange-600 hover:bg-orange-700"
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            {isValid ? formatTaka(amount) : formatTaka(0)} · {t('collect')}
          </Button>

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  {t('confirm_collection')}
                </DialogTitle>
                <DialogDescription>
                  {t('confirm_message', { amount: formatTaka(amount) })}
                </DialogDescription>
              </DialogHeader>
              <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tc('name')}</span>
                  <span className="font-medium">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('due_amount')}</span>
                  <span className="font-medium text-orange-600 tabular-nums">
                    {formatTaka(selectedCustomer.dueAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('collect_amount')}</span>
                  <span className="font-bold text-green-600 tabular-nums">{formatTaka(amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('payment_method')}</span>
                  <span className="font-medium">
                    {paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : t('mixed')}
                  </span>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
                  {tc('cancel')}
                </Button>
                <Button
                  onClick={handleConfirmCollection}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t('collect')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  // —— LIST VIEW ——
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full space-y-4 p-4 md:p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => fetchCustomers()}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {tc('refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="shadow-md overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground truncate">{t('total_collectable')}</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">
              {formatTaka(totalDue)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground truncate">{t('customers_with_due')}</p>
            <p className="text-lg font-bold tabular-nums">{formatNumber(customers.length)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-md overflow-hidden col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground truncate">{t('collected_today')}</p>
            <p className="text-lg font-bold text-green-600 tabular-nums">{formatTaka(collectedToday)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top debtors quick-pick */}
      {topDebtors.length > 0 && !search && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('top_dues') || 'Top dues'}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {topDebtors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCustomer(c)}
                className="shrink-0 rounded-xl border bg-card px-3 py-2 text-left hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-300 transition-colors min-w-[140px]"
              >
                <p className="text-sm font-semibold truncate max-w-[160px]">{c.name}</p>
                <p className="text-sm font-bold text-orange-600 tabular-nums">{formatTaka(c.dueAmount)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('search_customer')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
            autoComplete="off"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { id: 'due_desc' as const, label: t('sort_due') || 'Due' },
              { id: 'name_asc' as const, label: t('sort_name') || 'Name' },
              { id: 'oldest' as const, label: t('sort_oldest') || 'Oldest' },
            ] as const
          ).map((s) => (
            <Button
              key={s.id}
              type="button"
              size="sm"
              variant={sortMode === s.id ? 'default' : 'outline'}
              className="h-11 gap-1"
              onClick={() => setSortMode(s.id)}
            >
              {s.id === 'due_desc' && <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">{t('all_clear')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('no_customers_with_due')}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid grid-cols-1 gap-2 pb-4 pr-2">
            {filteredCustomers.map((customer, idx) => {
              const age = daysSince(customer.lastPaymentDate);
              const isTop = idx < 3 && sortMode === 'due_desc' && !search;
              return (
                <button
                  key={customer.id}
                  type="button"
                  className={cn(
                    'w-full text-left p-4 rounded-xl border bg-card hover:shadow-md transition-all touch-feedback',
                    isTop && 'border-orange-300/80 dark:border-orange-800',
                  )}
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-11 w-11 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{customer.name}</h3>
                        {isTop && (
                          <Badge variant="secondary" className="text-[10px] h-5">
                            TOP
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                        {customer.phone && (
                          <span className="flex items-center gap-0.5">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </span>
                        )}
                        {age !== null && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {age === 0 ? (t('today') || 'Today') : `${age}d`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="destructive" className="text-sm font-bold px-3 py-1 tabular-nums">
                        {formatTaka(customer.dueAmount)}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">{t('collect')} →</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
