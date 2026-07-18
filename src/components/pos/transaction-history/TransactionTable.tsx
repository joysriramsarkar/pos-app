import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useTranslations } from 'next-intl';
import { getStatusColor, getPaymentStatusColor } from './utils';
import { Transaction } from './types';

interface TransactionTableProps {
  transactions: Transaction[];
  onViewDetails: (transaction: Transaction) => void;
  onExport: (transaction: Transaction) => void;
}

export function TransactionTable({
  transactions,
  onViewDetails,
  onExport,
}: TransactionTableProps) {
  const { formatPrice: formatPriceBengali } = useNumberFormat();
  const t = useTranslations('TransactionHistory');
  const tc = useTranslations('Common');

  // Create a Bengali-aware price formatter
  const displayPrice = (price: number | null | undefined) => {
    return formatPriceBengali(price);
  };

  const getStatusText = (status: string) => {
    if (!status) return '';
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return t('completed');
      case 'CANCELLED':
        return t('cancelled');
      case 'REFUNDED':
        return t('refunded');
      default:
        return status;
    }
  };

  const getPaymentStatusText = (status: string) => {
    if (!status) return '';
    switch (status.toUpperCase()) {
      case 'PAID':
        return t('paid', { defaultValue: 'Paid' });
      case 'PARTIAL':
        return tc('partial', { defaultValue: 'Partial' });
      case 'DUE':
        return t('due', { defaultValue: 'Due' });
      default:
        return status;
    }
  };

  const getPaymentMethodText = (method: string) => {
    if (!method) return '';
    switch (method.toUpperCase()) {
      case 'CASH':
      case 'নগদ':
        return t('cash');
      case 'UPI':
      case 'ইউপিআই':
        return t('upi');
      case 'DUE':
      case 'বাকি':
        return t('due');
      case 'PREPAID':
      case 'আগাম জমা':
        return t('prepaid');
      case 'MIXED':
      case 'মিশ্র':
        return t('mixed');
      default:
        return method;
    }
  };

  return (
    <ScrollArea className="flex-1 w-full h-full">
      {/* Mobile Card View */}
      <div className="md:hidden flex flex-col divide-y">
        {transactions.map((transaction: Transaction) => (
          <div 
            key={transaction.id} 
            className="flex flex-col p-3.5 hover:bg-muted/50 active:bg-muted/60 cursor-pointer transition-colors touch-manipulation min-h-16"
            onClick={() => onViewDetails(transaction)}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-mono text-xs font-semibold text-primary truncate">
                  {transaction.invoiceNumber}
                </span>
                <span className="text-sm font-medium truncate mt-0.5">
                  {transaction.customer?.name || t('walk_in_customer')}
                </span>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="font-bold text-sm">
                  {displayPrice(transaction.totalAmount)}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {format(transaction.createdAt, 'dd MMM, HH:mm')}
                </span>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium">
                  {getPaymentMethodText(transaction.paymentMethod)}
                </Badge>
                <Badge className={`text-[10px] h-5 px-1.5 ${getPaymentStatusColor(transaction.paymentStatus)}`}>
                  {getPaymentStatusText(transaction.paymentStatus)}
                </Badge>
                <Badge className={`text-[10px] h-5 px-1.5 ${getStatusColor(transaction.status)}`}>
                  {getStatusText(transaction.status)}
                </Badge>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => { e.stopPropagation(); onExport(transaction); }}
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>


      {/* Desktop Table View */}
      <div className="hidden md:block min-w-max">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="hover:bg-transparent border-b min-h-12">
              <TableHead className="w-32 py-2">{t('invoice')}</TableHead>
              <TableHead className="w-36 py-2">{t('date_time')}</TableHead>
              <TableHead className="w-48 py-2">{t('customer')}</TableHead>
              <TableHead className="w-36 py-2">{t('user')}</TableHead>
              <TableHead className="w-28 text-right py-2">{t('amount')}</TableHead>
              <TableHead className="w-28 text-right py-2">{t('paid')}</TableHead>
              <TableHead className="w-24 py-2">{tc('payment')}</TableHead>
              <TableHead className="w-28 py-2">{t('status')}</TableHead>
              <TableHead className="w-16 text-center py-2">{t('export')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction: Transaction) => (
              <TableRow key={transaction.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => onViewDetails(transaction)}>
                <TableCell className="font-mono font-medium text-sm py-2">
                  {transaction.invoiceNumber}
                </TableCell>
                <TableCell className="text-sm py-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{format(transaction.createdAt, 'dd MMM yyyy, HH:mm')}</span>
                  </div>
                </TableCell>
                <TableCell className="py-2 min-w-0">
                  {transaction.customer ? (
                    <div className="flex flex-col">
                      <span className="font-medium text-sm truncate">{transaction.customer.name}</span>
                      {transaction.customer.phone && (
                        <span className="text-xs text-muted-foreground truncate">{transaction.customer.phone}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">{t('walk_in_customer')}</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  {transaction.user ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-sm truncate">{transaction.user.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold text-sm py-2">
                  {displayPrice(transaction.totalAmount)}
                </TableCell>
                <TableCell className="text-right text-sm py-2">
                  {displayPrice(transaction.amountPaid)}
                </TableCell>
                <TableCell className="py-2">
                  <Badge variant="outline" className="text-xs font-medium bg-background">
                    {getPaymentMethodText(transaction.paymentMethod)}
                  </Badge>
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex flex-col gap-1 items-start">
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${getPaymentStatusColor(transaction.paymentStatus)}`}>
                      {getPaymentStatusText(transaction.paymentStatus)}
                    </Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${getStatusColor(transaction.status)}`}>
                      {getStatusText(transaction.status)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onExport(transaction); }}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title={t('export')}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ScrollBar orientation="horizontal" className="hidden md:flex" />
    </ScrollArea>
  );
}
