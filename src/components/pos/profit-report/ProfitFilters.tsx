'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Receipt, Users } from 'lucide-react';
import type { GroupBy, SortKey } from './types';

interface ProfitFiltersProps {
  groupBy: GroupBy;
  onGroupByChange: (v: GroupBy) => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  preset: string;
  onPreset: (p: string) => void;
  onCustomPreset: () => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function ProfitFilters({
  groupBy,
  onGroupByChange,
  sort,
  onSortChange,
  preset,
  onPreset,
  onCustomPreset,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  formatStringNumbers,
  t,
}: ProfitFiltersProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-3 space-y-3">
        <Tabs value={groupBy} onValueChange={(v) => onGroupByChange(v as GroupBy)}>
          <TabsList className="h-auto flex flex-wrap gap-1 bg-muted p-1 rounded-lg w-full sm:w-auto">
            <TabsTrigger value="orders" className="gap-1.5 text-xs">
              <Receipt className="w-3.5 h-3.5" /> {t('profit_by_order')}
            </TabsTrigger>
            <TabsTrigger value="items" className="gap-1.5 text-xs">
              <Package className="w-3.5 h-3.5" /> {t('profit_by_item')}
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" /> {t('profit_by_customer')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {(['1', '7', '30', '90'] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={preset === d ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => onPreset(d)}
              >
                {d === '1' ? t('today') : `${formatStringNumbers(d)}d`}
              </Button>
            ))}
            <Button
              size="sm"
              variant={preset === 'custom' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={onCustomPreset}
            >
              {t('custom')}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-1">
              {t('sort_by')}
            </span>
            {(['profit', 'revenue', 'margin'] as SortKey[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={sort === s ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => onSortChange(s)}
              >
                {s === 'profit' ? t('profit') : s === 'revenue' ? t('revenue') : t('margin_col')}
              </Button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-8 text-xs w-36"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
