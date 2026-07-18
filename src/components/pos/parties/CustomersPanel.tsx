'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Phone,
  MapPin,
  IndianRupee,
  FileText,
  Edit,
  PlusCircle,
  ArrowUpFromLine,
  ShoppingBag,
} from 'lucide-react';
import type { Customer } from '@/types/pos';
import { cn } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';
import { useTranslations } from 'next-intl';
import { getInitialsBg } from './parties-utils';

interface CustomersPanelProps {
  customers: Customer[];
  formatPrice: (value: number | string | null | undefined) => string;
  onEdit: (customer: Customer) => void;
  onViewLedger: (customer: Customer) => void;
  onViewDetails: (customer: Customer) => void;
  onRecordPrepayment: (customer: Customer) => void;
  onRecordDueEntry: (customer: Customer) => void;
  onWithdraw: (customer: Customer) => void;
  onRecordPayment: (customer: Customer) => void;
}

export function CustomersPanel({
  customers,
  formatPrice,
  onEdit,
  onViewLedger,
  onViewDetails,
  onRecordPrepayment,
  onRecordDueEntry,
  onWithdraw,
  onRecordPayment,
}: CustomersPanelProps) {
  const t = useTranslations('Parties');

  if (customers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">{t('no_customers')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
      {customers.map((customer) => {
        const initials = customer.name.charAt(0).toUpperCase();
        const avatarColor = getInitialsBg(customer.name);
        const isDue = toMoneyNumber(customer.totalDue) > 0;
        const isPrepaid = toMoneyNumber(customer.prepaidBalance) > 0;

        return (
          <Card key={customer.id} className="overflow-hidden border border-border/60 hover:shadow-sm transition-all duration-300">
            <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
              {/* Top row: Avatar & details */}
              <div className="flex items-start gap-2.5 md:gap-3">
                <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-sm md:text-base shrink-0 shadow-sm", avatarColor)}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm md:text-base text-slate-800 dark:text-slate-200 truncate" title={customer.name}>{customer.name}</h3>
                  {customer.nameEn && customer.nameEn !== customer.name && (
                    <p className="text-[10px] md:text-xs text-muted-foreground/80 font-medium truncate" title={customer.nameEn}>{customer.nameEn}</p>
                  )}
                  {customer.phone ? (
                    <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span>{customer.phone}</span>
                    </p>
                  ) : (
                    <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5">{t('no_phone')}</p>
                  )}
                  {customer.address && (
                    <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate" title={customer.address}>
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{customer.address}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Middle row: Financial status */}
              <div className="grid grid-cols-2 gap-1.5 md:gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 md:p-2.5 rounded-lg md:rounded-xl border border-slate-100 dark:border-slate-800/60 text-center">
                <div>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">{t('balance_col')}</p>
                  {isPrepaid ? (
                    <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 font-bold text-[10px] md:text-xs px-1 md:px-1.5 py-0 h-5 md:h-6">
                      {formatPrice(customer.prepaidBalance)}
                    </Badge>
                  ) : (
                    <span className="text-[11px] md:text-xs text-muted-foreground font-medium">-</span>
                  )}
                </div>
                <div>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">{t('due_col')}</p>
                  {isDue ? (
                    <Badge variant="destructive" className="font-bold text-[10px] md:text-xs px-1 md:px-1.5 py-0 h-5 md:h-6">
                      {formatPrice(customer.totalDue)}
                    </Badge>
                  ) : (
                    <span className="text-[11px] md:text-xs text-muted-foreground font-medium">-</span>
                  )}
                </div>
              </div>

              {/* Bottom row: Action buttons — 2-col grid on mobile for easier taps */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center sm:justify-end gap-1.5 pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 text-xs gap-1 px-2 touch-manipulation justify-center"
                  onClick={() => onEdit(customer)}
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>{t('edit')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 text-xs gap-1 px-2 touch-manipulation justify-center"
                  onClick={() => onViewLedger(customer)}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('ledger')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 text-xs gap-1 px-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30 touch-manipulation justify-center"
                  onClick={() => onViewDetails(customer)}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span className="truncate">{t('purchase_details') || 'কেনাকাটার বিবরণ'}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 text-xs gap-1 px-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 dark:text-blue-400 border-blue-100 dark:border-blue-900/30 touch-manipulation justify-center"
                  onClick={() => onRecordPrepayment(customer)}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t('prepayment')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 text-xs gap-1 px-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30 touch-manipulation justify-center"
                  onClick={() => onRecordDueEntry(customer)}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t('due_entry')}</span>
                </Button>
                {isPrepaid && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 sm:h-8 text-xs gap-1 px-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 dark:text-orange-400 border-orange-100 dark:border-orange-900/30 touch-manipulation justify-center"
                    onClick={() => onWithdraw(customer)}
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                    <span>{t('withdraw')}</span>
                  </Button>
                )}
                {isDue && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 sm:h-8 text-xs gap-1 px-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30 touch-manipulation justify-center col-span-2 sm:col-span-1"
                    onClick={() => onRecordPayment(customer)}
                  >
                    <IndianRupee className="w-3.5 h-3.5" />
                    <span>{t('payment')}</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
