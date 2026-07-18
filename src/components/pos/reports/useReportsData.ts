'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import type {
  SaleChartPoint,
  SummaryData,
  StockItem,
  DueCustomer,
  TopProduct,
  CategoryData,
  TopCustomer,
  ProfitRow,
  ProfitSummaryData,
  ProfitInsightsData,
  ProductDetail,
  CustomerDetail,
  ChartType,
  DatePreset,
  ProfitGroup,
} from './types';
import {
  getReportCache,
  setReportCache,
  buildReportCacheKey,
} from './cache';

export function useReportsData() {
  const [salesData, setSalesData] = useState<SaleChartPoint[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [dueData, setDueData] = useState<DueCustomer[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);

  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [tabError, setTabError] = useState<Record<string, string | null>>({});

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<TopCustomer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [isCustomerDetailLoading, setIsCustomerDetailLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<TopProduct | null>(null);
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [isProductDetailLoading, setIsProductDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sales');
  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [purchasesData, setPurchasesData] = useState<any>(null);
  const [profitGroup, setProfitGroup] = useState<ProfitGroup>('orders');
  const [profitRows, setProfitRows] = useState<ProfitRow[]>([]);
  const [profitSummary, setProfitSummary] = useState<ProfitSummaryData | null>(null);
  const [profitInsights, setProfitInsights] = useState<ProfitInsightsData | null>(null);
  const [periodExpenses, setPeriodExpenses] = useState(0);

  const restoreReportCache = (tab: string, cachedData: any) => {
    if (!cachedData) return;
    if (tab === 'sales' || tab === 'payment') {
      setSummaryData(cachedData.summary);
      setSalesData(cachedData.chartData);
    } else if (tab === 'stock') {
      setStockData(cachedData.lowStockItems ?? []);
    } else if (tab === 'dues') {
      setDueData(cachedData.customersWithDues ?? []);
    } else if (tab === 'products') {
      setTopProducts(cachedData.topProducts ?? []);
    } else if (tab === 'categories') {
      setCategoryData(cachedData.categories ?? []);
    } else if (tab === 'customers') {
      setTopCustomers(cachedData.topCustomers ?? []);
    } else if (tab === 'expenses') {
      setExpensesData(cachedData ?? []);
    } else if (tab === 'suppliers') {
      setPurchasesData(cachedData);
    } else if (tab === 'profit') {
      setProfitRows(cachedData.rows ?? []);
      setProfitSummary(cachedData.summary ?? null);
      setProfitInsights(cachedData.insights ?? null);
      if (cachedData.groupBy) setProfitGroup(cachedData.groupBy);
    }
  };

  const [preset, setPreset] = useState<DatePreset>('30');
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const isToday = preset === '1';

  const dateParams = useMemo(() => {
    const tz = new Date().getTimezoneOffset();
    if (preset !== 'custom') {
      const days = parseInt(preset);
      const from = days === 1 ? format(new Date(), 'yyyy-MM-dd') : format(subDays(new Date(), days - 1), 'yyyy-MM-dd');
      const base = `from=${from}&to=${format(new Date(), 'yyyy-MM-dd')}&tzOffset=${tz}`;
      return days === 1 ? base + '&hourly=true' : base;
    }
    return `from=${customFrom}&to=${customTo}&tzOffset=${tz}`;
  }, [preset, customFrom, customTo]);

  const fetchTab = useCallback(async (tab: string, params: string, skipLoading = false) => {
    if (!skipLoading) {
      setTabLoading((prev) => ({ ...prev, [tab]: true }));
      setTabError((prev) => ({ ...prev, [tab]: null }));
    }
    try {
      if (tab === 'sales') {
        const res = await fetch(`/api/reports/sales?${params}`);
        if (!res.ok) throw new Error('Failed to load Sales data');
        const j = await res.json();
        setSummaryData(j.summary);
        setSalesData(j.chartData);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'payment') {
        const res = await fetch(`/api/reports/sales?${params}`);
        if (!res.ok) throw new Error('Failed to load Payment data');
        const j = await res.json();
        setSummaryData(j.summary);
        setSalesData(j.chartData);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'stock') {
        const res = await fetch('/api/reports/stock');
        if (!res.ok) throw new Error('Failed to load Stock data');
        const j = await res.json();
        setStockData(j.lowStockItems || []);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'dues') {
        const res = await fetch('/api/reports/dues');
        if (!res.ok) throw new Error('Failed to load Dues data');
        const j = await res.json();
        setDueData(j.customersWithDues || []);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'products') {
        const res = await fetch(`/api/reports/products?${params}`);
        if (!res.ok) throw new Error('Failed to load Products data');
        const j = await res.json();
        setTopProducts(j.topProducts || []);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'categories') {
        const res = await fetch(`/api/reports/categories?${params}`);
        if (!res.ok) throw new Error('Failed to load Categories data');
        const j = await res.json();
        setCategoryData(j.categories || []);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'customers') {
        const res = await fetch(`/api/reports/customers?${params}`);
        if (!res.ok) throw new Error('Failed to load Customers data');
        const j = await res.json();
        setTopCustomers(j.topCustomers || []);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'suppliers') {
        const res = await fetch(`/api/reports/purchases?${params}`);
        if (!res.ok) throw new Error('Failed to load Suppliers data');
        const j = await res.json();
        setPurchasesData(j);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'profit') {
        const group = params.includes('groupBy=')
          ? new URLSearchParams(params).get('groupBy') || profitGroup
          : profitGroup;
        const profitParams = params.includes('groupBy=')
          ? params
          : `groupBy=${group}&sort=profit&limit=25&${params}`;
        const res = await fetch(`/api/reports/profit?${profitParams}`);
        if (!res.ok) throw new Error('Failed to load Profit data');
        const j = await res.json();
        setProfitRows(j.rows ?? []);
        setProfitSummary(j.summary ?? null);
        setProfitInsights(j.insights ?? null);
        setReportCache(buildReportCacheKey(`profit:${group}`, params), { ...j, groupBy: group });
      }
    } catch (err) {
      setTabError((prev) => ({ ...prev, [tab]: err instanceof Error ? err.message : `Failed to load ${tab} data` }));
    } finally {
      if (!skipLoading) {
        setTabLoading((prev) => ({ ...prev, [tab]: false }));
      }
    }
  }, []);

  const fetchExpensesReport = useCallback(async (cacheKey: string, skipLoading = false) => {
    if (!skipLoading) {
      setExpensesLoading(true);
    }
    try {
      const res = await fetch('/api/expenses');
      if (!res.ok) throw new Error('Failed to load Expenses data');
      const json = await res.json();
      setExpensesData(json.data ?? []);
      setReportCache(cacheKey, json.data ?? []);
    } catch (err) {
      console.error('Failed to load expenses report data:', err);
    } finally {
      if (!skipLoading) {
        setExpensesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const cacheKey = buildReportCacheKey('sales', dateParams);
    const cached = getReportCache(cacheKey);
    if (cached) {
      restoreReportCache('sales', cached);
    }
    fetchTab('sales', dateParams, Boolean(cached));
  }, [dateParams, fetchTab]);

  // Keep dues KPI accurate even before Dues tab opens
  useEffect(() => {
    const cached = getReportCache('dues');
    if (cached) restoreReportCache('dues', cached);
    fetchTab('dues', 'dues', Boolean(cached));
  }, [fetchTab]);

  // Period expenses total for net-after-expenses KPI
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(dateParams);
    const from = params.get('from');
    const to = params.get('to');
    const tz = params.get('tzOffset') || String(new Date().getTimezoneOffset());

    const load = async () => {
      try {
        let page = 1;
        let total = 0;
        let fetched = 0;
        let sum = 0;
        do {
          const qs = new URLSearchParams({
            page: String(page),
            pageSize: '100',
            tzOffset: tz,
          });
          if (from) qs.set('dateFrom', from);
          if (to) qs.set('dateTo', to);
          const res = await fetch(`/api/expenses?${qs.toString()}`);
          if (!res.ok) break;
          const json = await res.json();
          const rows = json.data ?? [];
          total = Number(json.total ?? 0);
          for (const e of rows) sum += Number(e.amount ?? 0);
          fetched += rows.length;
          page += 1;
          if (!rows.length) break;
        } while (fetched < total && page <= 50);
        if (!cancelled) setPeriodExpenses(Math.round(sum * 100) / 100);
      } catch {
        if (!cancelled) setPeriodExpenses(0);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [dateParams]);

  useEffect(() => {
    if (activeTab === 'sales') return;

    if (activeTab === 'profit') {
      const profitCacheKey = buildReportCacheKey(`profit:${profitGroup}`, dateParams);
      const profitCached = getReportCache(profitCacheKey);
      if (profitCached) {
        restoreReportCache('profit', profitCached);
      }
      fetchTab(
        'profit',
        `groupBy=${profitGroup}&sort=profit&limit=25&${dateParams}`,
        Boolean(profitCached),
      );
      return;
    }

    const cacheKey = activeTab === 'expenses'
      ? 'expenses'
      : (activeTab === 'stock' || activeTab === 'dues')
        ? activeTab
        : buildReportCacheKey(activeTab, dateParams);

    const cached = getReportCache(cacheKey);
    if (cached) {
      restoreReportCache(activeTab, cached);
    }

    if (activeTab === 'expenses') {
      fetchExpensesReport(cacheKey, Boolean(cached));
      return;
    }

    if (activeTab === 'stock' || activeTab === 'dues') {
      fetchTab(activeTab, dateParams, Boolean(cached));
      return;
    }

    fetchTab(activeTab, dateParams, Boolean(cached));
  }, [activeTab, dateParams, fetchTab, fetchExpensesReport, profitGroup]);

  const isLoading = tabLoading['sales'] ?? false;
  const errorMessage = tabError[activeTab] ?? null;

  const outstandingDues = useMemo(
    () => (dueData?.reduce((acc, c) => acc + Number(c.totalDue), 0) ?? 0).toFixed(2),
    [dueData],
  );

  const aov = useMemo(() => {
    const revenue = Number(summaryData?.totalRevenue ?? 0);
    const count = Number(summaryData?.totalSalesCount ?? 0);
    return count > 0 ? revenue / count : 0;
  }, [summaryData]);

  const grossProfit = Number(summaryData?.totalProfit ?? 0);
  const netAfterExpenses = Math.round((grossProfit - periodExpenses) * 100) / 100;

  const handleAskAi = async () => {
    if (!summaryData) return;
    setIsAiDialogOpen(true);
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summaryData }),
      });
      const data = await res.json();
      setAiAdvice(data.success ? data.advice : 'Sorry, could not fetch AI advice right now.');
    } catch {
      setAiAdvice('Sorry, could not fetch AI advice right now.');
    } finally {
      setIsAiLoading(false);
    }
  };

  return {
    salesData,
    summaryData,
    stockData,
    dueData,
    topProducts,
    categoryData,
    topCustomers,
    tabLoading,
    tabError,
    chartType,
    setChartType,
    aiAdvice,
    isAiLoading,
    isAiDialogOpen,
    setIsAiDialogOpen,
    selectedCustomer,
    setSelectedCustomer,
    customerDetail,
    setCustomerDetail,
    isCustomerDetailLoading,
    setIsCustomerDetailLoading,
    selectedProduct,
    setSelectedProduct,
    productDetail,
    setProductDetail,
    isProductDetailLoading,
    setIsProductDetailLoading,
    activeTab,
    setActiveTab,
    expensesData,
    expensesLoading,
    purchasesData,
    profitGroup,
    setProfitGroup,
    profitRows,
    profitSummary,
    profitInsights,
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    isToday,
    dateParams,
    fetchTab,
    isLoading,
    errorMessage,
    outstandingDues,
    periodExpenses,
    netAfterExpenses,
    aov,
    handleAskAi,
  };
}
