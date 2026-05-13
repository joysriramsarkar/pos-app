'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSalesStore } from '@/stores/pos-store';
import { TransactionFilters } from './TransactionFilters';
import { TransactionTable } from './TransactionTable';
import { TransactionDetailsDialog } from './TransactionDetailsDialog';
import { Transaction, PaginationData } from './types';

export function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();
  
  // ✅ Watch store sales and refresh when new sales are added
  const sales = useSalesStore((state) => state.sales);
  
  useEffect(() => {
    // Reset to page 1 and refresh when store sales change (new sale added)
    setCurrentPage(1);
    setRefreshKey(prev => prev + 1);
  }, [sales]);

  useEffect(() => {
    const fetchTransactions = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('page', currentPage.toString());
        params.append('limit', '20');

        if (searchQuery) {
          params.append('invoiceNumber', searchQuery);
        }

        if (filterStatus !== 'all') {
          params.append('status', filterStatus);
        }

        const response = await fetch(`/api/sales?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch transactions');
        }

        const data = await response.json();
        if (data.success) {
          const apiTransactions = data.data.map((sale: Omit<Transaction, 'createdAt'> & { createdAt: string | Date }) => ({
            ...sale,
            createdAt: new Date(sale.createdAt),
          }));
          
          // Merge local store sales that might not be synced yet if we are on the first page
          let mergedTransactions = [...apiTransactions];
          if (currentPage === 1 && !searchQuery && filterStatus === 'all' && filterPaymentMethod === 'all') {
            const currentSales = useSalesStore.getState().sales;
            const apiIds = new Set(apiTransactions.map((t: Transaction) => t.id));
            
            // Only prepend local sales that are not in the API response
            const localUnsynced = currentSales
              .filter(ls => !apiIds.has(ls.id))
              .map(ls => ({ ...ls, createdAt: new Date(ls.createdAt || Date.now()) } as unknown as Transaction));
              
            mergedTransactions = [...localUnsynced, ...apiTransactions];
          }

          setTransactions(mergedTransactions);
          setPagination(data.pagination);
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load transactions',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [currentPage, searchQuery, filterStatus, refreshKey, toast]);

  const handleViewDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsDetailOpen(true);
  };

  const handleExportTransaction = (transaction: Transaction) => {
    const data = JSON.stringify(transaction, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaction-${transaction.invoiceNumber}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleUpdateSaleStatus = async (status: 'Cancelled' | 'Refunded') => {
    if (!selectedTransaction) return;
    const confirmMessage =
      status === 'Cancelled'
        ? 'Are you sure you want to cancel this order?'
        : 'Are you sure you want to refund this order?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTransaction.id,
          status,
          reason: `${status} from transaction history`,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Unable to update sale status');
      }

      const updatedTransaction = {
        ...selectedTransaction,
        status,
      };

      setSelectedTransaction(updatedTransaction);
      setTransactions((prev) =>
        prev.map((t) => t.id === updatedTransaction.id ? updatedTransaction : t)
      );
      setRefreshKey(k => k + 1);

      toast({
        title: 'Success',
        description: `Sale ${status.toLowerCase()} successfully`,
      });
    } catch (error) {
      console.error('Failed to update sale status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update sale status',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterPaymentMethod('all');
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col h-full gap-2 md:gap-4 p-2 md:p-4 overflow-hidden">
      <div className="space-y-1 md:space-y-2 shrink-0">
        <h1 className="text-xl md:text-2xl font-bold">Transaction History</h1>
        <p className="hidden md:block text-muted-foreground">View and manage all sales transactions</p>
      </div>

      <TransactionFilters
        searchQuery={searchQuery}
        setSearchQuery={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        filterStatus={filterStatus}
        setFilterStatus={(s) => {
          setFilterStatus(s);
          setCurrentPage(1);
        }}
        filterPaymentMethod={filterPaymentMethod}
        setFilterPaymentMethod={(m) => {
          setFilterPaymentMethod(m);
          setCurrentPage(1);
        }}
        onReset={handleResetFilters}
      />

      <Card className="flex-1 flex flex-col min-h-[65vh] md:min-h-0 overflow-hidden">
        <CardHeader className="border-b shrink-0">
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {pagination && `Showing ${transactions.length} of ${pagination.total} transactions`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col h-full">
          {isLoading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="text-muted-foreground">Loading transactions...</div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex items-center justify-center flex-1">
              <div className="text-muted-foreground">No transactions found</div>
            </div>
          ) : (
            <TransactionTable
              transactions={transactions}
              onViewDetails={handleViewDetails}
              onExport={handleExportTransaction}
            />
          )}
        </CardContent>
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between shrink-0">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
              disabled={currentPage === pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <TransactionDetailsDialog
        transaction={selectedTransaction}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdateStatus={handleUpdateSaleStatus}
      />
    </div>
  );
}
