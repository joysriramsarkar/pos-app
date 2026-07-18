import type { ReactNode } from 'react';
import { Banknote, Smartphone, Clock } from 'lucide-react';
import type { PaymentMethod } from '@/types/pos';

export const paymentMethods: { method: PaymentMethod; icon: ReactNode; labelKey: string; color: string }[] = [
  { method: 'Cash', icon: <Banknote className="w-4 h-4" />, labelKey: 'cash', color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
  { method: 'UPI', icon: <Smartphone className="w-4 h-4" />, labelKey: 'upi', color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' },
  { method: 'Mixed', icon: (<div className="flex items-center gap-1"><Banknote className="w-4 h-4" /><Smartphone className="w-4 h-4" /></div>), labelKey: 'mixed', color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' },
  { method: 'Due', icon: <Clock className="w-4 h-4" />, labelKey: 'due_payment', color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
];
