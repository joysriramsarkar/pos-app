'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Plus, Package, Clock, CheckCircle, Loader2, ShoppingCart, BarChart2,
} from 'lucide-react';
import type { PurchaseOrder, DateFilter } from './types';
import { getStatusBadge } from './utils';

interface PurchaseOrderListProps {
  totalOrders: number;
  pendingCount: number;
  receivedCount: number;
  totalValue: number;
  formatPrice: (value: number) => string;
  formatDate: (date: Date) => string;
  dateFilter: DateFilter;
  setDateFilter: (value: DateFilter) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  loading: boolean;
  filteredOrders: PurchaseOrder[];
  onOpenDetail: (order: PurchaseOrder) => void;
  onNewOrder: () => void;
  onShowStatistics: () => void;
}

export function PurchaseOrderList({
  totalOrders,
  pendingCount,
  receivedCount,
  totalValue,
  formatPrice,
  formatDate,
  dateFilter,
  setDateFilter,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  statusFilter,
  setStatusFilter,
  loading,
  filteredOrders,
  onOpenDetail,
  onNewOrder,
  onShowStatistics,
}: PurchaseOrderListProps) {
  const t = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={onShowStatistics}
            className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
          >
            <BarChart2 className="h-4 w-4" />
            রিপোর্ট
          </Button>
          <Button onClick={onNewOrder} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('new_order')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('total_orders')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">{t('pending')}</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">{t('received')}</span>
            </div>
            <p className="text-2xl font-bold text-green-600 mt-1">{receivedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('total_value')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatPrice(totalValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 p-3 bg-muted/40 rounded-xl border border-border/40">
        <div className="flex flex-col gap-2 flex-1 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">তারিখ ফিল্টার:</span>
            <div className="flex gap-1 flex-wrap">
              {[
                { value: 'all', label: 'সব সময়' },
                { value: 'today', label: 'আজ' },
                { value: 'weekly', label: 'সাপ্তাহিক' },
                { value: 'monthly', label: 'মাসিক' },
                { value: 'custom', label: 'কাস্টম' },
              ].map((d) => (
                <Button
                  key={d.value}
                  variant={dateFilter === d.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDateFilter(d.value as DateFilter)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 border-t pt-1.5 border-dashed border-border/60">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">থেকে:</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-xs w-[140px]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">পর্যন্ত:</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 text-xs w-[140px]"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          )}
        </div>

        {/* Vertical divider on desktop */}
        <div className="hidden md:block self-stretch w-px bg-border/60" />

        <div className="flex flex-wrap items-center gap-2 md:pl-2 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">অবস্থা ফিল্টার:</span>
          <div className="flex gap-1 flex-wrap">
            {['সব', 'পেন্ডিং', 'অর্ডার করা', 'প্রাপ্ত', 'বাতিল'].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Order List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{tc('loading')}</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mb-2 opacity-50" />
          <p>{t('no_orders')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onOpenDetail(order)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">{order.orderNumber}</span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {order.supplier?.name || t('no_supplier')}
                      {' • '}
                      {t('items_count', { count: order.items.length })}
                    </p>
                    {order.expectedDate && (
                      <p className="text-xs text-muted-foreground">
                        {t('expected_date')}: {formatDate(new Date(order.expectedDate))}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">{formatPrice(order.totalAmount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(new Date(order.createdAt))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
