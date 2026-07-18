'use client';

import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { ComparisonResult } from './types';

export function ComparisonBadge({
  comparison,
  label,
}: {
  comparison: ComparisonResult;
  label: string;
}) {
  const { formatNumber } = useNumberFormat();
  if (!comparison) return null;

  if (comparison.direction === 'same') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="h-2.5 w-2.5" />
        {label}
      </span>
    );
  }

  const isUp = comparison.direction === 'up';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
      isUp
        ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
        : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
    }`}>
      {isUp ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {formatNumber(comparison.pct)}%
    </span>
  );
}

export function StatCard({
  title,
  value,
  icon,
  iconBg,
  cardGradient,
  trend,
  trendLabel,
  profitMargin,
  comparison,
  comparisonLabel,
  staggerDelay,
  numberPopping,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  cardGradient: string;
  trend?: 'up' | 'down';
  trendLabel?: string;
  profitMargin?: number;
  comparison?: ComparisonResult;
  comparisonLabel?: string;
  staggerDelay?: number;
  numberPopping?: boolean;
}) {
  const { formatNumber } = useNumberFormat();
  return (
    <Card className={`overflow-hidden shadow-sm sm:shadow-md bg-gradient-to-br ${cardGradient} animate-stagger-in transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-default`} style={{ animationDelay: `${(staggerDelay ?? 0) * 0.05}s` }}>
      <CardContent className="p-2 sm:p-3 md:p-4">
        <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3">
          <div className={`h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 rounded-lg sm:rounded-xl ${iconBg} flex items-center justify-center shadow-md shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5 sm:[&>svg]:h-5 sm:[&>svg]:w-5`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-[11px] md:text-xs text-muted-foreground/70 truncate font-medium uppercase tracking-wide">{title}</p>
            <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
              <p className={`text-sm sm:text-lg md:text-xl font-bold whitespace-nowrap leading-tight tabular-nums ${numberPopping ? 'animate-number-pop' : ''}`}>{trendLabel}{value}</p>
              {trend && (
                <span className={`inline-flex items-center text-[10px] sm:text-xs font-medium px-0.5 sm:px-1 py-0.5 rounded-full shrink-0 ${
                  trend === 'up'
                    ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
                    : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
                }`}>
                  {trend === 'up' ? <ArrowUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> : <ArrowDown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                </span>
              )}
            </div>
            {profitMargin !== undefined && profitMargin !== 0 && (
              <p className={`text-[9px] sm:text-[10px] md:text-xs mt-0.5 ${profitMargin > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {profitMargin > 0 ? '+' : ''}{formatNumber(Math.min(Math.max(profitMargin, -999), 999).toFixed(1))}% মার্জিন
              </p>
            )}
            {comparison && comparisonLabel && comparison.direction !== 'same' && (
              <div className="mt-0.5">
                <ComparisonBadge comparison={comparison} label={comparisonLabel} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryItem({
  icon,
  iconBg,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl bg-background/60 border border-border/40 dark:bg-background/40 dark:border-border/30">
      <div className={`h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 rounded-md sm:rounded-lg ${iconBg} flex items-center justify-center shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5 sm:[&>svg]:h-4 sm:[&>svg]:w-4`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] sm:text-[10px] md:text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-xs sm:text-sm md:text-base font-bold whitespace-nowrap tabular-nums ${valueColor || ''}`}>{value}</p>
      </div>
    </div>
  );
}

export function PaymentRow({
  label,
  amount,
  total,
  color,
  bgColor,
  percentage,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
  bgColor: string;
  percentage?: number;
}) {
  const { formatPrice, formatNumber } = useNumberFormat();
  const barPercentage = total > 0 ? (amount / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{formatPrice(amount)}</span>
          {percentage !== undefined && percentage > 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 dark:bg-muted/40 px-1.5 py-0.5 rounded-full">
              {formatNumber(percentage)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-muted dark:bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(barPercentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-3 p-3 md:p-4 overflow-y-auto h-full">
      {/* Mobile search skeleton */}
      <div className="md:hidden">
        <Skeleton className="h-11 w-full rounded-xl skeleton-shimmer" />
      </div>
      {/* Greeting skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5 rounded-full" />
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2.5 md:gap-3">
                <Skeleton className="h-8 w-8 md:h-10 md:w-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </CardContent>
      </Card>
      {/* Summary skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-12 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
