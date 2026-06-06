import { describe, it, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalWindow } from 'happy-dom';

import { NextIntlClientProvider } from 'next-intl';

const mockToast = mock();
mock.module('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

mock.module('@/stores/pos-store', () => ({
  useProductsStore: (fn: any) => fn({ categories: ['Groceries'] })
}));

mock.module('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
  WebPlugin: class {}
}));

mock.module('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeScanner: { isSupported: () => Promise.resolve(true) },
  BarcodeFormat: { QR_CODE: 'QR_CODE' }
}));

mock.module('./CameraScannerDialog', () => ({
  CameraScannerDialog: () => null
}));

mock.module('@/hooks/use-camera-barcode-scanner', () => ({
  useCameraBarcodeScanner: () => ({
    scannerId: 'scanner-id',
    isInitialized: true,
    startShutdown: mock()
  })
}));

// Setup DOM completely barebones
const window = new GlobalWindow();
global.document = window.document as any;
global.window = window as any;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// We need an exact mock for the Button to ensure onClick goes through seamlessly
mock.module('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, type, variant, size, title }: any) => {
    // Expose the submission trigger
    if (children === 'update_product') {
      (window as any).__submitClick = onClick;
    }
    return <button disabled={disabled}>{children}</button>;
  }
}));

// MOCK RADIX
mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h1>{children}</h1>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

mock.module('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: () => <span>Select</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <span>{children}</span>,
}));

mock.module('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
  )
}));

const { ProductDialog } = await import('./ProductDialog');

describe('ProductDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockToast.mockClear();
    (window as any).__submitClick = null;
  });

  it('handles API errors during submission gracefully', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onSubmit = mock(() => {
      throw new Error('Network error simulated');
    });

    const testProduct = {
      id: '1',
      name: 'Test Product',
      nameBn: 'Test Product Bn',
      barcode: '1234567890',
      category: 'Groceries',
      buyingPrice: 100,
      sellingPrice: 150,
      unit: 'piece',
      currentStock: 10,
      minStockLevel: 5,
      isActive: true
    };

    // NOTE: For the `useEffect` to trigger and sync state from `product`, `product` must be passed!
    // Happy DOM may not immediately trigger `useEffect` in `createRoot` if we don't await
    root.render(
      <NextIntlClientProvider locale="en" messages={{ ProductDialog: { update_product: 'update_product', save_failed: 'Save Failed' }, Common: { cancel: 'Cancel' } }} onError={() => {}}>
        <ProductDialog open={true} onOpenChange={() => {}} product={testProduct as any} onSubmit={onSubmit} />
      </NextIntlClientProvider>
    );

    // Give generous time for React's useEffect to run and update internal state
    await new Promise(r => setTimeout(r, 50));

    // Just to be extremely sure the state is updated and form is valid,
    // wait a bit more, sometimes React batches these
    await new Promise(r => setTimeout(r, 50));

    if ((window as any).__submitClick) {
      await (window as any).__submitClick();
    }

    await new Promise(r => setTimeout(r, 20));

    // Verify error was handled
    expect(onSubmit).toHaveBeenCalled();

    expect(mockToast).toHaveBeenCalled();
    expect(mockToast.mock.calls[0][0]).toMatchObject({
      title: 'Save Failed',
      description: 'Network error simulated',
      variant: 'destructive'
    });

    // The formError should be shown in the UI
    expect(document.body.innerHTML).toContain('Network error simulated');
  });
});
