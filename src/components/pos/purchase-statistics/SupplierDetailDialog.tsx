'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck, Phone, Mail, MapPin, FileText, RefreshCw } from 'lucide-react';

interface SupplierDetailDialogProps {
  selectedSupplierId: string | null;
  supplierDetail: any | null;
  loadingDetail: boolean;
  onClose: () => void;
  formatPrice: (n: number) => string;
  formatDate: (d: Date, opts?: any) => string;
  formatStringNumbers: (s: string | number) => string;
  loadingLabel: string;
}

export function SupplierDetailDialog({
  selectedSupplierId,
  supplierDetail,
  loadingDetail,
  onClose,
  formatPrice,
  formatDate,
  formatStringNumbers,
  loadingLabel,
}: SupplierDetailDialogProps) {
  return (
    <Dialog open={!!selectedSupplierId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Truck className="w-5 h-5 text-indigo-600" />
            {loadingDetail ? 'সরবরাহকারীর তথ্য লোড হচ্ছে...' : (supplierDetail?.name || 'সরবরাহকারীর বিবরণ')}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            সরবরাহকারীর প্রোফাইল এবং লেনদেনের বিস্তারিত ইতিহাস
          </DialogDescription>
        </DialogHeader>

        {loadingDetail ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-muted-foreground">{loadingLabel}</p>
          </div>
        ) : supplierDetail ? (
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-xl border border-slate-100 shadow-xs">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b pb-1">যোগাযোগের তথ্য</h3>
                  {supplierDetail.phone ? (
                    <p className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-semibold">ফোন:</span> {formatStringNumbers(supplierDetail.phone)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" />
                      <span>ফোন নম্বর নেই</span>
                    </p>
                  )}
                  {supplierDetail.email ? (
                    <p className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-semibold">ইমেইল:</span> {supplierDetail.email}
                    </p>
                  ) : null}
                  {supplierDetail.address ? (
                    <p className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-semibold">ঠিকানা:</span> {supplierDetail.address}
                    </p>
                  ) : null}
                  {supplierDetail.notes ? (
                    <p className="text-xs flex items-start gap-2 text-slate-600 dark:text-slate-300">
                      <FileText className="w-3.5 h-3.5 text-indigo-500 mt-0.5" />
                      <span><span className="font-semibold">নোট:</span> {supplierDetail.notes}</span>
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-100 bg-indigo-50/30 dark:bg-indigo-950/10 flex flex-col justify-center">
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">মোট ক্রয়</span>
                  <span className="text-base font-black text-indigo-700 dark:text-indigo-300 mt-1">{formatPrice(supplierDetail.totalPurchases || 0)}</span>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-100 bg-emerald-50/30 dark:bg-emerald-950/10 flex flex-col justify-center">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">মোট পরিশোধ</span>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-1">{formatPrice(supplierDetail.totalPaid || 0)}</span>
                </div>
                <div className="col-span-2 p-3.5 rounded-xl border border-red-100 bg-red-50/30 dark:bg-red-950/10 flex flex-col justify-center">
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">বকেয়া পাওনা</span>
                  <span className="text-lg font-black text-red-700 dark:text-red-300 mt-1">{formatPrice(supplierDetail.totalDue || 0)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                লেনদেন ও খাতার হিসাব
              </h3>
              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-md">
                      <TableRow>
                        <TableHead className="w-24 text-xs font-semibold">তারিখ</TableHead>
                        <TableHead className="w-20 text-xs font-semibold">ধরণ</TableHead>
                        <TableHead className="text-xs font-semibold">বিবরণ</TableHead>
                        <TableHead className="text-right text-xs font-semibold">পরিমাণ</TableHead>
                        <TableHead className="text-right text-xs font-semibold">জের (বকেয়া)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!supplierDetail.ledgerEntries || supplierDetail.ledgerEntries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">কোনো লেনদেন পাওয়া যায়নি</TableCell>
                        </TableRow>
                      ) : (
                        supplierDetail.ledgerEntries.map((entry: any) => {
                          const isCredit = entry.entryType === 'credit';
                          return (
                            <TableRow key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                              <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(entry.createdAt), { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant={isCredit ? "secondary" : "default"} className={`text-[10px] px-1.5 py-0 h-5 font-semibold ${isCredit ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-indigo-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200"}`}>
                                  {isCredit ? 'ক্রয় (Credit)' : 'পরিশোধ (Debit)'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-medium max-w-[200px] truncate" title={entry.description}>{entry.description}</TableCell>
                              <TableCell className={`text-right text-xs font-bold ${isCredit ? 'text-indigo-600' : 'text-emerald-600'}`}>
                                {isCredit ? '+' : '-'}{formatPrice(entry.amount)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-slate-800 dark:text-slate-200">{formatPrice(entry.balanceAfter)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground text-sm">সরবরাহকারীর কোনো বিবরণ পাওয়া যায়নি।</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
