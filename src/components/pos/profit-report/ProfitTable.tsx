'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import {
  PAYMENT_METHOD_COLORS,
} from '@/lib/report-filters';
import type { GroupBy } from './types';
import { profitColor } from './utils';

interface ProfitTableProps {
  groupBy: GroupBy;
  loading: boolean;
  filteredRows: any[];
  searchInput: string;
  onSearchChange: (v: string) => void;
  payLabel: (method: string) => string;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function ProfitTable({
  groupBy,
  loading,
  filteredRows,
  searchInput,
  onSearchChange,
  payLabel,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  t,
}: ProfitTableProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-semibold">
          {groupBy === 'orders'
            ? t('profit_orders_list')
            : groupBy === 'items'
              ? t('profit_items_list')
              : t('profit_customers_list')}
        </CardTitle>
        <div className="relative h-8 w-44">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('search_placeholder')}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs w-full"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-10">#</TableHead>
              {groupBy === 'orders' && (
                <>
                  <TableHead className="text-xs">{t('invoice')}</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">{t('customer')}</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">{t('method')}</TableHead>
                </>
              )}
              {groupBy === 'items' && (
                <>
                  <TableHead className="text-xs">{t('product')}</TableHead>
                  <TableHead className="text-xs text-right">{t('qty_sold')}</TableHead>
                </>
              )}
              {groupBy === 'customers' && (
                <>
                  <TableHead className="text-xs">{t('customer')}</TableHead>
                  <TableHead className="text-xs text-right">{t('orders')}</TableHead>
                </>
              )}
              <TableHead className="text-xs text-right">{t('revenue')}</TableHead>
              <TableHead className="text-xs text-right hidden sm:table-cell">{t('cogs')}</TableHead>
              <TableHead className="text-xs text-right">{t('profit')}</TableHead>
              <TableHead className="text-xs text-right">{t('margin_col')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  {t('no_data')}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r, i) => (
                <TableRow key={r.id ?? r.invoiceNumber ?? `${r.name}-${i}`}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  {groupBy === 'orders' && (
                    <>
                      <TableCell className="text-xs font-medium">
                        <p>{r.invoiceNumber}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {r.date ? format(new Date(r.date), 'dd MMM yyyy HH:mm') : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        {r.customerName || (
                          <span className="text-muted-foreground">{t('walk_in')}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{
                            borderColor: PAYMENT_METHOD_COLORS[r.paymentMethod] || undefined,
                          }}
                        >
                          {payLabel(r.paymentMethod || 'Cash')}
                        </Badge>
                      </TableCell>
                    </>
                  )}
                  {groupBy === 'items' && (
                    <>
                      <TableCell className="text-xs font-medium">
                        <p>{r.name}</p>
                        {r.nameBn && (
                          <p className="text-[10px] text-muted-foreground">{r.nameBn}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {formatStringNumbers(String(r.quantity))}{' '}
                        <span className="text-muted-foreground">{r.unit}</span>
                      </TableCell>
                    </>
                  )}
                  {groupBy === 'customers' && (
                    <>
                      <TableCell className="text-xs font-medium">
                        <p className="flex items-center gap-1">
                          {r.name}
                          {r.isWalkIn && (
                            <Badge variant="secondary" className="text-[9px] h-4">
                              {t('walk_in')}
                            </Badge>
                          )}
                        </p>
                        {r.phone && (
                          <p className="text-[10px] text-muted-foreground">{r.phone}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge variant="outline">{formatNumber(r.orderCount)}</Badge>
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-xs text-right font-medium tabular-nums">
                    {formatPrice(Number(r.revenue))}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                    {formatPrice(Number(r.cost))}
                  </TableCell>
                  <TableCell className={`text-xs text-right font-semibold tabular-nums ${profitColor(Number(r.profit))}`}>
                    {formatPrice(Number(r.profit))}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    <Badge
                      variant={Number(r.margin) < 10 ? 'destructive' : Number(r.margin) < 20 ? 'secondary' : 'outline'}
                      className="text-[10px] tabular-nums"
                    >
                      {formatStringNumbers(String(r.margin))}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
