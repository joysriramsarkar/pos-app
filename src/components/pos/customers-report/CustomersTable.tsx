'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ChevronRight } from 'lucide-react';

interface CustomersTableProps {
  loading: boolean;
  filteredCustomers: any[];
  searchInput: string;
  onSearchChange: (v: string) => void;
  onRowClick: (c: any) => void;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function CustomersTable({
  loading,
  filteredCustomers,
  searchInput,
  onSearchChange,
  onRowClick,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  t,
}: CustomersTableProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-semibold">{t('customers_activity_listing')}</CardTitle>
        <div className="relative h-8 w-44">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('search_customers_placeholder')}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs w-full"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-10">{t('rank_col')}</TableHead>
              <TableHead className="text-xs">{t('customer')}</TableHead>
              <TableHead className="text-right text-xs">{t('orders')}</TableHead>
              <TableHead className="text-right text-xs">{t('spent')}</TableHead>
              <TableHead className="text-right text-xs">{t('profit')}</TableHead>
              <TableHead className="text-right text-xs hidden sm:table-cell">{t('margin_col')}</TableHead>
              <TableHead className="text-right text-xs hidden md:table-cell">{t('total_due')}</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((c, index) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onRowClick(c)}>
                  <TableCell className="text-xs font-semibold text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="text-xs">
                    <p className="font-semibold text-xs">{c.name}</p>
                    {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatNumber(c.orderCount)}</TableCell>
                  <TableCell className="text-right text-xs font-semibold text-indigo-600">{formatPrice(c.totalSpent)}</TableCell>
                  <TableCell className={`text-right text-xs font-semibold ${Number(c.profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatPrice(Number(c.profit || 0))}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground hidden sm:table-cell tabular-nums">
                    {formatStringNumbers(String(c.margin ?? 0))}%
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold text-red-500 hidden md:table-cell">
                    {c.totalDue > 0 ? formatPrice(c.totalDue) : '—'}
                  </TableCell>
                  <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
