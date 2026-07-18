'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import type { DatePreset } from './types';

export function DateFilterBar({
  preset,
  onPresetChange,
}: {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
}) {
  const t = useTranslations('Reports');

  return (
    <div className="flex flex-wrap items-end gap-2 shrink-0">
      {(['1', '7', '30', '365'] as DatePreset[]).map((p) => (
        <Button
          key={p}
          size="sm"
          variant={preset === p ? 'default' : 'outline'}
          className="min-h-9 text-xs"
          onClick={() => onPresetChange(p)}
        >
          {p === '1' ? t('today') : p === '7' ? t('days_7') : p === '30' ? t('days_30') : t('yearly')}
        </Button>
      ))}
      <Button
        size="sm"
        variant={preset === 'custom' ? 'default' : 'outline'}
        className="min-h-9 text-xs"
        onClick={() => onPresetChange('custom')}
      >
        {t('custom')}
      </Button>
    </div>
  );
}

export function CustomDateInputs({
  customFrom,
  customTo,
  onFromChange,
  onToChange,
}: {
  customFrom: string;
  customTo: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  const t = useTranslations('Reports');

  return (
    <div className="w-full flex items-end gap-2 flex-wrap">
      <div className="flex items-center gap-1 flex-1 min-w-48">
        <Label className="text-xs shrink-0">{t('from')}</Label>
        <Input
          type="date"
          value={customFrom}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 text-xs flex-1 min-w-32"
        />
      </div>
      <div className="flex items-center gap-1 flex-1 min-w-48">
        <Label className="text-xs shrink-0">{t('to')}</Label>
        <Input
          type="date"
          value={customTo}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 text-xs flex-1 min-w-32"
        />
      </div>
    </div>
  );
}
