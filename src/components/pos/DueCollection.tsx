'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

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

export default function DueCollection() {
  const t = useTranslations('DueCollection');
  const tc = useTranslations('Common');
  const updateCustomer = useCustomersStore((s) => s.updateCustomer);

  const [customers, setCustomers] = useState<DueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<DueCustomer | null>(null);
  const [view, setView] = useState<ViewState>('list');
  const [collectAmount, setCollectAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('নগদ');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successData, setSuccessData] = useState<{ collected: number; remaining: number } | null>(null);

  useEffect(() => {
    if (paymentMethod === 'মিশ্র') {
      const cash = parseFloat(cashAmount) || 0;
      const upi = parseFloat(upiAmount) || 0;
      setCollectAmount(String(cash + upi));
    }
  }, [cashAmount, upiAmount, paymentMethod]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/due-collection');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
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

  const totalDue = customers.reduce((sum, c) => sum + c.dueAmount, 0);

  const filteredCustomers = customers.filter((c) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.nameEn && c.nameEn.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term))
    );
  });

  const handleSelectCustomer = (customer: DueCustomer) => {
    setSelectedCustomer(customer);
    setCollectAmount('');
    setPaymentMethod('নগদ');
    setNotes('');
    setCashAmount('');
    setUpiAmount('');
    setView('form');
  };

  const handleSetFullAmount = () => {
    if (selectedCustomer) {
      const amt = selectedCustomer.dueAmount;
      if (paymentMethod === 'মিশ্র') {
        setCashAmount(String(amt));
        setUpiAmount('0');
      } else {
        setCollectAmount(String(amt));
      }
    }
  };

  const handleSetHalfAmount = () => {
    if (selectedCustomer) {
      const amt = selectedCustomer.dueAmount / 2;
      if (paymentMethod === 'মিশ্র') {
        setCashAmount(String(amt));
        setUpiAmount('0');
      } else {
        setCollectAmount(String(amt));
      }
    }
  };

  const handleSubmit = () => {
    const amount = parseFloat(collectAmount);
    if (!amount || amount <= 0) {
      toast.error(t('enter_amount'));
      return;
    }
    if (selectedCustomer && amount > selectedCustomer.dueAmount) {
      toast.error(t('amount_exceeds'));
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmCollection = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    try {
      const amount = parseFloat(collectAmount);
      const finalNotes = paymentMethod === 'মিশ্র'
        ? `${notes || ''} [নগদ: ৳${cashAmount || 0}, ইউপিআই: ৳${upiAmount || 0}]`.trim()
        : notes;
      const res = await fetch('/api/due-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount,
          paymentMethod,
          notes: finalNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Map Decimal fields to fit target format if necessary
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
          remaining: data.data.remainingDue,
        });
        setShowConfirm(false);
        setView('success');
        toast.success(t('collection_success'));
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
      setPaymentMethod('নগদ');
      setNotes('');
      setCashAmount('');
      setUpiAmount('');
      setView('form');
    }
  };

  const handleDone = () => {
    setSelectedCustomer(null);
    setSuccessData(null);
    setView('list');
  };

  const { formatPrice: formatTaka, formatNumber, formatDate } = useNumberFormat();

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
                <span className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatTaka(successData.collected)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30">
                <span className="text-sm text-muted-foreground">{t('remaining_due')}</span>
                <span className={`text-xl font-bold ${successData.remaining > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                  {successData.remaining > 0 ? formatTaka(successData.remaining) : t('all_clear')}
                </span>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              {successData.remaining > 0 && (
                <Button
                  onClick={handleCollectMore}
                  variant="outline"
                  className="flex-1 h-12 font-semibold"
                >
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
    const amount = parseFloat(collectAmount) || 0;
    const remaining = selectedCustomer.dueAmount - amount;
    const isValid = amount > 0 && amount <= selectedCustomer.dueAmount;

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
              className="shrink-0"
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
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{t('due_amount')}</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
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
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">৳</span>
                  <Input
                    type="number"
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    placeholder={t('enter_amount')}
                    className="pl-9 text-lg font-semibold h-12"
                    max={selectedCustomer.dueAmount}
                    min={0}
                    readOnly={paymentMethod === 'মিশ্র'}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleSetFullAmount}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {t('collect_full')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleSetHalfAmount}
                >
                  {t('collect_half')}
                </Button>
              </div>

              {amount > 0 && isValid && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <span className="text-sm text-muted-foreground">{t('remaining_due')}</span>
                  <span className={`font-bold ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
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
                  <Button
                    variant={paymentMethod === 'নগদ' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => setPaymentMethod('নগদ')}
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    {t('cash')}
                  </Button>
                  <Button
                    variant={paymentMethod === 'ইউপিআই' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => setPaymentMethod('ইউপিআই')}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    {t('upi')}
                  </Button>
                  <Button
                    variant={paymentMethod === 'মিশ্র' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      setPaymentMethod('মিশ্র');
                      setCashAmount('');
                      setUpiAmount('');
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('mixed')}
                  </Button>
                </div>
              </div>

              {paymentMethod === 'মিশ্র' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">নগদ পরিমাণ</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      placeholder="নগদ"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">ইউপিআই পরিমাণ</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={upiAmount}
                      onChange={(e) => setUpiAmount(e.target.value)}
                      placeholder="ইউপিআই"
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
            className="w-full h-14 text-lg font-bold shadow-lg"
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            ৳ {isValid ? formatTaka(amount) : '৳০'} {t('collect')}
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
              {selectedCustomer && (
                <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tc('name')}</span>
                    <span className="font-medium">{selectedCustomer.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('due_amount')}</span>
                    <span className="font-medium text-orange-600">{formatTaka(selectedCustomer.dueAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('collect_amount')}</span>
                    <span className="font-bold text-green-600">{formatTaka(amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('payment_method')}</span>
                    <span className="font-medium">{paymentMethod}</span>
                  </div>
                </div>
              )}
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

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full space-y-4 p-4 md:p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-md overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{t('total_due')}</p>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                  {formatTaka(totalDue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-md">
                <User className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{t('customers_with_due')}</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatNumber(customers.length)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_customer')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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
        <ScrollArea className="max-h-[calc(100vh-360px)]">
          <div className="grid grid-cols-1 md:flex md:flex-col gap-3 md:gap-2">
            {/* Mobile Card Layout */}
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="block md:hidden p-3 rounded-xl border border-border/60 bg-card hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{customer.name}</h3>
                    {customer.nameEn && customer.nameEn !== customer.name && (
                      <p className="text-[10px] text-muted-foreground/80 font-medium truncate">{customer.nameEn}</p>
                    )}
                    {customer.phone ? (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{customer.phone}</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-0.5">কোনো ফোন নেই</p>
                    )}
                    {customer.lastPaymentDate && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        সর্বশেষ পেমেন্ট: {formatDate(new Date(customer.lastPaymentDate))}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">বকেয়া</p>
                    <Badge variant="destructive" className="text-xs font-bold px-2 py-0.5 h-6">
                      {formatTaka(customer.dueAmount)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-border/40">
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white dark:bg-orange-500 dark:hover:bg-orange-600"
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    বকেয়া আদায়
                  </Button>
                </div>
              </div>
            ))}

            {/* Desktop Row Layout */}
            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                className="hidden md:flex w-full text-left p-4 rounded-xl border bg-card hover:bg-muted/50 hover:shadow-md transition-all duration-200 touch-feedback group"
                onClick={() => handleSelectCustomer(customer)}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="h-11 w-11 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0 group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50 transition-colors">
                    <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{customer.name}</h3>
                      {customer.phone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </span>
                      )}
                    </div>
                    {customer.nameEn && customer.nameEn !== customer.name && (
                      <p className="text-[10px] text-muted-foreground/80 font-medium truncate mt-0.5">{customer.nameEn}</p>
                    )}
                    {customer.lastPaymentDate && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(new Date(customer.lastPaymentDate))}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge
                      variant="destructive"
                      className="text-sm font-bold px-3 py-1"
                    >
                      {formatTaka(customer.dueAmount)}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
