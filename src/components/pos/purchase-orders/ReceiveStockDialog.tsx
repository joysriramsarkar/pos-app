'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { PurchaseOrder, ReceiveItem } from './types';

interface ReceiveStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedOrder: PurchaseOrder | null;
  receiveItems: ReceiveItem[];
  setReceiveItems: (items: ReceiveItem[]) => void;
  receiveAmountPaid: string;
  setReceiveAmountPaid: (value: string) => void;
  receiveUpdateStock: boolean;
  setReceiveUpdateStock: (value: boolean) => void;
  receivePaymentMethod: string;
  setReceivePaymentMethod: (value: string) => void;
  receiveCashAmount: string;
  setReceiveCashAmount: (value: string) => void;
  receiveUpiAmount: string;
  setReceiveUpiAmount: (value: string) => void;
  receiveTotal: number;
  saving: boolean;
  formatPrice: (value: number) => string;
  currencySymbol: string;
  onReceive: () => void;
}

export function ReceiveStockDialog({
  open,
  onOpenChange,
  selectedOrder,
  receiveItems,
  setReceiveItems,
  receiveAmountPaid,
  setReceiveAmountPaid,
  receiveUpdateStock,
  setReceiveUpdateStock,
  receivePaymentMethod,
  setReceivePaymentMethod,
  receiveCashAmount,
  setReceiveCashAmount,
  receiveUpiAmount,
  setReceiveUpiAmount,
  receiveTotal,
  saving,
  formatPrice,
  currencySymbol,
  onReceive,
}: ReceiveStockDialogProps) {
  const t = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('receive_order')}</DialogTitle>
          <DialogDescription>{selectedOrder?.orderNumber}</DialogDescription>
        </DialogHeader>
        {selectedOrder && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              প্রাপ্ত পরিমাণ লিখুন। অর্ডার প্রাপ্ত হলে স্টক স্বয়ংক্রিয়ভাবে আপডেট হবে।
            </p>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>পণ্য</TableHead>
                        <TableHead className="text-right">অর্ডার</TableHead>
                        <TableHead className="text-right">{t('received_qty')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiveItems.map((item, idx) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.maxQty}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              value={item.receivedQty === 0 ? '' : item.receivedQty}
                              onChange={(e) => {
                                const val = convertBengaliToEnglishNumerals(e.target.value);
                                const cleaned = val.replace(/[^0-9]/g, '');
                                const intVal = parseInt(cleaned) || 0;
                                const finalVal = Math.min(intVal, item.maxQty);
                                const newItems = [...receiveItems];
                                newItems[idx] = { ...newItems[idx], receivedQty: finalVal };
                                setReceiveItems(newItems);
                              }}
                              onBlur={() => {
                                const receivedNum = parseFloat(item.receivedQty as string) || 0;
                                if (receivedNum < 0) {
                                  const newItems = [...receiveItems];
                                  newItems[idx] = { ...newItems[idx], receivedQty: 0 };
                                  setReceiveItems(newItems);
                                }
                              }}
                              className="h-8 w-20 ml-auto"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Running Total & Amount Paid for Receive Dialog */}
            {receiveTotal > 0 && (() => {
              const receivePaidVal = parseFloat(receiveAmountPaid) || 0;
              const receiveDueAmount = Math.round((receiveTotal - receivePaidVal + Number.EPSILON) * 100) / 100;
              return (
                <div className="space-y-3 p-3 bg-muted rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">প্রাপ্ত মালপত্রের মোট মূল্য:</span>
                    <span className="font-bold">{formatPrice(receiveTotal)}</span>
                  </div>
                  {selectedOrder.supplierId && (
                    <div className="space-y-1.5 border-t pt-2.5">
                      <Label htmlFor="receive-amount-paid" className="text-xs">পরিশোধিত টাকা (ঐচ্ছিক)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
                        <Input
                          id="receive-amount-paid"
                          type="text"
                          value={receiveAmountPaid}
                          onChange={(e) => {
                            const val = convertBengaliToEnglishNumerals(e.target.value);
                            const cleaned = val.replace(/[^0-9.]/g, '');
                            const dotCount = (cleaned.match(/\./g) || []).length;
                            if (dotCount > 1) return;
                            setReceiveAmountPaid(cleaned);
                          }}
                          placeholder="সম্পূর্ণ পরিশোধিত হলে ফাঁকা রাখুন"
                          className="pl-9 h-8 text-sm bg-background"
                          readOnly={receivePaymentMethod === 'Mixed'}
                        />
                      </div>
                    </div>
                  )}

                  {receivePaidVal > 0 && (
                    <div className="flex justify-between items-center text-sm border-t pt-1 border-dashed border-border/50">
                      <span className="text-muted-foreground">পরিশোধিত টাকা:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{formatPrice(receivePaidVal)}</span>
                    </div>
                  )}
                  {receiveDueAmount > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-red-500 font-medium">বকেয়া (Due):</span>
                      <span className="font-bold text-red-600 dark:text-red-400">{formatPrice(receiveDueAmount)}</span>
                    </div>
                  )}

                  {/* Payment Method for Receive Dialog */}
                  {selectedOrder.supplierId && (
                    <div className="space-y-1.5 border-t pt-2.5">
                      <Label htmlFor="receive-payment-method" className="text-xs">পেমেন্ট পদ্ধতি</Label>
                      <Select value={receivePaymentMethod} onValueChange={setReceivePaymentMethod}>
                        <SelectTrigger id="receive-payment-method" className="h-8 text-sm bg-background">
                          <SelectValue placeholder="পেমেন্ট পদ্ধতি নির্বাচন করুন" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                          <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                          <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {receivePaymentMethod === 'Mixed' && (
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="space-y-1">
                        <Label htmlFor="receive-cash-amount" className="text-xs">নগদ পরিমাণ</Label>
                        <Input
                          id="receive-cash-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={receiveCashAmount}
                          onChange={(e) => setReceiveCashAmount(e.target.value)}
                          placeholder="নগদ"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="receive-upi-amount" className="text-xs">ইউপিআই পরিমাণ</Label>
                        <Input
                          id="receive-upi-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={receiveUpiAmount}
                          onChange={(e) => setReceiveUpiAmount(e.target.value)}
                          placeholder="ইউপিআই"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Update Stock Checkbox */}
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="receive-update-stock"
            checked={receiveUpdateStock}
            onCheckedChange={(checked) => setReceiveUpdateStock(checked === true)}
          />
          <label
            htmlFor="receive-update-stock"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            স্টক আপডেট করুন (Update Stock)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={onReceive} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('receive_order')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
