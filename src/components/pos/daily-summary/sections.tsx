'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SectionCard({
  icon,
  iconBg,
  title,
  gradient,
  delay,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  gradient: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Card className={`overflow-hidden shadow-sm bg-gradient-to-br ${gradient}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`h-8 w-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// Metric Item Component
export function MetricItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center p-2.5 rounded-lg bg-background/60 border border-border/30">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

// Skeleton loader
export function DailySummarySkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="rounded-xl p-4 space-y-2">
        <Skeleton className="h-6 w-40 mx-auto" />
        <Skeleton className="h-5 w-32 mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
      {/* Sections skeleton */}
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

