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
import { Download, Clock, User, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useNumberFormat } from '@/hooks/use-number-format';
import { formatPrice, getStatusColor, getPaymentStatusColor } from './utils';
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

  // Create a Bengali-aware price formatter
  const displayPrice = (price: number | null | undefined) => {
    return formatPriceBengali(price);
  };

  return (
    <ScrollArea className="flex-1 w-full h-full">
      {/* Mobile Card View */}
      <div className="md:hidden flex flex-col divide-y">
        {transactions.map((transaction: Transaction) => (
          <div 
            key={transaction.id} 
            className="flex flex-col p-3 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => onViewDetails(transaction)}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-mono text-xs font-semibold text-primary truncate">
                  {transaction.invoiceNumber}
                </span>
                <span className="text-sm font-medium truncate mt-0.5">
                  {transaction.customer?.name || "Walk-in Customer"}
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
                  {transaction.paymentMethod}
                </Badge>
                <Badge className={`text-[10px] h-5 px-1.5 ${getPaymentStatusColor(transaction.paymentStatus)}`}>
                  {transaction.paymentStatus}
                </Badge>
                <Badge className={`text-[10px] h-5 px-1.5 ${getStatusColor(transaction.status)}`}>
                  {transaction.status}
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
              <TableHead className="w-32 py-2">Invoice</TableHead>
              <TableHead className="w-36 py-2">Date & Time</TableHead>
              <TableHead className="w-48 py-2">Customer</TableHead>
              <TableHead className="w-36 py-2">User</TableHead>
              <TableHead className="w-28 text-right py-2">Amount</TableHead>
              <TableHead className="w-28 text-right py-2">Paid</TableHead>
              <TableHead className="w-24 py-2">Payment</TableHead>
              <TableHead className="w-28 py-2">Status</TableHead>
              <TableHead className="w-16 text-center py-2">Export</TableHead>
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
                    <span className="text-sm text-muted-foreground italic">Walk-in Customer</span>
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
                    {transaction.paymentMethod}
                  </Badge>
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex flex-col gap-1 items-start">
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${getPaymentStatusColor(transaction.paymentStatus)}`}>
                      {transaction.paymentStatus}
                    </Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${getStatusColor(transaction.status)}`}>
                      {transaction.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onExport(transaction); }}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Export Invoice Data"
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
