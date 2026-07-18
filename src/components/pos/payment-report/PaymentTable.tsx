'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

interface PaymentTableProps {
  loading: boolean;
  filteredSales: any[];
  searchInput: string;
  onSearchChange: (v: string) => void;
  filterMethod: string;
  onFilterMethodChange: (v: string) => void;
  formatPrice: (n: number) => string;
  formatDate: (d: Date, opts?: Intl.DateTimeFormatOptions) => string;
  t: (key: string) => string;
}

export function PaymentTable({
  loading,
  filteredSales,
  searchInput,
  onSearchChange,
  filterMethod,
  onFilterMethodChange,
  formatPrice,
  formatDate,
  t,
}: PaymentTableProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-3">
        <CardTitle className="text-sm font-semibold">{t('payment_summary')}</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative h-8 w-44 md:w-56">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('search_invoice_customer')}
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 h-8 text-xs w-full"
            />
          </div>
          <Select value={filterMethod} onValueChange={onFilterMethodChange}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t('all_methods')}</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Mixed">{t('mixed_payment') || t('split_payment') || 'Mixed'}</SelectItem>
              <SelectItem value="Due">Due</SelectItem>
              <SelectItem value="Prepaid">Prepaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('invoice_no')}</TableHead>
                <TableHead className="text-xs">{t('date')}</TableHead>
                <TableHead className="text-xs">{t('customer')}</TableHead>
                <TableHead className="text-xs">{t('payment_method')}</TableHead>
                <TableHead className="text-right text-xs">{t('total_bill')}</TableHead>
                <TableHead className="text-right text-xs">{t('paid')}</TableHead>
                <TableHead className="text-right text-xs">{t('due_col')}</TableHead>
                <TableHead className="text-right text-xs">{t('status_col')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                </TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                </TableRow>
              ) : (
                filteredSales.map((s) => {
                  const totalAmt = Number(s.totalAmount || 0);
                  const amtPaid = Number(s.amountPaid || 0);
                  const dueAmt = Math.max(0, totalAmt - amtPaid);

                  return (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-semibold">{s.invoiceNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(s.createdAt), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{s.customer?.name || t('walk_in_customer')}</p>
                        {s.customer?.phone && <p className="text-[10px] text-muted-foreground">{s.customer.phone}</p>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.paymentMethod === 'Mixed' || (Number(s.cashAmount) > 0 && Number(s.upiAmount) > 0) ? (
                          <Badge variant="outline" className="text-[10px]">
                            Mixed (C: {Number(s.cashAmount || 0)} / U: {Number(s.upiAmount || 0)})
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">{s.paymentMethod || 'Cash'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatPrice(totalAmt)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatPrice(amtPaid)}</TableCell>
                      <TableCell className="text-right text-xs font-medium text-red-500">{dueAmt > 0 ? formatPrice(dueAmt) : '—'}</TableCell>
                      <TableCell className="text-right text-xs">
                        <Badge variant={s.paymentStatus === 'Paid' ? 'default' : s.paymentStatus === 'Partial' ? 'secondary' : 'destructive'} className="text-[10px]">
                          {s.paymentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
