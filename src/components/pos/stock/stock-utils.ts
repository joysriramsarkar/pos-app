import type { Product } from '@/types/pos';

export function getStockStatus(
  product: Product,
  t: (key: string) => string,
): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  if (!product.isActive) return { label: t('inactive'), variant: 'secondary' };
  if (product.currentStock < 0) return { label: t('negative_stock'), variant: 'destructive' };
  if (product.currentStock === 0) return { label: t('out_of_stock'), variant: 'destructive' };
  if (product.currentStock <= product.minStockLevel) return { label: t('low_stock'), variant: 'secondary' };
  return { label: t('in_stock'), variant: 'default' };
}

export function getStockBorderClass(product: Product): string {
  if (!product.isActive) return 'border-l-gray-400 dark:border-l-gray-600';
  if (product.currentStock === 0) return 'border-l-red-500';
  if (product.currentStock <= product.minStockLevel) return 'border-l-amber-500';
  return 'border-l-green-500';
}

export function getStockLevelPercent(product: Product): number {
  if (product.minStockLevel === 0) return product.currentStock > 0 ? 100 : 0;
  const ratio = (product.currentStock / product.minStockLevel) * 100;
  return Math.min(Math.max(ratio, 0), 100);
}

export function getStockLevelColor(product: Product): string {
  if (!product.isActive) return '[&>div]:bg-gray-400';
  if (product.currentStock === 0) return '[&>div]:bg-red-500';
  if (product.currentStock <= product.minStockLevel) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-green-500';
}
