'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Truck, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { PurchaseOrder } from './types';
import { getStatusBadge, getProductName } from './utils';

interface PurchaseOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedOrder: PurchaseOrder | null;
  saving: boolean;
  formatPrice: (value: number) => string;
  formatDate: (date: Date) => string;
  onPlaceOrder: (order: PurchaseOrder) => void;
  onReceiveOrder: (order: PurchaseOrder) => void;
  onCancelOrder: (order: PurchaseOrder) => void;
}

export function PurchaseOrderDetailDialog({
  open,
  onOpenChange,
  selectedOrder,
  saving,
  formatPrice,
  formatDate,
  onPlaceOrder,
  onReceiveOrder,
  onCancelOrder,
}: PurchaseOrderDetailDialogProps) {
  const t = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('order_details')}</DialogTitle>
          <DialogDescription>{selectedOrder?.orderNumber}</DialogDescription>
        </DialogHeader>
        {selectedOrder && (
          <div className="space-y-4">
            {/* Order Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{t('order_number')}</p>
                <p className="font-mono font-bold">{selectedOrder.orderNumber}</p>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{tc('status')}</p>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{t('supplier')}</p>
                <p className="font-medium">{selectedOrder.supplier?.name || t('no_supplier')}</p>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{t('total_price')}</p>
                <p className="font-bold">{formatPrice(selectedOrder.totalAmount)}</p>
              </div>
            </div>

            {selectedOrder.expectedDate && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{t('expected_date')}</p>
                <p className="font-medium">{formatDate(new Date(selectedOrder.expectedDate))}</p>
              </div>
            )}

            {selectedOrder.notes && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{t('notes')}</p>
                <p className="text-sm">{selectedOrder.notes}</p>
              </div>
            )}

            <Separator />

            {/* Items */}
            <div>
              <h4 className="font-medium mb-2">{t('items_count', { count: selectedOrder.items.length })}</h4>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>{tc('name')}</TableHead>
                          <TableHead className="text-right">{t('quantity')}</TableHead>
                          <TableHead className="text-right">{t('unit_price')}</TableHead>
                          <TableHead className="text-right">{t('total_price')}</TableHead>
                          {selectedOrder.status === 'প্রাপ্ত' && (
                            <TableHead className="text-right">{t('received_qty')}</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">{getProductName(item)}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{formatPrice(item.unitPrice)}</TableCell>
                            <TableCell className="text-right font-medium">{formatPrice(item.totalPrice)}</TableCell>
                            {selectedOrder.status === 'প্রাপ্ত' && (
                              <TableCell className="text-right text-green-600">{item.receivedQty}</TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="bg-muted p-3 rounded-lg flex justify-between items-center">
              <span className="text-muted-foreground">{t('total_price')}</span>
              <span className="text-xl font-bold">{formatPrice(selectedOrder.totalAmount)}</span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {selectedOrder.status === 'পেন্ডিং' && (
                <Button onClick={() => onPlaceOrder(selectedOrder)} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Truck className="h-4 w-4" />
                  {t('place_order')}
                </Button>
              )}
              {(selectedOrder.status === 'পেন্ডিং' || selectedOrder.status === 'অর্ডার করা') && (
                <>
                  <Button onClick={() => onReceiveOrder(selectedOrder)} variant="outline" className="gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    {t('receive_order')}
                  </Button>
                  <Button onClick={() => onCancelOrder(selectedOrder)} variant="destructive" className="gap-2" disabled={saving}>
                    <XCircle className="h-4 w-4" />
                    {t('cancel_order')}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
