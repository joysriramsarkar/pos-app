import type { Customer } from '@/types/pos';

export interface CartPanelProps {
  onCheckout: () => void;
  customers?: Customer[];
  onScan?: () => void;
}
