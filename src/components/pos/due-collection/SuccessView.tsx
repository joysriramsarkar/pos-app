'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Sparkles } from 'lucide-react';

export interface SuccessViewProps {
  customerName?: string;
  collected: number;
  remaining: number;
  formatTaka: (n: number) => string;
  onCollectMore: () => void;
  onDone: () => void;
}

export function SuccessView({
  customerName,
  collected,
  remaining,
  formatTaka,
  onCollectMore,
  onDone,
}: SuccessViewProps) {
  const t = useTranslations('DueCollection');

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
            <p className="text-muted-foreground">{customerName}</p>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-green-50 dark:bg-green-950/30">
              <span className="text-sm text-muted-foreground">{t('amount_collected')}</span>
              <span className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatTaka(collected)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30">
              <span className="text-sm text-muted-foreground">{t('remaining_due')}</span>
              <span
                className={`text-xl font-bold tabular-nums ${
                  remaining > 0
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-green-600 dark:text-green-400'
                }`}
              >
                {remaining > 0 ? formatTaka(remaining) : t('all_clear')}
              </span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            {remaining > 0 && (
              <Button onClick={onCollectMore} variant="outline" className="flex-1 h-12 font-semibold">
                <Sparkles className="h-4 w-4 mr-2" />
                {t('collect_more')}
              </Button>
            )}
            <Button
              onClick={onDone}
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
