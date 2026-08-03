'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useProductsStore } from '@/stores/pos-store';
import type { Product } from '@/types/pos';
import { MinusCircle, Loader2 } from 'lucide-react';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';

interface StockAdjustmentDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockAdjustmentDialog({ product, open, onOpenChange }: StockAdjustmentDialogProps) {
  const t = useTranslations('Stock');
  const tc = useTranslations('Common');
  
  const [quantity, setQuantity] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('home_consumption');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const updateProductStock = useProductsStore((state) => state.updateProductStock);

  const ADJUSTMENT_TYPES = [
    { value: 'home_consumption', label: t('reason_home_use') },
    { value: 'damaged', label: t('reason_damaged') },
    { value: 'expired', label: t('reason_expired') },
    { value: 'other', label: t('reason_other') },
  ];

  const handleClose = () => {
    setQuantity('');
    setAdjustmentType('home_consumption');
    setReason('');
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!product) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      toast({ title: t('invalid_quantity'), variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: t('reason_required'), variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/stock-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity: qty, adjustmentType, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateProductStock(product.id, -qty);
      toast({ title: t('stock_updated'), description: data.message });
      handleClose();
    } catch (error) {
      toast({
        title: t('stock_update_failed'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MinusCircle className="w-5 h-5 text-amber-500" />
            {t('stock_adjustment_title')}
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{product.name}</span>
            {' — '}{t('current_stock_label')}:{' '}
            <span className="font-semibold">{product.currentStock} {product.unit}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('reason_type')}</Label>
            <Select value={adjustmentType} onValueChange={setAdjustmentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-quantity">{t('quantity_unit', { unit: product.unit })}</Label>
            <Input
              id="adj-quantity"
              type="number"
              min="0.001"
              step="any"
              max={product.currentStock}
              placeholder={t('max_placeholder', { stock: product.currentStock })}
              value={quantity}
              onChange={(e) => setQuantity(convertBengaliToEnglishNumerals(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">{t('detailed_reason')}</Label>
            <Input
              id="adj-reason"
              placeholder={t('reason_placeholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>{tc('cancel')}</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !quantity || !reason.trim()}
            className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{tc('loading')}</span>
              </>
            ) : (
              t('save_btn')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StockAdjustmentDialog;
