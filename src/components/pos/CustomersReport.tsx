'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, Download, Search, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';
import { subDays, format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CustomersReportProps {
  onBack: () => void;
}

export function CustomersReport({ onBack }: CustomersReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatDate, formatNumber, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Detail modal states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('');
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // Date states
  const [preset, setPreset] = useState('30');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    setLoading(true);
    let url = `/api/reports/customers?from=${dateFrom}&to=${dateTo}T23:59:59&tzOffset=${new Date().getTimezoneOffset()}`;
    if (preset !== 'custom') {
      url = `/api/reports/customers?days=${preset}&tzOffset=${new Date().getTimezoneOffset()}`;
    }
    
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.topCustomers) {
          setCustomers(res.topCustomers ?? []);
        }
      })
      .catch((err) => console.error('Failed to fetch customer stats:', err))
      .finally(() => setLoading(false));
  }, [preset, dateFrom, dateTo]);

  // Load customer detail
  useEffect(() => {
    if (!selectedCustomerId) return;
    setDetailLoading(true);
    
    let url = `/api/reports/customers?customerId=${selectedCustomerId}&from=${dateFrom}&to=${dateTo}T23:59:59&tzOffset=${new Date().getTimezoneOffset()}`;
    if (preset !== 'custom') {
      url = `/api/reports/customers?customerId=${selectedCustomerId}&days=${preset}&tzOffset=${new Date().getTimezoneOffset()}`;
    }
    
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        setCustomerDetail(res);
      })
      .catch((err) => console.error('Failed to load customer details:', err))
      .finally(() => setDetailLoading(false));
  }, [selectedCustomerId, preset, dateFrom, dateTo]);

  // Calculations
  const stats = useMemo(() => {
    let count = customers.length;
    let totalSpent = 0;
    let totalInvoices = 0;
    let maxSpent = { name: '—', value: 0 };
    
    customers.forEach((c) => {
      const spent = Number(c.totalSpent || 0);
      totalSpent += spent;
      totalInvoices += Number(c.orderCount || 0);
      
      if (spent > maxSpent.value) {
        maxSpent = { name: c.name, value: spent };
      }
    });
    
    const averageSpent = count > 0 ? totalSpent / count : 0;
    
    return {
      count,
      totalSpent,
      totalInvoices,
      maxSpent,
      averageSpent
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone || '').includes(searchQuery)
      );
    });
  }, [customers, searchQuery]);

  const chartData = useMemo(() => {
    return [...customers]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 12 ? c.name.substring(0, 12) + '...' : c.name,
        spent: Number(c.totalSpent)
      }));
  }, [customers]);

  const handleDownloadCSV = () => {
    if (!filteredCustomers.length) return;
    const header = ['Rank', 'Customer Name', 'Phone', 'Orders Count', 'Total Spent', 'Average Order Value (AOV)', 'Outstanding Dues'];
    const rows = [
      header,
      ...filteredCustomers.map((c, index) => [
        index + 1,
        c.name,
        c.phone || 'N/A',
        c.orderCount,
        c.totalSpent.toFixed(2),
        c.aov.toFixed(2),
        c.totalDue.toFixed(2)
      ])
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top-customers-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePresetChange = (p: string) => {
    setPreset(p);
    if (p !== 'custom') {
      const days = parseInt(p);
      setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
      setDateTo(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleRowClick = (c: any) => {
    setSelectedCustomerId(c.id);
    setSelectedCustomerName(c.name);
    setSelectedCustomerPhone(c.phone || 'N/A');
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
              <Users className="w-5 h-5 text-indigo-500" />
              {t('top_customers')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('highest_spending')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!filteredCustomers.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      {/* Date Filters Card */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={preset === String(d) ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => handlePresetChange(String(d))}
              >
                {formatStringNumbers(d)}d
              </Button>
            ))}
            <Button
              size="sm"
              variant={preset === 'custom' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setPreset('custom')}
            >
              {t('custom')}
            </Button>
          </div>
          
          {preset === 'custom' && (
            <div className="flex items-center gap-2 mt-2 md:mt-0">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Top Customer Spend</p>
            <p className="text-sm font-semibold text-blue-700 truncate mt-1">{stats.maxSpent.name}</p>
            <p className="text-sm font-bold text-blue-600">{formatPrice(stats.maxSpent.value)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Avg Customer spend</p>
            <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(stats.averageSpent)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Sales Invoiced</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(stats.totalInvoices)} orders</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Customer Accounts</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(stats.count)} buyers</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphical Spends comparison */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top 10 Customers Spend Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => formatPrice(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="spent" name="Spent Amount" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table Records list */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">Customers Activity Listing</CardTitle>
          <div className="relative h-8 w-44">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
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
                <TableHead className="text-xs w-10">Rank</TableHead>
                <TableHead className="text-xs">{t('customer')}</TableHead>
                <TableHead className="text-right text-xs">Orders Count</TableHead>
                <TableHead className="text-right text-xs">{t('spent')}</TableHead>
                <TableHead className="text-right text-xs">{t('aov')}</TableHead>
                <TableHead className="text-right text-xs">Outstanding Dues</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                </TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((c, index) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => handleRowClick(c)}>
                    <TableCell className="text-xs font-semibold text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="text-xs">
                      <p className="font-semibold text-xs">{c.name}</p>
                      {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatNumber(c.orderCount)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold text-indigo-600">{formatPrice(c.totalSpent)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatPrice(c.aov)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold text-red-500">{c.totalDue > 0 ? formatPrice(c.totalDue) : '—'}</TableCell>
                    <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomerId} onOpenChange={(o) => { if(!o) setSelectedCustomerId(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCustomerName}</DialogTitle>
            <DialogDescription>{selectedCustomerPhone}</DialogDescription>
          </DialogHeader>
          
          {detailLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">{t('loading')}</div>
          ) : !customerDetail ? (
            <div className="py-10 text-center text-xs text-muted-foreground">No data available</div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-sm font-bold text-indigo-600">{formatPrice(customerDetail.totalSpent)}</p>
                  <p className="text-[10px] text-muted-foreground">{t('total_spent')}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-sm font-bold">{formatNumber(customerDetail.orderCount)}</p>
                  <p className="text-[10px] text-muted-foreground">{t('orders')}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-sm font-bold">{formatPrice(customerDetail.aov)}</p>
                  <p className="text-[10px] text-muted-foreground">{t('avg_order')}</p>
                </div>
              </div>

              {customerDetail.topProducts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">{t('top_products_label')}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1">Product</TableHead>
                        <TableHead className="text-right text-[10px] py-1">Qty</TableHead>
                        <TableHead className="text-right text-[10px] py-1">Val</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerDetail.topProducts.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs py-1.5">{p.name}</TableCell>
                          <TableCell className="text-right text-xs py-1.5">{formatNumber(p.qty)}</TableCell>
                          <TableCell className="text-right text-xs py-1.5 font-medium">{formatPrice(p.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
