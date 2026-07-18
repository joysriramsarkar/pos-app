'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Phone,
  User,
  CheckCircle2,
  Loader2,
  ArrowDownWideNarrow,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DueCustomer, SortMode } from './types';
import { daysSince } from './utils';

export interface CustomerListProps {
  customers: DueCustomer[];
  filteredCustomers: DueCustomer[];
  topDebtors: DueCustomer[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  sortMode: SortMode;
  onSortModeChange: (m: SortMode) => void;
  totalDue: number;
  collectedToday: number;
  formatTaka: (n: number) => string;
  formatNumber: (n: number) => string;
  onRefresh: () => void;
  onSelectCustomer: (c: DueCustomer) => void;
}

export function CustomerList({
  customers,
  filteredCustomers,
  topDebtors,
  loading,
  search,
  onSearchChange,
  sortMode,
  onSortModeChange,
  totalDue,
  collectedToday,
  formatTaka,
  formatNumber,
  onRefresh,
  onSelectCustomer,
}: CustomerListProps) {
  const t = useTranslations('DueCollection');
  const tc = useTranslations('Common');

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full space-y-4 p-4 md:p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={onRefresh}>
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
                onClick={() => onSelectCustomer(c)}
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
            onChange={(e) => onSearchChange(e.target.value)}
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
              onClick={() => onSortModeChange(s.id)}
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
                  onClick={() => onSelectCustomer(customer)}
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
