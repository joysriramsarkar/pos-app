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
} from 'lucide-react';
import type { Supplier } from '@/types/pos';
import { cn } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';
import { useTranslations } from 'next-intl';
import { getInitialsBg } from './parties-utils';
import type { SupplierWithBalances } from './types';

interface SuppliersPanelProps {
  suppliers: Supplier[];
  formatPrice: (value: number | string | null | undefined) => string;
  onEdit: (supplier: Supplier) => void;
  onViewLedger: (supplier: Supplier) => void;
  onRecordDueEntry: (supplier: Supplier) => void;
  onRecordPayment: (supplier: Supplier) => void;
}

export function SuppliersPanel({
  suppliers,
  formatPrice,
  onEdit,
  onViewLedger,
  onRecordDueEntry,
  onRecordPayment,
}: SuppliersPanelProps) {
  const t = useTranslations('Parties');

  if (suppliers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">{t('no_suppliers')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
      {suppliers.map((supplier) => {
        const s = supplier as SupplierWithBalances;
        const initials = supplier.name.charAt(0).toUpperCase();
        const avatarColor = getInitialsBg(supplier.name);
        const isDue = toMoneyNumber(s.totalDue || 0) > 0;

        return (
          <Card key={supplier.id} className="overflow-hidden border border-border/60 hover:shadow-md transition-all duration-300">
            <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
              {/* Top row: Avatar & details */}
              <div className="flex items-start gap-2.5 md:gap-3">
                <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-sm md:text-base shrink-0 shadow-sm", avatarColor)}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm md:text-base text-slate-800 dark:text-slate-200 truncate" title={supplier.name}>{supplier.name}</h3>
                  {supplier.nameEn && supplier.nameEn !== supplier.name && (
                    <p className="text-[10px] md:text-xs text-muted-foreground/80 font-medium truncate" title={supplier.nameEn}>{supplier.nameEn}</p>
                  )}
                  {supplier.phone ? (
                    <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span>{supplier.phone}</span>
                    </p>
                  ) : (
                    <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5">{t('no_phone')}</p>
                  )}
                  {supplier.address && (
                    <p className="text-[11px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate" title={supplier.address}>
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{supplier.address}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Middle row: Financial status */}
              <div className="grid grid-cols-3 gap-1.5 md:gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 md:p-2.5 rounded-lg md:rounded-xl border border-slate-100 dark:border-slate-800/60 text-center text-xs">
                <div>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">মোট ক্রয়</p>
                  <span className="font-semibold text-[11px] md:text-xs text-slate-700 dark:text-slate-355">{formatPrice(s.totalPurchases || 0)}</span>
                </div>
                <div>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">পরিশোধ</p>
                  <span className="font-semibold text-[11px] md:text-xs text-emerald-600 dark:text-emerald-400">{formatPrice(s.totalPaid || 0)}</span>
                </div>
                <div>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">বকেয়া</p>
                  {isDue ? (
                    <Badge variant="destructive" className="font-bold text-[10px] md:text-xs px-1 md:px-1.5 py-0 h-5 md:h-6">
                      {formatPrice(s.totalDue || 0)}
                    </Badge>
                  ) : (
                    <span className="text-[11px] md:text-xs text-muted-foreground font-medium">-</span>
                  )}
                </div>
              </div>

              {/* Bottom row: Action buttons */}
              <div className="flex flex-wrap items-center justify-end gap-1 md:gap-1.5 pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-850"
                  onClick={() => onEdit(supplier)}
                >
                  <Edit className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  <span>{t('edit')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 hover:bg-slate-100 dark:hover:bg-slate-850"
                  onClick={() => onViewLedger(supplier)}
                >
                  <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  <span>লেজার</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30"
                  onClick={() => onRecordDueEntry(supplier)}
                >
                  <PlusCircle className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  <span>বাকি এন্ট্রি</span>
                </Button>
                {isDue && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 md:h-8 text-[11px] md:text-xs gap-1 px-2 md:px-3 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30"
                    onClick={() => onRecordPayment(supplier)}
                  >
                    <IndianRupee className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    <span>পরিশোধ</span>
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
