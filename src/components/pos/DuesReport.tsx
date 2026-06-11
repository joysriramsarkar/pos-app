'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, Download, Search, IndianRupee, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';
import { format } from 'date-fns';

interface DuesReportProps {
  onBack: () => void;
  onNavigate?: (page: string) => void;
}

export function DuesReport({ onBack, onNavigate }: DuesReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatDate, formatNumber, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  
  const [debtors, setDebtors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    setLoading(true);
    fetch('/api/reports/dues')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.customersWithDues) {
          setDebtors(res.customersWithDues ?? []);
        }
      })
      .catch((err) => console.error('Failed to load dues report:', err))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    let totalDue = 0;
    let maxIndividualDue = 0;
    let totalPaid = 0;
    
    debtors.forEach((d) => {
      const due = Number(d.totalDue || 0);
      totalDue += due;
      totalPaid += Number(d.totalPaid || 0);
      if (due > maxIndividualDue) {
        maxIndividualDue = due;
      }
    });
    
    const count = debtors.length;
    const averageDue = count > 0 ? totalDue / count : 0;
    
    return {
      totalDue,
      maxIndividualDue,
      averageDue,
      totalPaid,
      count
    };
  }, [debtors]);

  // Filtered list
  const filteredDebtors = useMemo(() => {
    return debtors.filter((d) => {
      return (
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.phone || '').includes(searchQuery)
      );
    });
  }, [debtors, searchQuery]);

  // Chart data: Top 10 highest dues
  const chartData = useMemo(() => {
    return debtors
      .map((d) => ({
        name: d.name,
        due: Number(d.totalDue)
      }))
      .sort((a, b) => b.due - a.due)
      .slice(0, 10);
  }, [debtors]);

  const handleDownloadCSV = () => {
    if (!filteredDebtors.length) return;
    const header = ['Customer Name', 'Phone', 'Total Outstanding Due', 'Total Lifetime Paid', 'Invoice Count', 'Last Updated'];
    const rows = [
      header,
      ...filteredDebtors.map((d) => [
        d.name,
        d.phone || 'N/A',
        Number(d.totalDue).toFixed(2),
        Number(d.totalPaid || 0).toFixed(2),
        d._count?.sales || 0,
        format(new Date(d.updatedAt), 'dd/MM/yyyy')
      ]),
      ['Total Outstanding', '', stats.totalDue.toFixed(2), '', '', '']
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outstanding-dues-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const yFmt = (v: number) => `${currencySymbol}${v >= 1000 ? formatStringNumbers((v / 1000).toFixed(1)) + 'k' : formatStringNumbers(v)}`;
  const tooltipStyle = { borderRadius: '8px', fontSize: '12px' };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              {t('outstanding_dues')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('pending_payments')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => onNavigate('due-collection')}>
              <IndianRupee className="w-3.5 h-3.5" /> {t('collection_center')} <ArrowRight className="w-3 h-3 ml-0.5" />
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!filteredDebtors.length}>
            <Download className="w-3.5 h-3.5" /> {t('csv')}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl shadow-sm bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-red-600 tracking-wider">{t('total_due')}</p>
            <p className="text-lg md:text-xl font-extrabold text-red-700 mt-1">{formatPrice(stats.totalDue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">{t('avg_outstanding')}</p>
            <p className="text-lg md:text-xl font-extrabold text-amber-700 mt-1">{formatPrice(stats.averageDue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('highest_debt')}</p>
            <p className="text-lg md:text-xl font-extrabold text-red-500 mt-1">{formatPrice(stats.maxIndividualDue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('active_due_accounts')}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(stats.count)} clients</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphical Breakdown */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top 10 Customers with Highest Dues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => formatPrice(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="due" name="Dues Balance" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed List */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">Client Due Ledgers</CardTitle>
          <div className="relative h-8 w-48">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs w-full"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('customer')}</TableHead>
                <TableHead className="text-right text-xs">{t('total_due')}</TableHead>
                <TableHead className="text-right text-xs">Total Lifetime Paid</TableHead>
                <TableHead className="text-right text-xs">{t('orders')}</TableHead>
                <TableHead className="text-right text-xs">{t('last_purchase')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                </TableRow>
              ) : filteredDebtors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                </TableRow>
              ) : (
                filteredDebtors.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs">
                      <p className="font-semibold text-xs">{d.name}</p>
                      {d.phone && <p className="text-[10px] text-muted-foreground">{d.phone}</p>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-red-600">{formatPrice(Number(d.totalDue))}</TableCell>
                    <TableCell className="text-right text-xs font-medium text-emerald-600">{formatPrice(Number(d.totalPaid || 0))}</TableCell>
                    <TableCell className="text-right text-xs"><Badge variant="secondary">{d._count?.sales || 0}</Badge></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatDate(new Date(d.updatedAt), { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
