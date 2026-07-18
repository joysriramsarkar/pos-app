'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CustomerDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  customerPhone: string;
  detailLoading: boolean;
  customerDetail: any;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function CustomerDetailDialog({
  open,
  onOpenChange,
  customerName,
  customerPhone,
  detailLoading,
  customerDetail,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  t,
}: CustomerDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customerName}</DialogTitle>
          <DialogDescription>{customerPhone}</DialogDescription>
        </DialogHeader>

        {detailLoading ? (
          <div className="py-10 text-center text-xs text-muted-foreground">{t('loading')}</div>
        ) : !customerDetail ? (
          <div className="py-10 text-center text-xs text-muted-foreground">No data available</div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                <p className="text-sm font-bold text-indigo-600">{formatPrice(customerDetail.totalSpent)}</p>
                <p className="text-[10px] text-muted-foreground">{t('total_spent')}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                <p className={`text-sm font-bold ${Number(customerDetail.totalProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {formatPrice(Number(customerDetail.totalProfit || 0))}
                </p>
                <p className="text-[10px] text-muted-foreground">{t('profit')}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                <p className="text-sm font-bold">{formatStringNumbers(String(customerDetail.profitMargin ?? 0))}%</p>
                <p className="text-[10px] text-muted-foreground">{t('margin_label')}</p>
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
                      <TableHead className="text-[10px] py-1">{t('product')}</TableHead>
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
  );
}
