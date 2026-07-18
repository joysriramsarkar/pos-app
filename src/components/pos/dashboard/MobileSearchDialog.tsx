'use client';

import { RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, Package } from 'lucide-react';
import type { Product } from '@/types/pos';

interface MobileSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchResults: Product[];
  onSelect: (product: Product) => void;
  formatTaka: (n: number) => string;
  labels: {
    quickSearch: string;
    noResults: string;
    searchResults: string;
    outOfStock: string;
    stock: string;
  };
}

export function MobileSearchDialog({
  open,
  onOpenChange,
  searchTerm,
  setSearchTerm,
  searchInputRef,
  searchResults,
  onSelect,
  formatTaka,
  labels,
}: MobileSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[10%] translate-y-0 max-w-lg p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{labels.quickSearch}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={labels.quickSearch}
            className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-9"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="border-t" />
        <div className="max-h-[60vh] overflow-y-auto">
          {searchTerm.trim() === '' ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {labels.quickSearch}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-6 text-center">
              <Package className="h-7 w-7 text-muted-foreground/40 mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">{labels.noResults}</p>
            </div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {labels.searchResults}
              </div>
              {searchResults.map((product) => {
                const isOutOfStock = product.currentStock <= 0;
                return (
                  <button
                    key={product.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors touch-feedback ${
                      isOutOfStock ? 'opacity-50' : ''
                    }`}
                    onClick={() => onSelect(product)}
                    disabled={isOutOfStock}
                  >
                    <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                      isOutOfStock
                        ? 'bg-red-100 dark:bg-red-900/20'
                        : 'bg-emerald-100 dark:bg-emerald-900/20'
                    }`}>
                      <Package className={`h-3.5 w-3.5 ${
                        isOutOfStock
                          ? 'text-red-500'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight">
                        {product.nameBn || product.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {isOutOfStock
                          ? labels.outOfStock
                          : `${labels.stock}: ${product.currentStock} ${product.unit}`
                        }
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-primary tabular-nums">{formatTaka(product.sellingPrice)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
