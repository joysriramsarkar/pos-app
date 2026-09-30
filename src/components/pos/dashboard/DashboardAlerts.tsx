'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Package,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Bell,
  Users,
  Truck,
} from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import { cn } from '@/lib/utils';

export interface DashboardAlertsProps {
  onNavigate?: (page: string) => void;
  onOpenShiftModal?: () => void;
}

export function DashboardAlerts({ onNavigate, onOpenShiftModal }: DashboardAlertsProps) {
  const { formatPrice } = useNumberFormat();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/alerts?include=summary');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setAlerts(data.data.alerts || []);
        setSummary(data.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard alerts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/30 border border-border/40 text-xs text-muted-foreground animate-pulse">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
        সতর্কবার্তা চেক করা হচ্ছে...
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
          <Bell className="w-3.5 h-3.5 text-primary" />
          সতর্কবার্তা ও জরুরি কাজ ({alerts.length})
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchAlerts}
          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-2.5 h-2.5 mr-1" />
          রিফ্রেশ
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {alerts.map((alert) => {
          const isError = alert.severity === 'error';
          const isWarning = alert.severity === 'warning';

          return (
            <Card
              key={alert.id}
              className={cn(
                'rounded-2xl border transition-all duration-200 shadow-xs overflow-hidden',
                isError
                  ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50'
                  : isWarning
                  ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
                  : 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50'
              )}
            >
              <CardContent className="p-3.5 flex flex-col justify-between h-full gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      {alert.type === 'LOW_STOCK' && <Package className="w-3.5 h-3.5 text-rose-500" />}
                      {alert.type === 'SHIFT_UNCLOSED' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                      {alert.type === 'OVERDUE_RECEIVABLE' && <Users className="w-3.5 h-3.5 text-amber-500" />}
                      {alert.type === 'OVERDUE_PAYABLE' && <Truck className="w-3.5 h-3.5 text-rose-500" />}
                      {alert.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-1.5 py-0 h-4 border-0 font-bold',
                        isError
                          ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400'
                          : isWarning
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                          : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                      )}
                    >
                      {isError ? 'জরুরি' : 'মনোযোগ দিন'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {alert.message}
                  </p>
                </div>

                {alert.actionLink && (
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (alert.type === 'SHIFT_UNCLOSED' && onOpenShiftModal) {
                          onOpenShiftModal();
                        } else if (onNavigate) {
                          onNavigate(alert.actionLink);
                        }
                      }}
                      className="h-6 px-2 text-[10px] font-semibold text-primary hover:bg-primary/10 gap-1 rounded-lg"
                    >
                      <span>পদক্ষেপ নিন</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
