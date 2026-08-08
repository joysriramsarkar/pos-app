'use client';

import { useState } from 'react';
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
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';

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
  onPaymentSuccess?: () => void;
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
  onPaymentSuccess,
}: PurchaseOrderDetailDialogProps) {
  const t = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amountToPay, setAmountToPay] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const handleSavePayment = async () => {
    if (!selectedOrder) return;
    const amount = parseFloat(amountToPay);
    if (isNaN(amount) || amount <= 0) {
      toast.error('সঠিক পরিমাণ লিখুন');
      return;
    }

    setRecordingPayment(true);
    try {
      const res = await fetch(`/api/purchase-orders/${selectedOrder.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaid: amount,
          paymentMethod,
          cashAmount: paymentMethod === 'Mixed' ? (parseFloat(cashAmount) || 0) : undefined,
          upiAmount: paymentMethod === 'Mixed' ? (parseFloat(upiAmount) || 0) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('পেমেন্ট সফলভাবে রেকর্ড হয়েছে');
        setShowPaymentForm(false);
        setAmountToPay('');
        setCashAmount('');
        setUpiAmount('');
        if (onPaymentSuccess) onPaymentSuccess();
      } else {
        toast.error(data.error || 'পেমেন্ট রেকর্ড করতে ব্যর্থ');
      }
    } catch (err) {
      toast.error('নেটওয়ার্ক ত্রুটি হয়েছে');
    } finally {
      setRecordingPayment(false);
    }
  };

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

            {/* Payment Details */}
            {selectedOrder.status === 'প্রাপ্ত' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  পেমেন্ট সংক্রান্ত তথ্য
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">মোট বিল:</span>
                    <span className="font-bold text-sm">{formatPrice(selectedOrder.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">পরিশোধিত:</span>
                    <span className="font-bold text-sm text-green-600">{formatPrice(selectedOrder.paidAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">বকেয়া:</span>
                    <span className="font-bold text-sm text-amber-600">
                      {formatPrice(Math.max(0, selectedOrder.totalAmount - selectedOrder.paidAmount))}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">পেমেন্ট পদ্ধতি:</span>
                    <span className="font-semibold text-sm">
                      {selectedOrder.paymentMethod === 'Cash' ? 'নগদ' : selectedOrder.paymentMethod === 'UPI' ? 'ইউপিআই' : selectedOrder.paymentMethod === 'Mixed' ? 'মিশ্র' : selectedOrder.paymentMethod || '—'}
                    </span>
                  </div>
                </div>
                <div className="pt-1.5 flex items-center justify-between text-xs border-t border-slate-200">
                  <span className="text-muted-foreground">পেমেন্ট অবস্থা:</span>
                  <span className={`font-bold uppercase ${selectedOrder.paymentStatus === 'Paid' ? 'text-green-600' : selectedOrder.paymentStatus === 'Partial' ? 'text-amber-500' : 'text-red-500'}`}>
                    {selectedOrder.paymentStatus === 'Paid' ? 'Paid (পরিশোধিত)' : selectedOrder.paymentStatus === 'Partial' ? 'Partial (আংশিক)' : 'Pending (বকেয়া)'}
                  </span>
                </div>
              </div>
            )}

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

            {/* Collapsible Payment Form */}
            {showPaymentForm && (
              <div className="border border-indigo-100 bg-indigo-50/20 p-4 rounded-xl space-y-3">
                <h4 className="font-bold text-sm text-indigo-900">পেমেন্ট রেকর্ড করুন</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium">পরিশোধের পরিমাণ</label>
                    <Input
                      type="text"
                      placeholder="পরিমাণ"
                      value={amountToPay}
                      onChange={(e) => {
                        const val = convertBengaliToEnglishNumerals(e.target.value);
                        const cleaned = val.replace(/[^0-9.]/g, '');
                        const dotCount = (cleaned.match(/\./g) || []).length;
                        if (dotCount > 1) return;
                        setAmountToPay(cleaned);
                      }}
                      className="h-9 mt-1 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium">পেমেন্ট পদ্ধতি</label>
                    <Select value={paymentMethod} onValueChange={(val) => {
                      setPaymentMethod(val);
                      if (val === 'Mixed') {
                        setCashAmount('');
                        setUpiAmount('');
                      }
                    }}>
                      <SelectTrigger className="h-9 mt-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">নগদ (Cash)</SelectItem>
                        <SelectItem value="UPI">ইউপিআই (UPI)</SelectItem>
                        <SelectItem value="Mixed">মিশ্র (Mixed)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {paymentMethod === 'Mixed' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">নগদ পরিমাণ</label>
                      <Input
                        type="text"
                        placeholder="নগদ"
                        value={cashAmount}
                        onChange={(e) => {
                          const val = convertBengaliToEnglishNumerals(e.target.value);
                          const cleaned = val.replace(/[^0-9.]/g, '');
                          const dotCount = (cleaned.match(/\./g) || []).length;
                          if (dotCount > 1) return;
                          setCashAmount(cleaned);
                          const total = parseFloat(amountToPay) || 0;
                          const cash = parseFloat(cleaned) || 0;
                          setUpiAmount(Number(Math.max(0, total - cash).toFixed(2)).toString());
                        }}
                        className="h-9 mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">ইউপিআই পরিমাণ</label>
                      <Input
                        type="text"
                        placeholder="ইউপিআই"
                        value={upiAmount}
                        onChange={(e) => {
                          const val = convertBengaliToEnglishNumerals(e.target.value);
                          const cleaned = val.replace(/[^0-9.]/g, '');
                          const dotCount = (cleaned.match(/\./g) || []).length;
                          if (dotCount > 1) return;
                          setUpiAmount(cleaned);
                          const total = parseFloat(amountToPay) || 0;
                          const upi = parseFloat(cleaned) || 0;
                          setCashAmount(Number(Math.max(0, total - upi).toFixed(2)).toString());
                        }}
                        className="h-9 mt-1 bg-white"
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowPaymentForm(false)} disabled={recordingPayment}>
                    বাতিল
                  </Button>
                  <Button size="sm" onClick={handleSavePayment} disabled={recordingPayment} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                    {recordingPayment && <Loader2 className="h-3 w-3 animate-spin" />}
                    সংরক্ষণ করুন
                  </Button>
                </div>
              </div>
            )}

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
                <Button onClick={() => onReceiveOrder(selectedOrder)} variant="outline" className="gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  {t('receive_order')}
                </Button>
              )}
              {(selectedOrder.status === 'পেন্ডিং' || selectedOrder.status === 'অর্ডার করা' || selectedOrder.status === 'প্রাপ্ত') && (
                <Button onClick={() => onCancelOrder(selectedOrder)} variant="destructive" className="gap-2" disabled={saving}>
                  <XCircle className="h-4 w-4" />
                  {t('cancel_order') || 'অর্ডার বাতিল'}
                </Button>
              )}
              {selectedOrder.status === 'প্রাপ্ত' && selectedOrder.paymentStatus !== 'Paid' && !showPaymentForm && (
                <Button onClick={() => {
                  setShowPaymentForm(true);
                  setAmountToPay(String(Math.max(0, selectedOrder.totalAmount - selectedOrder.paidAmount)));
                }} variant="outline" className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                  পেমেন্ট রেকর্ড করুন
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
