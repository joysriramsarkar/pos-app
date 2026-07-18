'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarDays, Calendar, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { subDays, addDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { ViewMode } from './types';

interface SupplierFiltersProps {
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  singleDate: string;
  onSingleDateChange: (v: string | ((d: string) => string)) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  formatDate: (d: Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatStringNumbers: (v: string | number) => string;
  t: (key: string) => string;
}

export function SupplierFilters({
  viewMode,
  onViewModeChange,
  singleDate,
  onSingleDateChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  formatDate,
  formatStringNumbers,
  t,
}: SupplierFiltersProps) {
  const setRangePreset = (days: number) => {
    onViewModeChange('weekly');
    onDateFromChange(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
    onDateToChange(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-3 flex flex-col gap-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={viewMode === 'daily' ? 'default' : 'outline'}
            className="h-8 text-xs flex-1 gap-1"
            onClick={() => onViewModeChange('daily')}
          >
            <CalendarDays className="w-3.5 h-3.5" /> {t('today')}
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'weekly' ? 'default' : 'outline'}
            className="h-8 text-xs flex-1 gap-1"
            onClick={() => onViewModeChange('weekly')}
          >
            <Calendar className="w-3.5 h-3.5" /> {t('weekly_pattern')}
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'monthly' ? 'default' : 'outline'}
            className="h-8 text-xs flex-1 gap-1"
            onClick={() => onViewModeChange('monthly')}
          >
            <CalendarRange className="w-3.5 h-3.5" /> {t('monthly_spending')}
          </Button>
        </div>

        {viewMode === 'daily' ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => onSingleDateChange((d) => format(subDays(new Date(d), 1), 'yyyy-MM-dd'))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={singleDate === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
              className="h-9 flex-1 text-xs font-medium"
              onClick={() => onSingleDateChange(format(new Date(), 'yyyy-MM-dd'))}
            >
              {singleDate === format(new Date(), 'yyyy-MM-dd') ? t('today') : formatDate(new Date(singleDate), { day: '2-digit', month: 'short', year: 'numeric' })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-9 p-0"
              disabled={singleDate >= format(new Date(), 'yyyy-MM-dd')}
              onClick={() => onSingleDateChange((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {[7, 30, 365].map((d) => (
              <Button key={d} size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRangePreset(d)}>
                {d === 365 ? t('yearly') : `${formatStringNumbers(d)}d`}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                onViewModeChange('weekly');
                onDateFromChange(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                onDateToChange(format(new Date(), 'yyyy-MM-dd'));
              }}
            >
              {t('this_month') || 'This Month'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                onViewModeChange('weekly');
                const last = subMonths(new Date(), 1);
                onDateFromChange(format(startOfMonth(last), 'yyyy-MM-dd'));
                onDateToChange(format(endOfMonth(last), 'yyyy-MM-dd'));
              }}
            >
              {t('last_month') || 'Last Month'}
            </Button>
            <Input type="date" value={dateFrom} onChange={(e) => { onViewModeChange('weekly'); onDateFromChange(e.target.value); }} className="h-8 text-xs w-36" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo} onChange={(e) => { onViewModeChange('weekly'); onDateToChange(e.target.value); }} className="h-8 text-xs w-36" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
