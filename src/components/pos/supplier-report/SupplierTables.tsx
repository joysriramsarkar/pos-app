'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck } from 'lucide-react';

interface SupplierTablesProps {
  loading: boolean;
  topSuppliers: any[];
  topProducts: any[];
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  t: (key: string) => string;
}

export function SupplierTables({
  loading,
  topSuppliers,
  topProducts,
  formatPrice,
  formatNumber,
  t,
}: SupplierTablesProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('purchases_by_supplier')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="sm:hidden divide-y">
            {loading ? (
              <p className="text-center py-4 text-muted-foreground text-xs">{t('loading')}</p>
            ) : topSuppliers.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</p>
            ) : (
              topSuppliers.map((s: any) => (
                <div key={s.id} className="p-3 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t('orders_placed_col')}: {formatNumber(s.orderCount)}</p>
                    </div>
                  </div>
                  <span className="font-bold text-primary">{formatPrice(s.totalAmount)}</span>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('supplier_name_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('orders_placed_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('total_purchases_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">{t('loading')}</TableCell>
                  </TableRow>
                ) : topSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  topSuppliers.map((s: any) => (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-semibold flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        {s.name}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(s.orderCount)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatPrice(s.totalAmount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('stock_purchased_items')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="sm:hidden divide-y">
            {loading ? (
              <p className="text-center py-4 text-muted-foreground text-xs">{t('loading')}</p>
            ) : topProducts.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</p>
            ) : (
              topProducts.map((p: any) => (
                <div key={p.id} className="p-3 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    {p.nameBn && <p className="text-[10px] text-muted-foreground">{p.nameBn}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {formatNumber(p.quantity)} units @ {formatPrice(p.avgPrice)}
                    </p>
                  </div>
                  <span className="font-bold text-primary">{formatPrice(p.totalSpent)}</span>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('product')}</TableHead>
                  <TableHead className="text-right text-xs">{t('qty_purchased_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('avg_price_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('spent_amount_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">{t('loading')}</TableCell>
                  </TableRow>
                ) : topProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  topProducts.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs">
                        <p className="font-semibold text-xs">{p.name}</p>
                        {p.nameBn && <p className="text-[10px] text-muted-foreground">{p.nameBn}</p>}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatNumber(p.quantity)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatPrice(p.avgPrice)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatPrice(p.totalSpent)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
