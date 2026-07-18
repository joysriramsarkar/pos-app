'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  TrendingUp, TrendingDown, DollarSign, Package, Users,
  AlertTriangle, Lightbulb, Banknote, Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';

import { ProductDetailContent } from './ProductDetailContent';
import { CustomerDetailContent } from './CustomerDetailContent';
import { ExpensesTabContent } from './ExpensesTabContent';
import { DateFilterBar, CustomDateInputs as CustomDateInputsBar } from './DateFilterBar';
import { useReportsData } from './useReportsData';
import { SalesTab } from './tabs/SalesTab';
import { ProfitTab } from './tabs/ProfitTab';
import { PaymentTab } from './tabs/PaymentTab';
import { StockTab } from './tabs/StockTab';
import { DuesTab } from './tabs/DuesTab';
import { ProductsTab } from './tabs/ProductsTab';
import { CategoriesTab } from './tabs/CategoriesTab';
import { CustomersTab } from './tabs/CustomersTab';
import { SuppliersTab } from './tabs/SuppliersTab';

const Reports: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const t = useTranslations('Reports');
  const { formatNumber, formatPrice } = useNumberFormat();
  const d = useReportsData();

  const DateFilter = (
    <DateFilterBar preset={d.preset} onPresetChange={d.setPreset} />
  );

  const CustomDateInputs = d.preset === 'custom' && (
    <CustomDateInputsBar
      customFrom={d.customFrom}
      customTo={d.customTo}
      onFromChange={d.setCustomFrom}
      onToChange={d.setCustomTo}
    />
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden bg-muted/20">
      <div className="shrink-0 border-b bg-background p-4">
        <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Dialog open={d.isAiDialogOpen} onOpenChange={d.setIsAiDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <Lightbulb className="w-5 h-5" />
              {t('ai_advisor')}
            </DialogTitle>
            <DialogDescription>
              {t('ai_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted/30 rounded-xl min-h-25 text-sm whitespace-pre-wrap">
            {d.isAiLoading ? t('ai_loading') : d.aiAdvice}
          </div>
        </DialogContent>
      </Dialog>

      {d.errorMessage && (
        <div className="shrink-0 bg-destructive/10 border-b border-destructive/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive flex-1">{d.errorMessage}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => d.fetchTab(d.activeTab, d.dateParams)}
            className="text-destructive hover:text-destructive min-h-9"
          >
            {t('retry')}
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-6 pb-24">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{t('total_revenue')}</CardTitle>
              <DollarSign className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold">{formatPrice(d.summaryData?.totalRevenue ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {(d.summaryData?.revenueGrowth ?? 0) >= 0
                  ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                  : <TrendingDown className="w-3 h-3 text-red-500" />}
                <span className={`font-medium ${(d.summaryData?.revenueGrowth ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {d.summaryData?.revenueGrowth || '0'}%
                </span>
                <span className="hidden sm:inline"> {t('vs_prev')}</span>
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{t('gross_profit')}</CardTitle>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-emerald-600">{formatPrice(d.summaryData?.totalProfit ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-emerald-500 font-medium">{d.summaryData?.profitMargin || '0'}%</span> {t('margin')}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{t('period_expenses')}</CardTitle>
              <Banknote className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-red-600">{formatPrice(d.periodExpenses)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('in_period')}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-emerald-100 dark:border-emerald-900/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{t('net_after_expenses')}</CardTitle>
              <Wallet className="w-4 h-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-lg md:text-2xl font-bold ${d.netAfterExpenses >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                {formatPrice(d.netAfterExpenses)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('profit_minus_expenses')}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{t('total_sales')}</CardTitle>
              <Package className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold">{formatNumber(d.summaryData?.totalSalesCount || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('aov')}: {formatPrice(d.aov)}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{t('dues')}</CardTitle>
              <Users className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-amber-600">{formatPrice(Number(d.outstandingDues))}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('to_collect')}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="sales" className="w-full" onValueChange={d.setActiveTab}>
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="h-auto flex flex-wrap gap-1 bg-muted p-1 rounded-lg w-full sm:w-auto">
              <TabsTrigger className="flex-1 sm:flex-none" value="sales">{t('tab_sales')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="profit">{t('tab_profit')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="payment">{t('tab_payment')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="stock">{t('tab_stock')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="dues">{t('tab_dues')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="products">{t('tab_products')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="categories">{t('tab_categories')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="customers">{t('tab_customers')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="expenses">{t('tab_expenses')}</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="suppliers">{t('tab_suppliers') || 'Suppliers'}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sales">
            <SalesTab
              salesData={d.salesData}
              summaryData={d.summaryData}
              isLoading={d.isLoading}
              isToday={d.isToday}
              preset={d.preset}
              chartType={d.chartType}
              onChartTypeChange={d.setChartType}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
              onAskAi={d.handleAskAi}
            />
          </TabsContent>

          <TabsContent value="profit">
            <ProfitTab
              profitGroup={d.profitGroup}
              onProfitGroupChange={d.setProfitGroup}
              profitRows={d.profitRows}
              profitSummary={d.profitSummary}
              profitInsights={d.profitInsights}
              isLoading={!!d.tabLoading['profit']}
              error={d.tabError['profit'] ?? null}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
            />
          </TabsContent>

          <TabsContent value="payment">
            <PaymentTab
              summaryData={d.summaryData}
              isLoading={!!(d.tabLoading['payment'] || d.tabLoading['sales'])}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
            />
          </TabsContent>

          <TabsContent value="stock">
            <StockTab
              stockData={d.stockData}
              isLoading={!!d.tabLoading['stock']}
              error={d.tabError['stock'] ?? null}
              onNavigate={onNavigate}
            />
          </TabsContent>

          <TabsContent value="dues">
            <DuesTab
              dueData={d.dueData}
              outstandingDues={d.outstandingDues}
              isLoading={!!d.tabLoading['dues']}
              error={d.tabError['dues'] ?? null}
              onNavigate={onNavigate}
            />
          </TabsContent>

          <TabsContent value="products">
            <ProductsTab
              topProducts={d.topProducts}
              isLoading={!!d.tabLoading['products']}
              error={d.tabError['products'] ?? null}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
              onSelectProduct={d.setSelectedProduct}
            />
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesTab
              categoryData={d.categoryData}
              isLoading={!!d.tabLoading['categories']}
              error={d.tabError['categories'] ?? null}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
            />
          </TabsContent>

          <TabsContent value="expenses">
            <div className="flex flex-wrap gap-2 mb-3">{DateFilter}</div>
            {CustomDateInputs}
            <ExpensesTabContent
              expenses={d.expensesData}
              dateParams={d.dateParams}
              onNavigate={onNavigate}
              isLoading={d.expensesLoading}
            />
          </TabsContent>

          <TabsContent value="customers">
            <CustomersTab
              topCustomers={d.topCustomers}
              isLoading={!!d.tabLoading['customers']}
              error={d.tabError['customers'] ?? null}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
              onSelectCustomer={d.setSelectedCustomer}
            />
          </TabsContent>

          <TabsContent value="suppliers">
            <SuppliersTab
              purchasesData={d.purchasesData}
              isLoading={!!d.tabLoading['suppliers']}
              error={d.tabError['suppliers'] ?? null}
              dateFilter={DateFilter}
              customDateInputs={CustomDateInputs}
              onNavigate={onNavigate}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!d.selectedProduct} onOpenChange={(open) => {
        if (!open) { d.setSelectedProduct(null); d.setProductDetail(null); }
      }}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {d.selectedProduct?.name}
            </DialogTitle>
            <DialogDescription>
              {d.selectedProduct?.nameBn || d.selectedProduct?.name || t('product')}
            </DialogDescription>
          </DialogHeader>
          {d.selectedProduct && (
            <ProductDetailContent
              product={d.selectedProduct}
              dateParams={d.dateParams}
              detail={d.productDetail}
              setDetail={d.setProductDetail}
              isLoading={d.isProductDetailLoading}
              setIsLoading={d.setIsProductDetailLoading}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!d.selectedCustomer} onOpenChange={(open) => {
        if (!open) { d.setSelectedCustomer(null); d.setCustomerDetail(null); }
      }}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{d.selectedCustomer?.name}</DialogTitle>
            <DialogDescription>{d.selectedCustomer?.phone || d.selectedCustomer?.name || t('customer')}</DialogDescription>
          </DialogHeader>
          {d.selectedCustomer && (
            <CustomerDetailContent
              customer={d.selectedCustomer}
              dateParams={d.dateParams}
              detail={d.customerDetail}
              setDetail={d.setCustomerDetail}
              isLoading={d.isCustomerDetailLoading}
              setIsLoading={d.setIsCustomerDetailLoading}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default React.memo(Reports);
