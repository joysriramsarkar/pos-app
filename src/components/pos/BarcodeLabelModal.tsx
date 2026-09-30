'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Barcode, Printer, Copy, Check } from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { Product } from '@/types/pos';

export interface BarcodeLabelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products?: Product[];
  selectedProduct?: Product | null;
  businessName?: string;
}

export function BarcodeLabelModal({
  open,
  onOpenChange,
  products = [],
  selectedProduct,
  businessName = 'আমার দোকান',
}: BarcodeLabelModalProps) {
  const { formatPrice } = useNumberFormat();

  const [productId, setProductId] = useState<string>(selectedProduct?.id || '');
  const [labelCount, setLabelCount] = useState<number>(10);
  const [showPrice, setShowPrice] = useState<boolean>(true);

  // Active product
  const product =
    selectedProduct || products.find((p) => p.id === productId) || products[0];

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Barcode className="w-5 h-5 text-primary" />
              বারকোড লেবেল স্টিকার প্রিন্ট
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            পণ্য অনুযায়ী বারকোড লেবেল নির্বাচন করে সরাসরি স্টিকার প্রিন্ট করুন।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Product selector if not pre-selected */}
          {!selectedProduct && products.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">পণ্য নির্বাচন করুন</Label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border/70 bg-background text-xs font-medium focus:ring-2 focus:ring-primary/20"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.barcode ? `(${p.barcode})` : ''} - {p.sellingPrice} টাকা
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity and Options */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">লেবেল সংখ্যা (Labels)</Label>
              <Input
                type="number"
                min="1"
                max="500"
                value={labelCount}
                onChange={(e) => setLabelCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-11 rounded-xl text-sm font-semibold"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="rounded w-4 h-4 text-primary focus:ring-primary"
                />
                <span>লেবেলে মূল্য প্রদর্শন করুন</span>
              </label>
            </div>
          </div>

          {/* Label Preview Sheet */}
          {product && (
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold text-muted-foreground block">
                প্রিভিউ (Sticker Preview):
              </Label>
              <div className="border border-border/80 rounded-2xl p-4 bg-muted/20 flex flex-wrap gap-2.5 max-h-56 overflow-y-auto justify-center">
                {Array.from({ length: Math.min(labelCount, 12) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-36 h-22 p-2 bg-white text-black rounded-lg border border-slate-300 shadow-xs flex flex-col items-center justify-between text-center select-none"
                  >
                    <span className="text-[9px] font-bold truncate max-w-full text-slate-700">
                      {businessName}
                    </span>
                    <span className="text-[10px] font-extrabold truncate max-w-full leading-tight">
                      {product.name}
                    </span>

                    {/* Simulated barcode bars */}
                    <div className="flex items-end justify-center gap-[1.5px] h-6 w-full my-0.5 px-2">
                      {Array.from({ length: 24 }).map((_, bIdx) => (
                        <div
                          key={bIdx}
                          className="bg-black"
                          style={{
                            width: (bIdx % 3 === 0 ? 2 : 1) + 'px',
                            height: (bIdx % 4 === 0 ? 24 : 20) + 'px',
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between w-full text-[9px] font-mono leading-none">
                      <span className="text-[8px] text-slate-600 truncate">
                        {product.barcode || product.id.slice(-6).toUpperCase()}
                      </span>
                      {showPrice && (
                        <span className="font-bold text-[10px]">
                          {formatPrice(Number(product.sellingPrice))}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {labelCount > 12 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  মোট {labelCount}টি লেবেল প্রিন্ট হবে...
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 sm:justify-end gap-2 border-t border-border/40 mt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            বন্ধ করুন
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            className="rounded-xl gap-2 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট করুন ({labelCount}টি)</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
