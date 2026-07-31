'use client';

import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { Supplier } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Loader2, Trash2, Check, ChevronsUpDown,
} from 'lucide-react';
import type { FormItem } from './types';
import { WEIGHTED_UNITS } from './utils';

interface ProductLike {
  id: string;
  name: string;
  nameBn?: string;
  unit?: string;
  buyingPrice?: number | string;
  isActive?: boolean;
  barcode?: string | null;
  category?: string;
}

interface PurchaseOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  products: ProductLike[];
  availableProducts: ProductLike[];
  filteredProducts: ProductLike[];
  supplierProductIds: Set<string>;
  formSupplierId: string;
  setFormSupplierId: (value: string) => void;
  formSupplierName: string;
  setFormSupplierName: (value: string) => void;
  formItems: FormItem[];
  formExpectedDate: string;
  setFormExpectedDate: (value: string) => void;
  formNotes: string;
  setFormNotes: (value: string) => void;
  formUpdateStock: boolean;
  setFormUpdateStock: (value: boolean) => void;
  formAmountPaid: string;
  setFormAmountPaid: (value: string) => void;
  formProductId: string;
  setFormProductId: (value: string) => void;
  formProductName: string;
  setFormProductName: (value: string) => void;
  productSearch: string;
  setProductSearch: (value: string) => void;
  productOpen: boolean;
  setProductOpen: (value: boolean) => void;
  supplierSearch: string;
  setSupplierSearch: (value: string) => void;
  supplierOpen: boolean;
  setSupplierOpen: (value: boolean) => void;
  formPaymentMethod: string;
  setFormPaymentMethod: (value: string) => void;
  formGstPercentage: string;
  setFormGstPercentage: (value: string) => void;
  formCashAmount: string;
  setFormCashAmount: (value: string) => void;
  formUpiAmount: string;
  setFormUpiAmount: (value: string) => void;
  formSubtotal: number;
  gstAmount: number;
  formTotal: number;
  totalItemCount: number;
  formPaidVal: number;
  formDueAmount: number;
  saving: boolean;
  formatPrice: (value: number) => string;
  currencySymbol: string;
  onAddFormItem: () => void;
  onRemoveFormItem: (productId: string) => void;
  onUpdateFormItem: (productId: string, field: 'quantity' | 'unitPrice' | 'gstPercentage', value: number | string) => void;
  onCreateOrder: (directReceive?: boolean) => void;
}

