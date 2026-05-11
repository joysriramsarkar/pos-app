export const getPaymentStatusColor = (status: string | null | undefined) => {
  if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  switch (status.toUpperCase()) {
    case 'PAID':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'PARTIAL':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'DUE':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

export const getStatusColor = (status: string | null | undefined) => {
  if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'REFUNDED':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

export const formatPrice = (price: number | null | undefined) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price ?? 0);
};
