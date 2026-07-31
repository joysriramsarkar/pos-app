'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  UserPlus,
  Search,
  X,
} from 'lucide-react';
import type { PartyType } from './parties-utils';
import { CustomersPanel } from './CustomersPanel';
import { SuppliersPanel } from './SuppliersPanel';
import { AddPartyDialog, EditPartyDialog } from './PartyFormDialogs';
import {
  CustomerLedgerDialog,
  CustomerPaymentDialog,
  CustomerPrepaymentDialog,
  CustomerWithdrawDialog,
  CustomerDueEntryDialog,
  CustomerDetailsDialog,
} from './CustomerDialogs';
import {
  SupplierLedgerDialog,
  SupplierPaymentDialog,
  SupplierDueEntryDialog,
} from './SupplierDialogs';
import { usePartiesManagement } from './usePartiesManagement';

interface PartiesManagementProps {
  refreshKey?: number;
}

export function PartiesManagement({ refreshKey }: PartiesManagementProps = {}) {
  const {
    t,
    searchInputRef,
    activeTab,
    setActiveTab,
    customerSearchInput,
    setCustomerSearchInput,
    clearCustomerSearch,
    supplierSearchInput,
    setSupplierSearchInput,
    clearSupplierSearch,
    selectedCustomer,
    showLedger,
    setShowLedger,
    showPaymentDialog,
    setShowPaymentDialog,
    showPrepaymentDialog,
    setShowPrepaymentDialog,
    showWithdrawDialog,
    setShowWithdrawDialog,
    paymentAmount,
    setPaymentAmount,
    paymentMethod,
    setPaymentMethod,
    cashAmount,
    setCashAmount,
    upiAmount,
    setUpiAmount,
    prepaymentAmount,
    setPrepaymentAmount,
    withdrawAmount,
    setWithdrawAmount,
    showAddDialog,
    setShowAddDialog,
    showEditDialog,
    setShowEditDialog,
    editingPartyType,
    newParty,
    setNewParty,
    showDueEntryDialog,
    setShowDueEntryDialog,
    dueEntryAmount,
    setDueEntryAmount,
    dueEntryDescription,
    setDueEntryDescription,
    setIsNameEnTouched,
    customerSort,
    setCustomerSort,
    supplierSort,
    setSupplierSort,
    showDetailsDialog,
    setShowDetailsDialog,
    setDetailsCustomerId,
    detailsCustomerName,
    setDetailsCustomerName,
    detailsCustomerPhone,
    setDetailsCustomerPhone,
    customerDetail,
    setCustomerDetail,
    detailsLoading,
    customers,
    suppliers,
    ledgerEntries,
    selectedSupplier,
    showSupplierLedger,
    setShowSupplierLedger,
    showSupplierPaymentDialog,
    setShowSupplierPaymentDialog,
    supplierPaymentAmount,
    setSupplierPaymentAmount,
    supplierPaymentMethod,
    setSupplierPaymentMethod,
    showSupplierDueEntryDialog,
    setShowSupplierDueEntryDialog,
    supplierDueEntryAmount,
    setSupplierDueEntryAmount,
    supplierDueEntryDescription,
    setSupplierDueEntryDescription,
    supplierCashAmount,
    setSupplierCashAmount,
    supplierUpiAmount,
    setSupplierUpiAmount,
    supplierLedgerEntries,
    isSubmitting,
    parsedPaymentAmount,
    isMixedOk,
    formatPrice,
    formatDate,
    formatNumber,
    currencySymbol,
    filteredCustomers,
    filteredSuppliers,
    totalDue,
    customersWithDue,
    totalSupplierDue,
    suppliersWithDue,
    handleViewLedger,
    handleViewSupplierLedger,
    handleRecordSupplierPayment,
    handleSupplierPaymentSubmit,
    handleRecordSupplierDueEntry,
    handleSupplierDueEntrySubmit,
    handleRecordDueEntry,
    handleDueEntrySubmit,
    handleRecordPayment,
    handleRecordPrepayment,
    handleWithdraw,
    handleWithdrawSubmit,
    handleEditParty,
    handleUpdateParty,
    handlePaymentSubmit,
    handlePrepaymentSubmit,
    handleAddParty,
    hasPartyChanges,
    resetPartyForm,
    EMPTY_PARTY_FORM,
  } = usePartiesManagement(refreshKey);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background p-3 md:p-4">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 md:w-6 md:h-6 shrink-0" />
              <span className="truncate">{t('title')}</span>
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
              {t('subtitle')}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => { setNewParty(EMPTY_PARTY_FORM); setIsNameEnTouched(false); setShowAddDialog(true); }}
            className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 shrink-0 h-10 px-3 touch-manipulation"
          >
            <UserPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {activeTab === 'customer' ? t('add_customer_btn') : t('add_supplier_btn')}
            </span>
          </Button>
        </div>

        {/* Summary Cards — horizontal scroll on very small screens */}
        <div className="flex overflow-x-auto snap-x gap-2 mb-3 md:mb-4 scrollbar-none md:grid md:grid-cols-3 md:overflow-visible">
          <Card className="bg-muted/50 min-w-[7.5rem] snap-start shrink-0 md:min-w-0 md:shrink">
            <CardContent className="p-2.5 md:p-3">
              <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{activeTab === 'customer' ? t('total_due') : t('total_due_supplier') || 'মোট বকেয়া (সাপ্লায়ার)'}</p>
              <p className="text-base md:text-lg font-bold text-red-600 tabular-nums">{formatPrice(activeTab === 'customer' ? totalDue : totalSupplierDue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50 min-w-[7.5rem] snap-start shrink-0 md:min-w-0 md:shrink">
            <CardContent className="p-2.5 md:p-3">
              <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{activeTab === 'customer' ? t('customers_with_due') : t('suppliers_with_due') || 'বকেয়া আছে এমন সাপ্লায়ার'}</p>
              <p className="text-base md:text-lg font-bold tabular-nums">{activeTab === 'customer' ? customersWithDue : suppliersWithDue}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50 min-w-[7.5rem] snap-start shrink-0 md:min-w-0 md:shrink">
            <CardContent className="p-2.5 md:p-3">
              <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">{activeTab === 'customer' ? t('total_customers') : t('total_suppliers') || 'মোট সাপ্লায়ার'}</p>
              <p className="text-base md:text-lg font-bold tabular-nums">{activeTab === 'customer' ? customers.filter(c => c.isActive).length : suppliers.filter(s => s.isActive).length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PartyType)}>
          <TabsList className="w-full rounded-none bg-transparent h-12">
            <TabsTrigger value="customer" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none font-bold">
              {t('customers_tab') || 'Customers'} ({filteredCustomers.length})
            </TabsTrigger>
            <TabsTrigger value="supplier" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none font-bold">
              {t('suppliers_tab') || 'Suppliers'} ({filteredSuppliers.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'customer' ? (
          <CustomersPanel
            customers={filteredCustomers}
            searchInput={customerSearchInput}
            onSearchChange={setCustomerSearchInput}
            onClearSearch={clearCustomerSearch}
            sortValue={customerSort}
            onSortChange={setCustomerSort}
            formatPrice={formatPrice}
            onEdit={handleEditParty}
            onViewLedger={handleViewLedger}
            onViewDetails={(customer) => {
              setDetailsCustomerId(customer.id);
              setDetailsCustomerName(customer.name);
              setDetailsCustomerPhone(customer.phone || '');
              setShowDetailsDialog(true);
            }}
            onRecordPrepayment={handleRecordPrepayment}
            onRecordDueEntry={handleRecordDueEntry}
            onWithdraw={handleWithdraw}
            onRecordPayment={handleRecordPayment}
          />
        ) : (
          <SuppliersPanel
            suppliers={filteredSuppliers}
            searchInput={supplierSearchInput}
            onSearchChange={setSupplierSearchInput}
            onClearSearch={clearSupplierSearch}
            sortValue={supplierSort}
            onSortChange={setSupplierSort}
            formatPrice={formatPrice}
            onEdit={handleEditParty}
            onViewLedger={handleViewSupplierLedger}
            onRecordDueEntry={handleRecordSupplierDueEntry}
            onRecordPayment={handleRecordSupplierPayment}
          />
        )}
      </div>

      <CustomerLedgerDialog
        open={showLedger}
        onOpenChange={setShowLedger}
        customer={selectedCustomer}
        ledgerEntries={ledgerEntries}
        formatPrice={formatPrice}
        formatDate={formatDate}
      />

      <CustomerPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        customer={selectedCustomer}
        paymentAmount={paymentAmount}
        setPaymentAmount={setPaymentAmount}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        cashAmount={cashAmount}
        setCashAmount={setCashAmount}
        upiAmount={upiAmount}
        setUpiAmount={setUpiAmount}
        parsedPaymentAmount={parsedPaymentAmount}
        isMixedOk={isMixedOk}
        isSubmitting={isSubmitting}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onSubmit={handlePaymentSubmit}
      />

      <CustomerPrepaymentDialog
        open={showPrepaymentDialog}
        onOpenChange={setShowPrepaymentDialog}
        customer={selectedCustomer}
        prepaymentAmount={prepaymentAmount}
        setPrepaymentAmount={setPrepaymentAmount}
        isSubmitting={isSubmitting}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onSubmit={handlePrepaymentSubmit}
      />

      <CustomerWithdrawDialog
        open={showWithdrawDialog}
        onOpenChange={setShowWithdrawDialog}
        customer={selectedCustomer}
        withdrawAmount={withdrawAmount}
        setWithdrawAmount={setWithdrawAmount}
        isSubmitting={isSubmitting}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onSubmit={handleWithdrawSubmit}
      />

      <EditPartyDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) resetPartyForm();
        }}
        partyType={editingPartyType}
        form={newParty}
        setForm={setNewParty}
        setIsNameEnTouched={setIsNameEnTouched}
        hasChanges={hasPartyChanges}
        isSubmitting={isSubmitting}
        onSubmit={handleUpdateParty}
        onCancel={() => {
          setShowEditDialog(false);
          resetPartyForm();
        }}
      />

      <AddPartyDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        activeTab={activeTab}
        form={newParty}
        setForm={setNewParty}
        setIsNameEnTouched={setIsNameEnTouched}
        isSubmitting={isSubmitting}
        onSubmit={handleAddParty}
        onCancel={() => {
          setShowAddDialog(false);
          setNewParty(EMPTY_PARTY_FORM);
          setIsNameEnTouched(false);
        }}
      />

      <CustomerDueEntryDialog
        open={showDueEntryDialog}
        onOpenChange={setShowDueEntryDialog}
        customer={selectedCustomer}
        amount={dueEntryAmount}
        setAmount={setDueEntryAmount}
        description={dueEntryDescription}
        setDescription={setDueEntryDescription}
        isSubmitting={isSubmitting}
        currencySymbol={currencySymbol}
        onSubmit={handleDueEntrySubmit}
      />

      <SupplierDueEntryDialog
        open={showSupplierDueEntryDialog}
        onOpenChange={setShowSupplierDueEntryDialog}
        supplier={selectedSupplier}
        amount={supplierDueEntryAmount}
        setAmount={setSupplierDueEntryAmount}
        description={supplierDueEntryDescription}
        setDescription={setSupplierDueEntryDescription}
        isSubmitting={isSubmitting}
        currencySymbol={currencySymbol}
        onSubmit={handleSupplierDueEntrySubmit}
      />

      <CustomerDetailsDialog
        open={showDetailsDialog}
        onOpenChange={(o) => {
          if (!o) {
            setShowDetailsDialog(false);
            setDetailsCustomerId(null);
            setCustomerDetail(null);
          }
        }}
        customerName={detailsCustomerName}
        customerPhone={detailsCustomerPhone}
        detail={customerDetail}
        loading={detailsLoading}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
      />

      <SupplierLedgerDialog
        open={showSupplierLedger}
        onOpenChange={setShowSupplierLedger}
        supplier={selectedSupplier}
        ledgerEntries={supplierLedgerEntries}
        formatPrice={formatPrice}
        formatDate={formatDate}
      />

      <SupplierPaymentDialog
        open={showSupplierPaymentDialog}
        onOpenChange={setShowSupplierPaymentDialog}
        supplier={selectedSupplier}
        paymentAmount={supplierPaymentAmount}
        setPaymentAmount={setSupplierPaymentAmount}
        paymentMethod={supplierPaymentMethod}
        setPaymentMethod={setSupplierPaymentMethod}
        cashAmount={supplierCashAmount}
        setCashAmount={setSupplierCashAmount}
        upiAmount={supplierUpiAmount}
        setUpiAmount={setSupplierUpiAmount}
        isSubmitting={isSubmitting}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onSubmit={handleSupplierPaymentSubmit}
      />
    </div>
  );
}

export default PartiesManagement;
