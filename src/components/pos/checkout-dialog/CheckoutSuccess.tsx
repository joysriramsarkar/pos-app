'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, Printer, Receipt } from 'lucide-react';

interface CheckoutSuccessProps {
  displayedTotal: number;
  displayedPaymentMethod: string;
  displayedChange: number;
  formatPrice: (n: number) => string;
  onPrint: () => void;
  onClose: () => void;
  labels: {
    paymentSuccessful: string;
    saleCompleted: string;
    changeToReturn: string;
    print: string;
    newSale: string;
  };
}

export function CheckoutSuccess({
  displayedTotal,
  displayedPaymentMethod,
  displayedChange,
  formatPrice,
  onPrint,
  onClose,
  labels,
}: CheckoutSuccessProps) {
  return (
    <div className="flex flex-col items-center py-6 px-6">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{labels.paymentSuccessful}</h2>
      <p className="text-muted-foreground text-center">{labels.saleCompleted}</p>
      {(displayedPaymentMethod === 'Cash' || displayedPaymentMethod === 'Mixed') && displayedChange > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg w-full text-center">
          <p className="text-sm text-muted-foreground">{labels.changeToReturn}</p>
          <p className="text-2xl font-bold text-primary">{formatPrice(displayedChange)}</p>
        </div>
      )}
      <div className="flex gap-3 mt-6 w-full">
        <Button variant="outline" className="flex-1" onClick={onPrint}>
          <Printer className="w-4 h-4 mr-2" />{labels.print}
        </Button>
        <Button className="flex-1 bg-blue-600 text-white hover:bg-blue-700" onClick={onClose}>
          <Receipt className="w-4 h-4 mr-2" />{labels.newSale}
        </Button>
      </div>
    </div>
  );
}
