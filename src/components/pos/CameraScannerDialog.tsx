'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { convertBengaliToEnglishNumerals, isValidEanUpcBarcode } from '@/lib/utils';
import { useCameraBarcodeScanner } from '@/hooks/use-camera-barcode-scanner';
import { Button } from '@/components/ui/button';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ScannedPreviewItem {
  name: string;
  qty: number;
}

interface CameraScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBarcodeScanned: (barcode: string) => void;
  title?: string;
  description?: string;
  singleScan?: boolean;
  scannedItems?: ScannedPreviewItem[];
  liveExternalError?: string | null;
}

export function CameraScannerDialog({
  open,
  onOpenChange,
  onBarcodeScanned,
  singleScan = false,
  scannedItems = [],
  liveExternalError = null,
}: CameraScannerDialogProps) {
  const tBilling = useTranslations('Billing');
  const tCommon = useTranslations('Common');
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = liveExternalError || localError;
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  const shutdownWebScannerRef = useRef<(() => Promise<void>) | null>(null);

  const handleWebBarcode = useCallback(
    (barcode: string) => {
      const normalized = convertBengaliToEnglishNumerals(barcode.replace(/\s+/g, ''));
      const now = Date.now();
      if (normalized === lastScannedRef.current && now - lastScannedTimeRef.current < 1500) return;
      lastScannedRef.current = normalized;
      lastScannedTimeRef.current = now;

      if (isValidEanUpcBarcode(normalized)) {
        setLocalError(null);
        onBarcodeScanned(normalized);
        if (navigator?.vibrate) navigator.vibrate(50);
        if (singleScan) shutdownWebScannerRef.current?.();
      } else {
        setLocalError(tBilling('invalid_barcode', { barcode: normalized }));
      }
    },
    [onBarcodeScanned, singleScan, tBilling]
  );

  const { scannerId, isInitialized, startShutdown } = useCameraBarcodeScanner({
    enabled: open && !isNativeApp,
    onBarcodeDetected: handleWebBarcode,
    onClose: () => onOpenChange(false),
    onError: (error) => setLocalError(error),
  });

  shutdownWebScannerRef.current = startShutdown;

  const stopNativeScanner = useCallback(async () => {
    document.querySelector('body')?.classList.remove('barcode-scanner-active');
    try {
      await listenerRef.current?.remove();
      listenerRef.current = null;
      await BarcodeScanner.removeAllListeners();
      await BarcodeScanner.stopScan();
    } catch {
      // ignore cleanup errors
    }
  }, []);

  const handleClose = useCallback(async () => {
    if (isNativeApp) {
      await stopNativeScanner();
    } else {
      await startShutdown();
    }
    setLocalError(null);
    onOpenChange(false);
  }, [isNativeApp, stopNativeScanner, startShutdown, onOpenChange]);

  useEffect(() => {
    if (!open || !isNativeApp) return;

    const startScanner = async () => {
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted') {
        setLocalError(tBilling('camera_permission_required'));
        return;
      }

      setLocalError(null);

      listenerRef.current = await BarcodeScanner.addListener(
        'barcodesScanned',
        (event) => {
          const barcode = event.barcodes?.[0];
          if (!barcode?.rawValue) return;
          handleWebBarcode(barcode.rawValue);
          if (singleScan) stopNativeScanner().then(() => onOpenChange(false));
        }
      );

      document.querySelector('body')?.classList.add('barcode-scanner-active');

      await BarcodeScanner.startScan({
        formats: [
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
        ],
      });
    };

    startScanner().catch((err) => setLocalError(tBilling('scanner_error', { error: err?.message || '' })));

    return () => { stopNativeScanner(); };
  }, [open, tBilling, isNativeApp, handleWebBarcode, onOpenChange, singleScan, stopNativeScanner]);

  useEffect(() => {
    if (!open) {
      setLocalError(null);
      lastScannedRef.current = '';
      lastScannedTimeRef.current = 0;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="barcode-scanner-overlay fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Web camera feed */}
      {!isNativeApp && (
        <div className="absolute inset-0">
          <div id={scannerId} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          {!isInitialized && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <p className="text-white text-sm">{tBilling('camera_starting')}</p>
            </div>
          )}
        </div>
      )}

      {/* Scanning frame */}
      <div className="relative flex-1 flex items-center justify-center pointer-events-none">
        <div className="border-2 border-white/80 rounded-lg w-72 h-40 relative">
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
        </div>
      </div>

      {/* Bottom panel */}
      <div className="relative bg-black/70 p-5 flex flex-col gap-3">
        {displayError ? (
          <div className="flex items-center justify-center gap-2 bg-red-500/20 p-2 rounded text-red-400 text-sm animate-pulse">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-center">{displayError}</span>
          </div>
        ) : (
          <p className="text-white/70 text-sm text-center">{tBilling('scan_barcode_desc')}</p>
        )}

        {!singleScan && scannedItems.length > 0 && (
          <div className="flex flex-col gap-1 max-h-28 overflow-y-auto overscroll-contain">
            {scannedItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-green-400 text-sm bg-white/5 p-1 rounded">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </div>
                <span className="font-bold shrink-0 bg-green-500/20 px-1.5 py-0.5 rounded text-xs">x{item.qty}</span>
              </div>
            ))}
          </div>
        )}

        {!singleScan && (
          <Button
            onClick={handleClose}
            variant="outline"
            className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
          >
            <X className="w-4 h-4 mr-2" />
            {tBilling('done_scanned', { count: scannedItems.reduce((s, i) => s + i.qty, 0) })}
          </Button>
        )}
        {singleScan && (
          <Button
            onClick={handleClose}
            variant="outline"
            className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
          >
            <X className="w-4 h-4 mr-2" />
            {tCommon('cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default CameraScannerDialog;
