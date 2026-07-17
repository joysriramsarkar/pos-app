'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { convertBengaliToEnglishNumerals, isValidEanUpcBarcode, cn } from '@/lib/utils';
import { useCameraBarcodeScanner } from '@/hooks/use-camera-barcode-scanner';
import { Button } from '@/components/ui/button';
import { CheckCircle2, X, AlertCircle, Flashlight, FlashlightOff, Keyboard } from 'lucide-react';
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
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);
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
      if (now - lastScannedTimeRef.current < 1200) return;
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

  const {
    scannerId,
    isInitialized,
    isSupported,
    startShutdown,
    torchSupported,
    torchOn,
    toggleTorch,
  } = useCameraBarcodeScanner({
    enabled: open && !isNativeApp,
    onBarcodeDetected: handleWebBarcode,
    onClose: () => onOpenChange(false),
    onError: (error) => {
      setLocalError(error);
      setShowKeyboardHint(true);
    },
  });

  useEffect(() => {
    shutdownWebScannerRef.current = startShutdown;
  }, [startShutdown]);

  // Lock page scroll while scanner is open (in-page fullscreen, not a browser popup)
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevTouch = body.style.touchAction;
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    // Native only: transparent body so ML Kit camera shows through
    if (isNativeApp) {
      body.classList.add('barcode-scanner-active');
    }
    return () => {
      body.style.overflow = prevOverflow;
      body.style.touchAction = prevTouch;
      if (isNativeApp) {
        body.classList.remove('barcode-scanner-active');
      }
    };
  }, [open, isNativeApp]);

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
    setShowKeyboardHint(false);
    onOpenChange(false);
  }, [isNativeApp, stopNativeScanner, startShutdown, onOpenChange]);

  const handleWebBarcodeRef = useRef(handleWebBarcode);
  const onOpenChangeRef = useRef(onOpenChange);
  const tBillingRef = useRef(tBilling);
  const stopNativeScannerRef = useRef(stopNativeScanner);

  useEffect(() => {
    handleWebBarcodeRef.current = handleWebBarcode;
  }, [handleWebBarcode]);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    tBillingRef.current = tBilling;
  }, [tBilling]);

  useEffect(() => {
    stopNativeScannerRef.current = stopNativeScanner;
  }, [stopNativeScanner]);

  useEffect(() => {
    if (!open || !isNativeApp) return;

    let isScanningActive = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const startScanner = async () => {
      try {
        await new Promise((resolve) => {
          timeoutId = setTimeout(resolve, 350);
        });
        if (!isScanningActive) return;

        const { camera } = await BarcodeScanner.requestPermissions();
        if (!isScanningActive) return;

        if (camera !== 'granted') {
          setLocalError(tBillingRef.current('camera_permission_required'));
          setShowKeyboardHint(true);
          return;
        }

        setLocalError(null);

        listenerRef.current = await BarcodeScanner.addListener(
          'barcodesScanned',
          (event) => {
            const barcode = event.barcodes?.[0];
            if (!barcode?.rawValue) return;
            handleWebBarcodeRef.current(barcode.rawValue);
            if (singleScan) {
              stopNativeScannerRef.current().then(() => onOpenChangeRef.current(false));
            }
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
      } catch (err: unknown) {
        if (isScanningActive) {
          const message = err instanceof Error ? err.message : '';
          setLocalError(tBillingRef.current('scanner_error', { error: message }));
          setShowKeyboardHint(true);
        }
      }
    };

    startScanner();

    return () => {
      isScanningActive = false;
      if (timeoutId) clearTimeout(timeoutId);
      stopNativeScannerRef.current();
    };
  }, [open, isNativeApp, singleScan]);

  useEffect(() => {
    if (!open) {
      setLocalError(null);
      setShowKeyboardHint(false);
      lastScannedRef.current = '';
      lastScannedTimeRef.current = 0;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tBilling('scan_barcode_title')}
      className={cn(
        'barcode-scanner-overlay fixed inset-0 z-[100] flex flex-col',
        'h-[100dvh] w-screen max-w-none',
        isNativeApp ? 'bg-transparent' : 'bg-black',
      )}
    >
      {/* Web: in-page full-screen camera (never a separate browser window) */}
      {!isNativeApp && (
        <div className="absolute inset-0 overflow-hidden bg-black">
          <div
            id={scannerId}
            className={cn(
              'h-full w-full',
              '[&_video]:!h-full [&_video]:!w-full [&_video]:!max-h-none [&_video]:!object-cover',
              '[&_img]:hidden', // hide html5-qrcode default shaded overlays that confuse focus
              '[&>div]:!h-full [&>div]:!w-full',
            )}
          />
          {!isInitialized && isSupported && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <p className="text-center text-sm text-white">{tBilling('camera_starting')}</p>
              <p className="text-center text-xs text-white/50">
                {tBilling('scan_barcode_desc')}
              </p>
            </div>
          )}
          {!isSupported && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-center text-sm text-red-300">
                {displayError || tBilling('camera_permission_required')}
              </p>
              <p className="text-center text-xs text-white/60 flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                {tBilling('scanner_keyboard_fallback')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Top bar: close + torch */}
      <div className="relative z-10 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleClose}
          className="pointer-events-auto h-11 w-11 rounded-full bg-black/50 text-white hover:bg-black/70"
          aria-label={tCommon('cancel')}
        >
          <X className="h-5 w-5" />
        </Button>

        {!isNativeApp && torchSupported && isInitialized && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => void toggleTorch()}
            className={cn(
              'pointer-events-auto h-11 w-11 rounded-full bg-black/50 text-white hover:bg-black/70',
              torchOn && 'bg-amber-500/80 hover:bg-amber-500',
            )}
            aria-label={torchOn ? tBilling('torch_off') : tBilling('torch_on')}
            aria-pressed={torchOn}
          >
            {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {/* Scanning frame */}
      <div className="relative flex-1 flex items-center justify-center pointer-events-none">
        <div className="relative w-[min(88vw,22rem)] h-40 rounded-xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
          <div className="absolute top-0 left-0 h-7 w-7 rounded-tl-xl border-t-4 border-l-4 border-emerald-400" />
          <div className="absolute top-0 right-0 h-7 w-7 rounded-tr-xl border-t-4 border-r-4 border-emerald-400" />
          <div className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-xl border-b-4 border-l-4 border-emerald-400" />
          <div className="absolute bottom-0 right-0 h-7 w-7 rounded-br-xl border-b-4 border-r-4 border-emerald-400" />
          {/* scan line animation */}
          <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400/80 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)] animate-pulse" />
        </div>
      </div>

      {/* Bottom panel */}
      <div className="relative z-10 bg-black/75 backdrop-blur-sm p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-3">
        {displayError ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-red-500/20 p-2.5 text-sm text-red-300 animate-pulse">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-center">{displayError}</span>
          </div>
        ) : (
          <p className="text-center text-sm text-white/75">{tBilling('scan_barcode_desc')}</p>
        )}

        {showKeyboardHint && (
          <p className="flex items-center justify-center gap-2 text-center text-xs text-white/55">
            <Keyboard className="h-3.5 w-3.5" />
            {tBilling('scanner_keyboard_fallback')}
          </p>
        )}

        {!singleScan && scannedItems.length > 0 && (
          <div className="flex max-h-28 flex-col gap-1 overflow-y-auto overscroll-contain">
            {scannedItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded bg-white/5 p-1.5 text-sm text-green-400"
              >
                <div className="flex min-w-0 items-center gap-2 truncate">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </div>
                <span className="shrink-0 rounded bg-green-500/20 px-1.5 py-0.5 text-xs font-bold">
                  x{item.qty}
                </span>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          onClick={handleClose}
          variant="outline"
          className="w-full border-white/30 bg-white/10 text-white hover:bg-white/20"
        >
          <X className="mr-2 h-4 w-4" />
          {singleScan
            ? tCommon('cancel')
            : tBilling('done_scanned', {
                count: scannedItems.reduce((s, i) => s + i.qty, 0),
              })}
        </Button>
      </div>
    </div>
  );
}

export default CameraScannerDialog;
