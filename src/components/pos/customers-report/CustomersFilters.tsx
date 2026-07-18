'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CustomersFiltersProps {
  preset: string;
  onPresetChange: (p: string) => void;
  onCustomPreset: () => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  formatStringNumbers: (v: string | number) => string;
  t: (key: string) => string;
}

export function CustomersFilters({
  preset,
  onPresetChange,
  onCustomPreset,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  formatStringNumbers,
  t,
}: CustomersFiltersProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-3 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={preset === '1' ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => onPresetChange('1')}
          >
            {t('today')}
          </Button>
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={preset === String(d) ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => onPresetChange(String(d))}
            >
              {formatStringNumbers(d)}d
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

        {preset === 'custom' && (
          <div className="flex items-center gap-2 mt-2 md:mt-0">
            <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="h-8 text-xs w-36" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="h-8 text-xs w-36" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