export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  suppliers,
  products,
  availableProducts,
  filteredProducts,
  supplierProductIds,
  formSupplierId,
  setFormSupplierId,
  formSupplierName,
  setFormSupplierName,
  formItems,
  formExpectedDate,
  setFormExpectedDate,
  formNotes,
  setFormNotes,
  formUpdateStock,
  setFormUpdateStock,
  formAmountPaid,
  setFormAmountPaid,
  formProductId,
  setFormProductId,
  formProductName,
  setFormProductName,
  productSearch,
  setProductSearch,
  productOpen,
  setProductOpen,
  supplierSearch,
  setSupplierSearch,
  supplierOpen,
  setSupplierOpen,
  formPaymentMethod,
  setFormPaymentMethod,
  formGstPercentage,
  setFormGstPercentage,
  formCashAmount,
  setFormCashAmount,
  formUpiAmount,
  setFormUpiAmount,
  formSubtotal,
  gstAmount,
  formTotal,
  totalItemCount,
  formPaidVal,
  formDueAmount,
  saving,
  formatPrice,
  currencySymbol,
  onAddFormItem,
  onRemoveFormItem,
  onUpdateFormItem,
  onCreateOrder,
}: PurchaseOrderFormDialogProps) {
  const t = useTranslations('PurchaseOrders');
  const tb = useTranslations('Billing');
  const tc = useTranslations('Common');
  const { isBn } = useNumberFormat();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('new_order')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Supplier */}
          <div>
            <Label>{t('supplier')}</Label>
            <Popover open={supplierOpen} onOpenChange={setSupplierOpen} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={supplierOpen}
                  className="w-full justify-between font-normal min-w-0"
                >
                  <span className="truncate flex-1 text-left">
                    {formSupplierId === 'none'
                      ? t('no_supplier')
                      : formSupplierId
                        ? formSupplierName || suppliers.find((s) => s.id === formSupplierId)?.name
                        : t('select_supplier')}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" side="bottom" avoidCollisions={false}>
                <Command shouldFilter={false}>
                  <CommandInput
                    value={supplierSearch}
                    onValueChange={setSupplierSearch}
                    placeholder={t('search_supplier')}
                  />
                  <CommandList>
                    <CommandEmpty>{t('no_supplier_found')}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          setFormSupplierId('none');
                          setFormSupplierName('');
                          setSupplierOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            formSupplierId === 'none' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {t('no_supplier')}
                      </CommandItem>
                      {suppliers.map((supplier) => (
                        <CommandItem
                          key={supplier.id}
                          value={`${supplier.name} ${supplier.phone ?? ''}`}
                          onSelect={() => {
                            setFormSupplierId(supplier.id);
                            setFormSupplierName(supplier.name);
                            setSupplierOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              formSupplierId === supplier.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="truncate">{supplier.name}</span>
                          {supplier.phone && (
                            <span className="ml-auto text-xs text-muted-foreground">{supplier.phone}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Add Products */}
          <div>
            <Label>{t('add_products')}</Label>
            <div className="flex gap-2 mt-1">
              <Popover open={productOpen} onOpenChange={setProductOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productOpen}
                    className="flex-1 justify-between font-normal min-w-0"
                  >
                    <span className="truncate flex-1 text-left">
                      {formProductId
                        ? formProductName || availableProducts.find((p) => p.id === formProductId)?.nameBn || availableProducts.find((p) => p.id === formProductId)?.name
                        : t('select_product')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" side="bottom" avoidCollisions={false}>
                  <Command shouldFilter={false}>
                    <CommandInput
                      value={productSearch}
                      onValueChange={setProductSearch}
                      placeholder={tb('search_products')}
                    />
                    <CommandList>
                      <CommandEmpty>{tb('no_products')}</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={() => {
                              setFormProductId(product.id);
                              setFormProductName(isBn ? (product.nameBn || product.name) : (product.name || product.nameBn) || '');
                              setProductOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                formProductId === product.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{isBn ? (product.nameBn || product.name) : (product.name || product.nameBn)}</span>
                            {supplierProductIds.has(product.id) && (
                              <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1 font-semibold text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400">
                                সাপ্লায়ারের
                              </Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                              {formatPrice(Number(product.buyingPrice))}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button onClick={onAddFormItem} variant="outline" size="icon" disabled={!formProductId}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Items Table / Cards */}
          {formItems.length > 0 && (
            <>
              {/* Desktop View */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>{tc('name')}</TableHead>
                          <TableHead className="w-24">{t('quantity')}</TableHead>
                          <TableHead className="w-28">{t('unit_price')}</TableHead>
                          <TableHead className="w-24">জিএসটি (%)</TableHead>
                          <TableHead className="w-28">{t('total_price')}</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formItems.map((item) => {
                          const product = products.find((p) => p.id === item.productId);
                          const isWeighted = WEIGHTED_UNITS.has(product?.unit || '');
                          const qty = parseFloat(item.quantity as string) || 0;
                          const unitPrice = parseFloat(item.unitPrice as string) || 0;
                          const itemSubtotal = qty * unitPrice;
                          const hasCustomGst = item.gstPercentage !== undefined && item.gstPercentage !== '' && !isNaN(parseFloat(item.gstPercentage as string));
                          const itemGstRate = hasCustomGst ? parseFloat(item.gstPercentage as string) : (parseFloat(formGstPercentage) || 0);
                          const itemGstAmount = itemSubtotal * (itemGstRate / 100);
                          const itemTotalIncludingGst = itemSubtotal + itemGstAmount;

                          return (
                            <TableRow key={item.productId}>
                              <TableCell className="text-sm">{product?.nameBn || product?.name}</TableCell>
                              <TableCell>
                                <Input
                                  id={`qty-${item.productId}`}
                                  type="text"
                                  value={item.quantity === 0 ? '' : item.quantity}
                                  onChange={(e) => {
                                    const val = convertBengaliToEnglishNumerals(e.target.value);
                                    if (isWeighted) {
                                      const cleaned = val.replace(/[^0-9.]/g, '');
                                      const dotCount = (cleaned.match(/\./g) || []).length;
                                      if (dotCount > 1) return;
                                      onUpdateFormItem(item.productId, 'quantity', cleaned);
                                    } else {
                                      const cleaned = val.replace(/[^0-9]/g, '');
                                      onUpdateFormItem(item.productId, 'quantity', parseInt(cleaned) || 0);
                                    }
                                  }}
                                  onBlur={() => {
                                    const parsed = parseFloat(item.quantity as string);
                                    if (isNaN(parsed) || parsed <= 0) {
                                      onUpdateFormItem(item.productId, 'quantity', 1);
                                    } else {
                                      onUpdateFormItem(item.productId, 'quantity', parsed);
                                    }
                                  }}
                                  className="h-8 w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="text"
                                  value={item.unitPrice === 0 ? '' : item.unitPrice}
                                  onChange={(e) => {
                                    const val = convertBengaliToEnglishNumerals(e.target.value);
                                    const cleaned = val.replace(/[^0-9.]/g, '');
                                    const dotCount = (cleaned.match(/\./g) || []).length;
                                    if (dotCount > 1) return;
                                    onUpdateFormItem(item.productId, 'unitPrice', cleaned);
                                  }}
                                  onBlur={() => {
                                    const parsedPrice = parseFloat(item.unitPrice as string) || 0;
                                    if (parsedPrice < 0) {
                                      onUpdateFormItem(item.productId, 'unitPrice', 0);
                                    } else {
                                      onUpdateFormItem(item.productId, 'unitPrice', parsedPrice);
                                    }
                                  }}
                                  className="h-8 w-24"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="text"
                                  value={item.gstPercentage === undefined ? '' : item.gstPercentage}
                                  onChange={(e) => {
                                    const val = convertBengaliToEnglishNumerals(e.target.value);
                                    const cleaned = val.replace(/[^0-9.]/g, '');
                                    const dotCount = (cleaned.match(/\./g) || []).length;
                                    if (dotCount > 1) return;
                                    onUpdateFormItem(item.productId, 'gstPercentage', cleaned);
                                  }}
                                  onBlur={() => {
                                    const parsedGst = parseFloat(item.gstPercentage as string);
                                    if (isNaN(parsedGst)) {
                                      onUpdateFormItem(item.productId, 'gstPercentage', '');
                                    } else if (parsedGst < 0) {
                                      onUpdateFormItem(item.productId, 'gstPercentage', 0);
                                    } else {
                                      onUpdateFormItem(item.productId, 'gstPercentage', parsedGst);
                                    }
                                  }}
                                  placeholder={formGstPercentage || "0"}
                                  className="h-8 w-20"
                                />
                              </TableCell>
                              <TableCell className="font-medium">{formatPrice(itemTotalIncludingGst)}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => onRemoveFormItem(item.productId)}>
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Mobile View */}
              <div className="md:hidden flex flex-col gap-3">
                {formItems.map((item) => {
                  const product = products.find((p) => p.id === item.productId);
                  const isWeighted = WEIGHTED_UNITS.has(product?.unit || '');
                  const qty = parseFloat(item.quantity as string) || 0;
                  const unitPrice = parseFloat(item.unitPrice as string) || 0;
                  const itemSubtotal = qty * unitPrice;
                  const hasCustomGst = item.gstPercentage !== undefined && item.gstPercentage !== '' && !isNaN(parseFloat(item.gstPercentage as string));
                  const itemGstRate = hasCustomGst ? parseFloat(item.gstPercentage as string) : (parseFloat(formGstPercentage) || 0);
                  const itemGstAmount = itemSubtotal * (itemGstRate / 100);
                  const itemTotalIncludingGst = itemSubtotal + itemGstAmount;

                  return (
                    <Card key={`mobile-${item.productId}`} className="p-3">
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <span className="text-sm font-semibold">{product?.nameBn || product?.name}</span>
                        <Button variant="ghost" size="sm" onClick={() => onRemoveFormItem(item.productId)} className="h-6 w-6 p-0 shrink-0">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('quantity')}</Label>
                          <Input
                            id={`qty-mobile-${item.productId}`}
                            type="text"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const val = convertBengaliToEnglishNumerals(e.target.value);
                              if (isWeighted) {
                                const cleaned = val.replace(/[^0-9.]/g, '');
                                const dotCount = (cleaned.match(/\./g) || []).length;
                                if (dotCount > 1) return;
                                onUpdateFormItem(item.productId, 'quantity', cleaned);
                              } else {
                                const cleaned = val.replace(/[^0-9]/g, '');
                                onUpdateFormItem(item.productId, 'quantity', parseInt(cleaned) || 0);
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseFloat(item.quantity as string);
                              if (isNaN(parsed) || parsed <= 0) {
                                onUpdateFormItem(item.productId, 'quantity', 1);
                              } else {
                                onUpdateFormItem(item.productId, 'quantity', parsed);
                              }
                            }}
                            className="h-8 w-full"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('unit_price')}</Label>
                          <Input
                            type="text"
                            value={item.unitPrice === 0 ? '' : item.unitPrice}
                            onChange={(e) => {
                              const val = convertBengaliToEnglishNumerals(e.target.value);
                              const cleaned = val.replace(/[^0-9.]/g, '');
                              const dotCount = (cleaned.match(/\./g) || []).length;
                              if (dotCount > 1) return;
                              onUpdateFormItem(item.productId, 'unitPrice', cleaned);
                            }}
                            onBlur={() => {
                              const parsedPrice = parseFloat(item.unitPrice as string) || 0;
                              if (parsedPrice < 0) {
                                onUpdateFormItem(item.productId, 'unitPrice', 0);
                              } else {
                                onUpdateFormItem(item.productId, 'unitPrice', parsedPrice);
                              }
                            }}
                            className="h-8 w-full"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">জিএসটি (%)</Label>
                          <Input
                            type="text"
                            value={item.gstPercentage === undefined ? '' : item.gstPercentage}
                            onChange={(e) => {
                              const val = convertBengaliToEnglishNumerals(e.target.value);
                              const cleaned = val.replace(/[^0-9.]/g, '');
                              const dotCount = (cleaned.match(/\./g) || []).length;
                              if (dotCount > 1) return;
                              onUpdateFormItem(item.productId, 'gstPercentage', cleaned);
                            }}
                            onBlur={() => {
                              const parsedGst = parseFloat(item.gstPercentage as string);
                              if (isNaN(parsedGst)) {
                                onUpdateFormItem(item.productId, 'gstPercentage', '');
                              } else if (parsedGst < 0) {
                                onUpdateFormItem(item.productId, 'gstPercentage', 0);
                              } else {
                                onUpdateFormItem(item.productId, 'gstPercentage', parsedGst);
                              }
                            }}
                            placeholder={formGstPercentage || "0"}
                            className="h-8 w-full"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-2 border-t text-sm">
                        <span className="text-muted-foreground">{t('total_price')}:</span>
                        <span className="font-bold">{formatPrice(itemTotalIncludingGst)}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* Calculations Area */}
          {formItems.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 border border-border/50">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">সাবটোটাল ({formItems.length} প্রকার, {totalItemCount} আইটেম):</span>
                <span className="font-semibold">{formatPrice(formSubtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">জিএসটি (অপশনাল):</span>
                  <div className="relative w-20">
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={formGstPercentage}
                      onChange={(e) => setFormGstPercentage(e.target.value)}
                      className="h-7 text-xs pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                  </div>
                </div>
                <span className="font-medium text-muted-foreground">{gstAmount > 0 ? '+' : ''}{formatPrice(gstAmount)}</span>
              </div>

              <Separator className="my-1" />

              <div className="flex justify-between items-center">
                <span className="font-bold text-base">মোট:</span>
                <span className="font-bold text-xl text-primary">{formatPrice(formTotal)}</span>
              </div>

              {formPaidVal > 0 && (
                <div className="flex justify-between items-center text-sm border-t pt-1 border-dashed border-border/50">
                  <span className="text-muted-foreground">পরিশোধিত টাকা:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">{formatPrice(formPaidVal)}</span>
                </div>
              )}
              {formDueAmount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-red-500 font-medium">বকেয়া (Due):</span>
                  <span className="font-bold text-red-600 dark:text-red-400">{formatPrice(formDueAmount)}</span>
                </div>
              )}
            </div>
          )}

          {/* Expected Date */}
          <div>
            <Label>{t('expected_date')}</Label>
            <Input
              type="date"
              value={formExpectedDate}
              onChange={(e) => setFormExpectedDate(e.target.value)}
            />
          </div>

          {/* Update Stock Checkbox */}
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="update-stock"
              checked={formUpdateStock}
              onCheckedChange={(checked) => setFormUpdateStock(checked === true)}
            />
            <label
              htmlFor="update-stock"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              স্টক আপডেট করুন (Update Stock)
            </label>
          </div>

          {/* Notes */}
          <div>
            <Label>{t('notes')}</Label>
            <Textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="অতিরিক্ত নোট..."
            />
          </div>

          {/* Amount Paid */}
          <div className="space-y-1.5">
            <Label htmlFor="form-amount-paid" className="text-sm font-medium">পরিশোধিত টাকা (ঐচ্ছিক)</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">{currencySymbol}</span>
              <Input
                id="form-amount-paid"
                type="number"
                min="0"
                step="0.01"
                value={formAmountPaid}
                onChange={(e) => {
                  const cleaned = convertBengaliToEnglishNumerals(e.target.value);
                  setFormAmountPaid(cleaned);
                }}
                placeholder={Math.round(formTotal).toString()}
                className="pl-8"
                readOnly={formPaymentMethod === 'Mixed'}
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label htmlFor="form-payment-method" className="text-sm font-medium">পেমেন্ট পদ্ধতি</Label>
            <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
              <SelectTrigger id="form-payment-method" className="h-9">
                <SelectValue placeholder="পেমেন্ট পদ্ধতি নির্বাচন করুন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formPaymentMethod === 'Mixed' && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="space-y-1">
                <Label htmlFor="form-cash-amount" className="text-xs">নগদ পরিমাণ</Label>
                <Input
                  id="form-cash-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formCashAmount}
                  onChange={(e) => setFormCashAmount(e.target.value)}
                  placeholder="নগদ"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="form-upi-amount" className="text-xs">ইউপিআই পরিমাণ</Label>
                <Input
                  id="form-upi-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formUpiAmount}
                  onChange={(e) => setFormUpiAmount(e.target.value)}
                  placeholder="ইউপিআই"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={() => onCreateOrder(true)} disabled={saving || formItems.length === 0} className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            সরাসরি ক্রয় ও স্টক আপডেট
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
