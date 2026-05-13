'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  IndianRupee,
  ShoppingCart,
  AlertTriangle,
  Clock,
  Plus,
  Package,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  LogOut,
  Wallet,
} from 'lucide-react';
import { useProductsStore, useCartStore, useSalesStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { STORE_CONFIG, Sale } from '@/types/pos';
import { cn } from '@/lib/utils';
import { useLogout } from '@/hooks/use-logout';
import { TransactionDetailsDialog } from '@/components/pos/transaction-history/TransactionDetailsDialog';
import type { Transaction } from '@/components/pos/transaction-history/types';

interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  duePayments: number;
  salesComparison?: string;
  ordersComparison?: string;
}

interface RecentTransaction {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: Date;
}



interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const t = useTranslations('Dashboard');
  const handleLogout = useLogout();
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string; username?: string })?.name
    || (session?.user as { username?: string })?.username
    || 'User';
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayOrders: 0,
    duePayments: 0,
    salesComparison: 'N/A',
    ordersComparison: 'N/A',
  });
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [breakdown, setBreakdown] = useState<{ upi: number; cash: number; due: number }>({ upi: 0, cash: 0, due: 0 });
  const [todayExpenses, setTodayExpenses] = useState<number>(0);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [fullTransactions, setFullTransactions] = useState<Transaction[]>([]);
  
  const products = useProductsStore((state) => state.products);
  const sales = useSalesStore((state) => state.sales);
  const { settings } = useSettingsStore();
  const storeName = settings.store_name || STORE_CONFIG.name;
  const storeNameBn = settings.store_name_bn || STORE_CONFIG.nameBn;
  const storeLogo = settings.store_logo;
  const lowStockProducts = products.filter(p => p.currentStock <= p.minStockLevel && p.isActive);

  // ✅ Derive recent transactions from store sales (always up-to-date)
  useEffect(() => {
    const recentSales = sales.slice(0, 5); // Get 5 most recent
    const recentTransactions = recentSales.map((sale) => ({
      id: sale.id ?? '',
      invoiceNumber: sale.invoiceNumber ?? 'N/A',
      customerName: sale.customer?.name,
      totalAmount: Number(sale.totalAmount) || 0,
      paymentMethod: sale.paymentMethod ?? 'Unknown',
      createdAt: new Date(sale.createdAt ?? Date.now()),
    }));
    
    const fullTransactionsData = recentSales.map((sale: Sale) => ({
      ...sale,
      createdAt: new Date(sale.createdAt ?? Date.now()),
    } as Transaction));
    
    setTransactions(recentTransactions);
    setFullTransactions(fullTransactionsData);
  }, [sales]);



  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [salesResult, statsResult] = await Promise.allSettled([
          fetch('/api/sales?limit=5'),
          fetch(`/api/stats?tzOffset=${new Date().getTimezoneOffset()}`),
        ]);

        // Safe sales handling
        if (salesResult.status === 'fulfilled' && salesResult.value.ok) {
          try {
            const response = await salesResult.value.json();
            const apiSales = response.data ?? [];
            
            // Merge API sales with local store to preserve unsynced sales
            const currentSales = useSalesStore.getState().sales;
            const apiIds = new Set(apiSales.map((s: Sale) => s.id));
            const mergedSales = [...apiSales];
            
            currentSales.forEach(ls => {
              if (!apiIds.has(ls.id)) {
                mergedSales.push(ls);
              }
            });
            
            mergedSales.sort((a, b) => new Date(b.createdAt || Date.now()).getTime() - new Date(a.createdAt || Date.now()).getTime());
            
            // Update store, which will trigger the other useEffect to update transactions
            useSalesStore.setState({ sales: mergedSales.slice(0, 50) });
          } catch (parseErr) {
            console.error('Failed to parse sales response:', parseErr);
          }
        }

        // Safe stats handling
        if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
          try {
            const response = await statsResult.value.json();
            const apiStats = response.data ?? {};
            setStats(prevStats => ({
              ...prevStats,
              todaySales: Number(apiStats.todaySales) || 0,
              todayOrders: Number(apiStats.todayOrders) || 0,
              duePayments: Number(apiStats.duePayments) || 0,
              salesComparison: apiStats.salesComparison || 'N/A',
              ordersComparison: apiStats.ordersComparison || 'N/A',
            }));
          } catch (parseErr) {
            console.error('Failed to parse stats response:', parseErr);
          }
        }

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }

      // Safe payment breakdown computation
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tomorrow = new Date(todayStart);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const salesRes = await fetch(
          `/api/sales?dateFrom=${encodeURIComponent(todayStart.toISOString())}&dateTo=${encodeURIComponent(tomorrow.toISOString())}&status=Completed&limit=1000`
        );

        if (salesRes.ok) {
          const response = await salesRes.json();
          const todaySales = response.data ?? [];
          let upiTotal = 0;
          let cashTotal = 0;
          let dueTotal = 0;

          (todaySales as Sale[]).forEach((s: Sale) => {
            const amtPaid = Number(s?.amountPaid || 0) || 0;
            const totalAmt = Number(s?.totalAmount || 0) || 0;
            const method = s?.paymentMethod;
            
            if (method === 'UPI') {
              upiTotal += amtPaid;
            } else if (method === 'Cash') {
              cashTotal += amtPaid;
            } else if (method === 'Mixed') {
              cashTotal += Number(s?.cashAmount || 0);
              upiTotal += Number(s?.upiAmount || 0);
            }

            if (amtPaid < totalAmt) {
              dueTotal += totalAmt - amtPaid;
            }
          });

          setBreakdown({ upi: upiTotal, cash: cashTotal, due: dueTotal });
        }
      } catch (err) {
        console.error('Failed to compute payment breakdown:', err);
        setBreakdown({ upi: 0, cash: 0, due: 0 });
      }

      // Fetch today's expenses
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tomorrow = new Date(todayStart);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const expRes = await fetch(
          `/api/expenses?dateFrom=${encodeURIComponent(todayStart.toISOString())}&dateTo=${encodeURIComponent(tomorrow.toISOString())}`
        );
        if (expRes.ok) {
          const expData = await expRes.json();
          const total = (expData.data ?? []).reduce((sum: number, item: { amount: unknown }) => sum + Number(item.amount), 0);
          setTodayExpenses(total);
        }
      } catch (err) {
        console.error('Failed to fetch today expenses:', err);
      }
    };
    fetchDashboardData();

    // Listen for sync completion to refresh stats
    const handleSyncComplete = () => {
      fetchDashboardData();
    };
    window.addEventListener('offlineSyncComplete', handleSyncComplete);

    return () => {
      window.removeEventListener('offlineSyncComplete', handleSyncComplete);
    };
  }, []);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const handleQuickAction = (action: string) => {
    if (onNavigate) {
      onNavigate(action);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {storeLogo && <img src={storeLogo} alt="logo" className="w-7 h-7 object-contain rounded" />}
              <div>
                <h1 className="text-lg font-bold leading-tight">{storeName}</h1>
                <p className="text-xs text-muted-foreground">{storeNameBn}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              <p className="text-xs font-medium">{userName}</p>
            </div>
            <div className="flex flex-col items-end sm:hidden">
              <p className="text-xs font-medium">{userName}</p>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30 h-8"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-xs">Logout</span>
            </Button>
          </div>
        </div>
        {/* Payment Breakdown - compact inline mobile, card on desktop */}
        <div className="mt-2 grid grid-cols-3 gap-2 sm:hidden">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-green-50/80 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30">
            <span className="text-[10px] text-green-700 dark:text-green-400 font-medium">UPI</span>
            <span className="text-xs font-bold text-green-700 dark:text-green-400">{formatPrice(breakdown.upi)}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-blue-50/80 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
            <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">Cash</span>
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400">{formatPrice(breakdown.cash)}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-red-50/80 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
            <span className="text-[10px] text-red-700 dark:text-red-400 font-medium">Due</span>
            <span className="text-xs font-bold text-red-700 dark:text-red-400">{formatPrice(breakdown.due)}</span>
          </div>
        </div>
        <div className="hidden sm:block mt-3">
          <Card className="rounded-2xl shadow-sm border-border/50 bg-linear-to-br from-card to-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Today's Payments Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-green-50/60 dark:bg-green-900/20 text-center">
                  <div className="text-xs text-muted-foreground">UPI</div>
                  <div className="text-xl font-bold text-green-700">{formatPrice(breakdown.upi)}</div>
                </div>
                <div className="p-4 rounded-lg bg-blue-50/60 dark:bg-blue-900/20 text-center">
                  <div className="text-xs text-muted-foreground">Cash</div>
                  <div className="text-xl font-bold text-blue-700">{formatPrice(breakdown.cash)}</div>
                </div>
                <div className="p-4 rounded-lg bg-red-50/60 dark:bg-red-900/20 text-center">
                  <div className="text-xs text-muted-foreground">Due</div>
                  <div className="text-xl font-bold text-red-700">{formatPrice(breakdown.due)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6 pb-24">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Today's Sales */}
            <Card className="bg-linear-to-br from-green-50 to-green-100/50 dark:from-green-950/40 dark:to-green-900/20 border-green-200 dark:border-green-800/50 shadow-md hover:shadow-lg transition-shadow rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">{t('today_sales')}</CardTitle>
                <div className="w-8 h-8 rounded-full bg-green-200/50 dark:bg-green-800/50 flex items-center justify-center">
                  <IndianRupee className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-green-700 dark:text-green-400 tracking-tight">{formatPrice(stats.todaySales)}</div>
                <p className="text-xs text-green-600 dark:text-green-500 flex items-center mt-1 font-medium">
                  {stats.salesComparison === 'N/A' ? null : stats.salesComparison?.startsWith('-') ? (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  )}
                  {stats.salesComparison || 'N/A'}
                </p>
              </CardContent>
            </Card>

            {/* Today's Orders */}
            <Card className="bg-linear-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800/50 shadow-md hover:shadow-lg transition-shadow rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('today_orders')}</CardTitle>
                <div className="w-8 h-8 rounded-full bg-blue-200/50 dark:bg-blue-800/50 flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-blue-700 dark:text-blue-400 tracking-tight">{stats.todayOrders}</div>
                <p className="text-xs text-blue-600 dark:text-blue-500 flex items-center mt-1 font-medium">
                  {stats.ordersComparison === 'N/A' ? null : stats.ordersComparison?.startsWith('-') ? (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  )}
                  {stats.ordersComparison || 'N/A'}
                </p>
              </CardContent>
            </Card>

            {/* Low Stock Items */}
            <Card className="bg-linear-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/50 shadow-md hover:shadow-lg transition-shadow rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">{t('low_stock')}</CardTitle>
                <div className="w-8 h-8 rounded-full bg-amber-200/50 dark:bg-amber-800/50 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-amber-700 dark:text-amber-400 tracking-tight">{lowStockProducts.length}</div>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 font-medium">Items need restock</p>
              </CardContent>
            </Card>

            {/* Due Payments */}
            <Card className="bg-linear-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/20 border-red-200 dark:border-red-800/50 shadow-md hover:shadow-lg transition-shadow rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">{t('due_payments')}</CardTitle>
                <div className="w-8 h-8 rounded-full bg-red-200/50 dark:bg-red-800/50 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-red-700 dark:text-red-400 tracking-tight">{formatPrice(stats.duePayments)}</div>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1 font-medium">Total pending dues</p>
              </CardContent>
            </Card>

            {/* Today's Expenses */}
            <Card className="bg-linear-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800/50 shadow-md hover:shadow-lg transition-shadow rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-400">আজকের খরচ</CardTitle>
                <div className="w-8 h-8 rounded-full bg-rose-200/50 dark:bg-rose-800/50 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-400 tracking-tight">{formatPrice(todayExpenses)}</div>
                <p className="text-xs text-rose-600 dark:text-rose-500 mt-1 font-medium">দোকানের মোট খরচ</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="rounded-2xl shadow-sm border-border/50 bg-linear-to-br from-card to-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">{t('quick_actions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 md:gap-4">
                <Button 
                  variant="outline" 
                  className="h-auto flex-col gap-3 py-5 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all shadow-xs group"
                  onClick={() => handleQuickAction('billing')}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">{t('new_sale')}</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-auto flex-col gap-3 py-5 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all shadow-xs group"
                  onClick={() => handleQuickAction('stock')}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">{t('add_stock')}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-3 py-5 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all shadow-xs group"
                  onClick={() => handleQuickAction('parties')}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">{t('add_party')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low Stock Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Low Stock Items
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleQuickAction('stock')}>
                  View All <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-60">
                  <div className="px-6 pb-4 space-y-2">
                    {lowStockProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">All items are well stocked!</p>
                    ) : (
                      lowStockProducts.slice(0, 5).map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.category}</p>
                          </div>
                          <div className="text-right ml-4">
                            <Badge
                              variant={product.currentStock === 0 ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {product.currentStock === 0 ? 'Out of Stock' : `${product.currentStock} left`}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">Min: {product.minStockLevel}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-500" />
                  Recent Transactions
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleQuickAction('transactions')}>
                  View All <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-60">
                  <div className="px-6 pb-4 space-y-2">
                    {transactions.map((txn) => (
                      <div
                        key={txn.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => {
                          const full = fullTransactions.find(t => t.id === txn.id);
                          if (full) { setSelectedTransaction(full); setIsDetailOpen(true); }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{txn.invoiceNumber}</p>
                            <Badge
                              variant={txn.paymentMethod === 'Due' ? 'destructive' : txn.paymentMethod === 'UPI' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {txn.paymentMethod}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {txn.customerName || 'Walk-in'} • {formatTime(txn.createdAt)}
                          </p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-semibold">{formatPrice(txn.totalAmount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <TransactionDetailsDialog
        transaction={selectedTransaction}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdateStatus={() => {}}
      />
    </div>
  );
}

export default Dashboard;
