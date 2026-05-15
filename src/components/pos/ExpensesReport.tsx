'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, BarChart3, Tag, Truck, TrendingDown, IndianRupee, CalendarDays, Calendar, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, subDays, addDays, subMonths, getWeek, getYear } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Other'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Rent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Utilities: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Salaries: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Supplies: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const CHART_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899', '#f97316', '#14b8a6'];

const fp = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

type ViewMode = 'daily' | 'weekly' | 'monthly';

interface ExpensesReportProps {
  onBack: () => void;
}

export function ExpensesReport({ onBack }: ExpensesReportProps) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const EXPENSES_REPORT_CACHE_TTL = 30 * 60 * 1000;

  const getExpensesReportCache = (key: string) => {
    const cached = localStorage.getItem(`expenses-report-cache-${key}`);
    if (!cached) return null;
    try {
      const parsed = JSON.parse(cached);
      if (!parsed?.timestamp || parsed?.data === undefined) return null;
      if (Date.now() - parsed.timestamp > EXPENSES_REPORT_CACHE_TTL) return null;
      return parsed.data;
    } catch (err) {
      console.error('Invalid expenses report cache:', err);
      return null;
    }
  };

  const setExpensesReportCache = (key: string, data: any[]) => {
    localStorage.setItem(`expenses-report-cache-${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  };

  // দৈনিক মোডে একটা দিন, বাকিতে রেঞ্জ
  const [singleDate, setSingleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchFrom = viewMode === 'daily' ? singleDate : dateFrom;
  const fetchTo = viewMode === 'daily' ? singleDate : dateTo;

  useEffect(() => {
    const cacheKey = `${fetchFrom}:${fetchTo}`;
    const cached = getExpensesReportCache(cacheKey);
    if (cached) {
      setExpenses(cached);
    }

    const controller = new AbortController();

    fetch(`/api/expenses?dateFrom=${fetchFrom}&dateTo=${fetchTo}T23:59:59`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setExpenses(d.data ?? []);
          setExpensesReportCache(cacheKey, d.data ?? []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [fetchFrom, fetchTo]);

  const filtered = useMemo(() =>
    expenses.filter(e => filterCategory === 'All' || e.category === filterCategory),
    [expenses, filterCategory]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount ?? 0), 0), [filtered]);

  const dailyData = useMemo(() => {
    const map: Record<string, { amount: number; ts: number }> = {};
    filtered.forEach(e => {
      const d = new Date(e.date);
      const k = format(d, 'dd MMM');
      if (!map[k]) map[k] = { amount: 0, ts: d.getTime() };
      map[k].amount += Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[1].ts - b[1].ts).map(([date, { amount }]) => ({ date, amount }));
  }, [filtered]);

  const weeklyData = useMemo(() => {
    const map: Record<string, { amount: number; ts: number }> = {};
    filtered.forEach(e => {
      const d = new Date(e.date);
      const k = `W${getWeek(d)} '${String(getYear(d)).slice(2)}`;
      if (!map[k]) map[k] = { amount: 0, ts: startOfWeek(d).getTime() };
      map[k].amount += Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[1].ts - b[1].ts).map(([week, { amount }]) => ({ week, amount }));
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const map: Record<string, { amount: number; ts: number }> = {};
    filtered.forEach(e => {
      const d = new Date(e.date);
      const k = format(d, 'MMM yyyy');
      if (!map[k]) map[k] = { amount: 0, ts: startOfMonth(d).getTime() };
      map[k].amount += Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[1].ts - b[1].ts).map(([month, { amount }]) => ({ month, amount }));
  }, [filtered]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { map[e.category] = (map[e.category] ?? 0) + Number(e.amount ?? 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const pieData = categoryTotals.map(([name, value]) => ({ name, value }));

  const supplierTotals = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    filtered.filter(e => e.supplierName).forEach(e => {
      const k = e.supplierId || e.supplierName;
      if (!map[k]) map[k] = { name: e.supplierName, total: 0 };
      map[k].total += Number(e.amount ?? 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const setRangePreset = (days: number) => {
    setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
    setDateTo(format(new Date(), 'yyyy-MM-dd'));
  };

  const tooltipStyle = { borderRadius: '8px', fontSize: '12px' };
  const yFmt = (v: number) => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`;

  const chartData = viewMode === 'daily'
    ? filtered.map(e => ({ time: format(new Date(e.date), 'HH:mm'), amount: e.amount ?? 0, label: e.notes || e.category }))
    : viewMode === 'weekly' ? weeklyData : monthlyData;
  const chartKey = viewMode === 'daily' ? 'time' : viewMode === 'weekly' ? 'week' : 'month';
  const chartColor = viewMode === 'daily' ? '#ef4444' : viewMode === 'weekly' ? '#f59e0b' : '#8b5cf6';
  const tableColor = viewMode === 'daily' ? 'text-red-600' : viewMode === 'weekly' ? 'text-amber-600' : 'text-purple-600';

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> খরচের বিস্তারিত রিপোর্ট
          </h1>
          <p className="text-muted-foreground text-xs">দৈনিক · সাপ্তাহিক · মাসিক বিশ্লেষণ</p>
        </div>
      </div>

      {/* Filters — একটাই কার্ড, সব কন্ট্রোল এখানে */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3 flex flex-col gap-2">
          {/* Row 1: View mode */}
          <div className="flex gap-1">
            <Button
              size="sm" variant={viewMode === 'daily' ? 'default' : 'outline'}
              className="h-8 text-xs flex-1 gap-1"
              onClick={() => setViewMode('daily')}
            >
              <CalendarDays className="w-3.5 h-3.5" /> দৈনিক
            </Button>
            <Button
              size="sm" variant={viewMode === 'weekly' ? 'default' : 'outline'}
              className="h-8 text-xs flex-1 gap-1"
              onClick={() => setViewMode('weekly')}
            >
              <Calendar className="w-3.5 h-3.5" /> সাপ্তাহিক
            </Button>
            <Button
              size="sm" variant={viewMode === 'monthly' ? 'default' : 'outline'}
              className="h-8 text-xs flex-1 gap-1"
              onClick={() => setViewMode('monthly')}
            >
              <CalendarRange className="w-3.5 h-3.5" /> মাসিক
            </Button>
          </div>

          {/* Row 2: Date controls — দৈনিকে একটা date, বাকিতে রেঞ্জ + প্রিসেট */}
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setSingleDate(d => format(subDays(new Date(d), 1), 'yyyy-MM-dd'))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant={singleDate === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
                className="h-9 flex-1 text-xs font-medium"
                onClick={() => setSingleDate(format(new Date(), 'yyyy-MM-dd'))}>
                {singleDate === format(new Date(), 'yyyy-MM-dd') ? 'আজ' : format(new Date(singleDate), 'dd MMM yyyy')}
              </Button>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0"
                disabled={singleDate >= format(new Date(), 'yyyy-MM-dd')}
                onClick={() => setSingleDate(d => format(addDays(new Date(d), 1), 'yyyy-MM-dd'))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {[7, 30, 90].map(d => (
                <Button key={d} size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRangePreset(d)}>{d}d</Button>
              ))}
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                setDateTo(format(new Date(), 'yyyy-MM-dd'));
              }}>এই মাস</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                const last = subMonths(new Date(), 1);
                setDateFrom(format(startOfMonth(last), 'yyyy-MM-dd'));
                setDateTo(format(endOfMonth(last), 'yyyy-MM-dd'));
              }}>গত মাস</Button>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
          )}

          {/* Row 3: Category filter */}
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">সব ক্যাটাগরি</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="rounded-2xl shadow-sm bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/40">
          <CardContent className="p-3 flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-[10px] text-red-600 font-medium">মোট খরচ</p>
              <p className="text-lg font-black text-red-700">{fp(total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">এন্ট্রি</p>
            <p className="text-lg font-bold">{filtered.length}টি</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">
              {viewMode === 'daily' ? 'গড় এন্ট্রি' : 'গড় দৈনিক'}
            </p>
            <p className="text-lg font-bold">{fp(dailyData.length ? total / dailyData.length : 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {viewMode === 'daily' ? 'দৈনিক খরচ' : viewMode === 'weekly' ? 'সাপ্তাহিক খরচ' : 'মাসিক খরচ'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">কোনো ডেটা নেই</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey={chartKey} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={yFmt} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                <Tooltip
                  formatter={(v: number, _: string, props: any) => [
                    fp(v),
                    viewMode === 'daily' ? (props.payload?.label || 'খরচ') : 'খরচ'
                  ]}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="amount" name="খরচ" fill={chartColor} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* দৈনিক মোডে লাইন চার্ট শুধু একটা দিনের এন্ট্রি দেখাবে */}
      {viewMode === 'daily' && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" /> {format(new Date(singleDate), 'dd MMM yyyy')} — এন্ট্রি তালিকা
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>বিবরণ</TableHead>
                  <TableHead>ক্যাটাগরি</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">কোনো ডেটা নেই</TableCell></TableRow>
                ) : filtered.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">
                      {e.supplierName && (
                        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-medium mb-0.5">
                          <Truck className="w-3 h-3" />{e.supplierName}
                        </span>
                      )}
                      {e.notes || '—'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.Other}`}>{e.category}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm text-red-600">{fp(Number(e.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* সাপ্তাহিক/মাসিক মোডে গ্রুপ তালিকা */}
      {viewMode !== 'daily' && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              {viewMode === 'weekly' ? 'সাপ্তাহিক' : 'মাসিক'} তালিকা
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{viewMode === 'weekly' ? 'সপ্তাহ' : 'মাস'}</TableHead>
                  <TableHead className="text-right">মোট</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground text-sm">কোনো ডেটা নেই</TableCell></TableRow>
                ) : (chartData as any[]).map((g: any) => (
                  <TableRow key={g[chartKey]}>
                    <TableCell className="text-sm">{g[chartKey]}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${tableColor}`}>{fp(g.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Category Pie + Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> ক্যাটাগরি পাই চার্ট</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">কোনো ডেটা নেই</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fp(v)} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> ক্যাটাগরি ব্রেকডাউন</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ক্যাটাগরি</TableHead>
                  <TableHead className="text-right">মোট</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTotals.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">কোনো ডেটা নেই</TableCell></TableRow>
                ) : categoryTotals.map(([cat, amt]) => (
                  <TableRow key={cat}>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other}`}>{cat}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{fp(amt)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{total > 0 ? ((amt / total) * 100).toFixed(1) : 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Breakdown */}
      {supplierTotals.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> সাপ্লায়ার অনুযায়ী খরচ</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>সাপ্লায়ার</TableHead>
                  <TableHead className="text-right">মোট</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierTotals.map(s => (
                  <TableRow key={s.name}>
                    <TableCell className="text-sm flex items-center gap-1.5 font-medium">
                      <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />{s.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{fp(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ExpensesReport;
