// ============================================================================
// useBarcodeScanner - Global Barcode Scanner Hook
// Lakhan Bhandar POS System
// 
// This hook listens to global keyboard events and detects barcode scanner input
// by measuring typing speed. Barcode scanners typically input characters much
// faster than a human typist.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { convertBengaliToEnglishNumerals, isValidEanUpcBarcode } from '@/lib/utils';

const BARCODE_CHAR_REGEX = /^[0-9০-৯]$/;
const MIN_INTER_KEY_TIME = 0; // ms
const MAX_INTER_KEY_TIME = 200; // ms

const normalizeBarcode = (raw: string) => convertBengaliToEnglishNumerals(raw.trim());

// ============================================================================
// CONFIGURATION
// ============================================================================

interface BarcodeScannerConfig {
  /** Minimum time between keystrokes to consider it a barcode scan (ms) */
  minInterKeyTime?: number;
  /** Maximum time between keystrokes before buffer is cleared (ms) */
  maxInterKeyTime?: number;
  /** Minimum length of barcode to trigger callback */
  minBarcodeLength?: number;
  /** Maximum length of barcode */
  maxBarcodeLength?: number;
  /** End characters that signify barcode completion (default: Enter) */
  endChars?: string[];
  /** Callback when barcode is detected */
  onBarcodeDetected: (barcode: string) => void;
  /** Callback for debugging/logging */
  onDebug?: (message: string) => void;
}

interface BarcodeScannerState {
  buffer: string[];
  lastKeyTime: number;
  isScanning: boolean;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useBarcodeScanner(config: BarcodeScannerConfig) {
  const {
    minInterKeyTime = MIN_INTER_KEY_TIME,
    maxInterKeyTime = MAX_INTER_KEY_TIME,
    minBarcodeLength = 12,
    maxBarcodeLength = 13,
    endChars = ['Enter', 'NumpadEnter'],
    onBarcodeDetected,
    onDebug,
  } = config;

  // Use ref to store state to avoid re-renders
  const stateRef = useRef<BarcodeScannerState>({
    buffer: [],
    lastKeyTime: 0,
    isScanning: false,
  });

  // Cooldown to prevent multi-triggering within 1500ms
  const lastScanTimeRef = useRef<number>(0);

  // Track if we're currently typing in an input field
  const isInputFocused = useRef(false);

  // Debug logger
  const debug = useCallback(
    (message: string) => {
      if (onDebug) {
        onDebug(message);
      }
    },
    [onDebug]
  );

  // Handle barcode detection
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if we're typing in an input field (unless it's Enter)
      const activeElement = document.activeElement;
      const isEditableElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute('contenteditable') === 'true';

      if (isEditableElement && !endChars.includes(event.key)) {
        isInputFocused.current = true;
        return;
      }

      isInputFocused.current = false;
      const currentTime = Date.now();
      const state = stateRef.current;
      const timeSinceLastKey = currentTime - state.lastKeyTime;

      debug(
        `Key: ${event.key}, Time since last: ${timeSinceLastKey}ms, Buffer: ${state.buffer}`
      );

