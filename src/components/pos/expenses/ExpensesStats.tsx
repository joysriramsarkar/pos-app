'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Receipt, Wallet, TrendingUp, TrendingDown, ArrowUpRight,
} from 'lucide-react';
import { CATEGORY_CONFIG, type CategoryBreakdownItem } from './types';

interface ExpensesStatsProps {
  filteredTotal: number;
  filteredCount: number;
  highestCategory: CategoryBreakdownItem | null;
  categoryBreakdown: CategoryBreakdownItem[];
  getCategoryBn: (cat: string) => string;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (s: string) => string;
  labels: {
    todayTotal: string;
    totalEntries: string;
    highestCategory: string;
    avgEntry: string;
    categoryBreakdown: string;
  };
}

export function ExpensesStats({
  filteredTotal,
  filteredCount,
  highestCategory,
  categoryBreakdown,
  getCategoryBn,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  labels,
}: ExpensesStatsProps) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 shrink-0">
        <Card className="overflow-hidden shadow-sm border-red-200 dark:border-red-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-red-50/80 to-red-100/30 dark:from-red-950/40 dark:to-red-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm shrink-0">
                <Wallet className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{labels.todayTotal}</p>
                <p className="text-sm md:text-xl font-bold text-red-600 truncate tabular-nums">{formatPrice(filteredTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-blue-200 dark:border-blue-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/30 dark:from-blue-950/40 dark:to-blue-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                <Receipt className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{labels.totalEntries}</p>
                <p className="text-sm md:text-xl font-bold truncate tabular-nums">{formatNumber(filteredCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-orange-200 dark:border-orange-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-orange-50/80 to-orange-100/30 dark:from-orange-950/40 dark:to-orange-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm shrink-0">
                <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{labels.highestCategory}</p>
                <p className="text-xs md:text-base font-bold truncate">
                  {highestCategory ? getCategoryBn(highestCategory.category) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="p-2.5 md:p-4 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 dark:from-emerald-950/40 dark:to-emerald-900/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                <ArrowUpRight className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{labels.avgEntry}</p>
                <p className="text-sm md:text-xl font-bold truncate tabular-nums">
                  {formatPrice(filteredCount > 0 ? Math.round(filteredTotal / filteredCount) : 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {categoryBreakdown.length > 0 && (
        <Card className="overflow-hidden shadow-sm shrink-0">
          <CardContent className="p-2.5 md:p-4">
            <h3 className="font-semibold text-xs md:text-sm mb-2 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              {labels.categoryBreakdown}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
              {categoryBreakdown.map((cat) => {
                const config = CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG['Other'];
                const Icon = config.icon;
                return (
                  <div key={cat.category} className="space-y-1 border p-2 rounded-lg bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`h-5 w-5 rounded-md bg-gradient-to-br ${config.gradient} flex items-center justify-center shrink-0`}>
                          <Icon className={`h-3 w-3 ${config.color}`} />
                        </div>
                        <span className="text-xs font-medium truncate">{getCategoryBn(cat.category)}</span>
                        <Badge variant="secondary" className="text-[9px] h-4 shrink-0 px-1">
                          {cat.count}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-bold tabular-nums">{formatPrice(cat.amount)}</span>
                        <span className="text-[10px] text-muted-foreground">({formatStringNumbers(cat.percentage.toFixed(0))}%)</span>
                      </div>
                    </div>
                    <Progress value={cat.percentage} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
