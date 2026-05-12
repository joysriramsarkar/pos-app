'use client';

import { useState } from 'react';
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
import { MinusCircle } from 'lucide-react';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';

interface StockAdjustmentDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADJUSTMENT_TYPES = [
  { value: 'home_consumption', label: 'বাড়ির খরচ (Home Use)' },
  { value: 'damaged', label: 'নষ্ট / ড্যামেজ (Damaged)' },
  { value: 'expired', label: 'মেয়াদ উত্তীর্ণ (Expired)' },
  { value: 'other', label: 'অন্যান্য (Other)' },
];

export function StockAdjustmentDialog({ product, open, onOpenChange }: StockAdjustmentDialogProps) {
  const [quantity, setQuantity] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('home_consumption');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const updateProductStock = useProductsStore((state) => state.updateProductStock);

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
      toast({ title: 'পরিমাণ সঠিক নয়', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'কারণ লিখুন', variant: 'destructive' });
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
      toast({ title: 'স্টক আপডেট হয়েছে', description: data.message });
      handleClose();
    } catch (error) {
      toast({
        title: 'ব্যর্থ হয়েছে',
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MinusCircle className="w-5 h-5 text-amber-500" />
            স্টক কমানো (Stock Adjustment)
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{product.name}</span>
            {' — '}বর্তমান স্টক:{' '}
            <span className="font-semibold">{product.currentStock} {product.unit}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>কারণের ধরন</Label>
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
            <Label htmlFor="adj-quantity">পরিমাণ ({product.unit})</Label>
            <Input
              id="adj-quantity"
              type="number"
              min="0.001"
              step="any"
              max={product.currentStock}
              placeholder={`সর্বোচ্চ ${product.currentStock}`}
              value={quantity}
              onChange={(e) => setQuantity(convertBengaliToEnglishNumerals(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">বিস্তারিত কারণ</Label>
            <Input
              id="adj-reason"
              placeholder="যেমন: সাবান ২ পিস বাড়িতে নেওয়া হয়েছে"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>বাতিল</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !quantity || !reason.trim()}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isSubmitting ? 'সেভ হচ্ছে...' : 'স্টক কমান'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