      // Check if this is an end character
      if (endChars.includes(event.key)) {
        const rawBarcode = state.buffer.join('');
        const barcode = normalizeBarcode(rawBarcode);
        const isBarcodeValid = isValidEanUpcBarcode(barcode);

        state.buffer = [];
        state.isScanning = false;
        state.lastKeyTime = 0;

        if (isBarcodeValid) {
          const now = Date.now();
          if (now - lastScanTimeRef.current < 1500) {
            debug(`Duplicate scan ignored due to cooldown: ${barcode}`);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
          lastScanTimeRef.current = now;
          debug(`Barcode detected: ${barcode} (raw: ${rawBarcode})`);
          onBarcodeDetected(barcode);
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        } else if (rawBarcode.length > 0) {
          debug(`Invalid barcode on enter: ${barcode} (raw: ${rawBarcode})`);
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        return;
      }

      // Only allow digits and Bengali digits for strict UPC/EAN handling
      if (!BARCODE_CHAR_REGEX.test(event.key)) {
        state.buffer = [];
        state.isScanning = false;
        state.lastKeyTime = 0;
        return;
      }

      const isScannerSpeed = state.lastKeyTime > 0 && timeSinceLastKey <= maxInterKeyTime;
      const shouldAppend = state.buffer.length === 0 || isScannerSpeed;

      // Consume the event if it's scanner speed or we have a buffer to prevent native button click/selection triggers
      if (isScannerSpeed || state.buffer.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      if (!shouldAppend && timeSinceLastKey > maxInterKeyTime) {
        state.buffer = [event.key];
        state.isScanning = false;
        state.lastKeyTime = currentTime;
        return;
      }

      state.buffer.push(event.key);
      state.lastKeyTime = currentTime;
      state.isScanning = isScannerSpeed || state.buffer.length === 1;

      if (state.buffer.length > maxBarcodeLength) {
        debug(`Buffer too long, resetting: ${state.buffer.join('')}`);
        state.buffer = [];
        state.isScanning = false;
        state.lastKeyTime = 0;
      }
    },
    [endChars, minBarcodeLength, maxBarcodeLength, maxInterKeyTime, onBarcodeDetected, debug]
  );

  // Clear buffer after timeout (for partial scans)
  const clearBuffer = useCallback(() => {
    const state = stateRef.current;
    if (state.buffer.length > 0 && state.buffer.length < minBarcodeLength) {
      debug(`Clearing partial buffer: ${state.buffer.join('')}`);
      state.buffer = [];
      state.isScanning = false;
      state.lastKeyTime = 0;
    }
  }, [minBarcodeLength, debug]);

  // Set up event listeners
  useEffect(() => {
    // Add keydown listener
    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase to intercept early

    // Set up timeout to clear partial barcodes
    const timeoutId = setInterval(clearBuffer, 1000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      clearInterval(timeoutId);
    };
  }, [handleKeyDown, clearBuffer]);

  // Return current state for debugging
  return {
    getCurrentBuffer: () => stateRef.current.buffer.join(''),
    isScanning: () => stateRef.current.isScanning,
  };
}

// ============================================================================
// SIMPLIFIED HOOK FOR POS
// ============================================================================

interface SimpleBarcodeScannerConfig {
  onBarcodeDetected: (barcode: string) => void;
  enabled?: boolean;
}

export function useSimpleBarcodeScanner({
  onBarcodeDetected,
  enabled = true,
}: SimpleBarcodeScannerConfig) {
  const bufferRef = useRef<string[]>([]);
  const lastKeyTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const flushBuffer = () => {
      bufferRef.current = [];
      lastKeyTimeRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isEditable =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute('contenteditable') === 'true';

      if (isEditable && event.key !== 'Enter' && event.key !== 'NumpadEnter') {
        return;
      }

      if (event.key === 'Enter' || event.key === 'NumpadEnter') {
        const rawBarcode = bufferRef.current.join('');
        const barcode = normalizeBarcode(rawBarcode);
        const isBarcodeValid = isValidEanUpcBarcode(barcode);
        flushBuffer();

        if (isBarcodeValid) {
          const now = Date.now();
          if (now - lastScanTimeRef.current < 1500) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
          lastScanTimeRef.current = now;
          onBarcodeDetected(barcode);
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        } else if (rawBarcode.length > 0) {
          // Consume invalid scanning Enter keys
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        return;
      }

      if (!BARCODE_CHAR_REGEX.test(event.key)) {
        flushBuffer();
        return;
      }

      const currentTime = Date.now();
      const lastTime = lastKeyTimeRef.current;
      const interKeyTime = lastTime ? currentTime - lastTime : 0;

      // Consume the digit key if we are in scanner speed or have buffer
      const isScannerSpeed = lastTime && interKeyTime <= MAX_INTER_KEY_TIME;
      if (isScannerSpeed || bufferRef.current.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      if (lastTime && interKeyTime > MAX_INTER_KEY_TIME) {
        bufferRef.current = [event.key];
      } else {
        bufferRef.current.push(event.key);
      }

      lastKeyTimeRef.current = currentTime;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        bufferRef.current = [];
        lastKeyTimeRef.current = null;
        timeoutRef.current = null;
      }, 400);
    };

    // Use capture phase (true) to intercept keyboard inputs before any page-level controls/buttons can trigger
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, onBarcodeDetected]);

  return {
    getCurrentBuffer: () => bufferRef.current.join(''),
    isScanning: () => bufferRef.current.length > 0,
  };
}

export default useBarcodeScanner;
