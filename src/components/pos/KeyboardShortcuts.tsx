'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsProps {
  activePage: string;
  setActivePage: (page: any) => void;
  onCheckout?: () => void;
  onNewBill?: () => void;
  onBarcodeScan?: () => void;
  onSearch?: () => void;
  onAddProduct?: () => void;
}

export default function KeyboardShortcuts({
  activePage,
  setActivePage,
  onCheckout,
  onNewBill,
  onBarcodeScan,
  onSearch,
  onAddProduct,
}: KeyboardShortcutsProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input/textarea/select fields
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return;
    }

    // F1 - Dashboard
    if (e.key === 'F1') {
      e.preventDefault();
      setActivePage('dashboard');
      return;
    }

    // F2 - Billing
    if (e.key === 'F2') {
      e.preventDefault();
      setActivePage('billing');
      return;
    }

    // F3 - Stock
    if (e.key === 'F3') {
      e.preventDefault();
      setActivePage('stock');
      return;
    }

    // F4 - Parties
    if (e.key === 'F4') {
      e.preventDefault();
      setActivePage('parties');
      return;
    }

    // F5 - Reports (prevent browser refresh)
    if (e.key === 'F5') {
      e.preventDefault();
      setActivePage('reports');
      return;
    }

    // F6 - Transactions
    if (e.key === 'F6') {
      e.preventDefault();
      setActivePage('transactions');
      return;
    }

    // F7 - Expenses
    if (e.key === 'F7') {
      e.preventDefault();
      setActivePage('expenses');
      return;
    }

    // F8 - Settings
    if (e.key === 'F8') {
      e.preventDefault();
      setActivePage('settings');
      return;
    }

    // Only apply billing-specific shortcuts when on billing page
    if (activePage === 'billing') {
      // F9 or Ctrl+Enter - Checkout
      if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        onCheckout?.();
        return;
      }

      // F10 - New Bill
      if (e.key === 'F10') {
        e.preventDefault();
        onNewBill?.();
        return;
      }

      // Ctrl+B - Barcode Scan
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        onBarcodeScan?.();
        return;
      }

      // Ctrl+F or / - Search focus
      if ((e.ctrlKey && e.key === 'f') || e.key === '/') {
        e.preventDefault();
        onSearch?.();
        return;
      }

      // Ctrl+N - New Product
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        onAddProduct?.();
        return;
      }
    }
  }, [activePage, setActivePage, onCheckout, onNewBill, onBarcodeScan, onSearch, onAddProduct]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return null; // This component doesn't render anything
}
