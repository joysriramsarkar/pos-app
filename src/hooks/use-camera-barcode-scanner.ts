// ============================================================================
// useCameraBarcodeScanner - Camera Barcode Scanning Hook
// Lakhan Bhandar POS System
//
// This hook enables camera-based barcode/QR code scanning with a robust,
// race-condition-free cleanup mechanism.
// ============================================================================

import { useEffect, useRef, useCallback, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { convertBengaliToEnglishNumerals } from "@/lib/utils";

interface CameraBarcodeScannerConfig {
  /** Callback when barcode/QR is successfully scanned */
  onBarcodeDetected: (barcode: string) => void;
  /** Callback to trigger component close/unmount *after* cleanup */
  onClose: () => void;
  /** Callback for error handling */
  onError?: (error: string) => void;
  /** Enable or disable scanner */
  enabled?: boolean;
  /** Facings: environment (back), user (front) */
  facingMode?: "environment" | "user";
}

const SCANNER_ID = "html5-qr-code-full-region";

// Helper function to get user-friendly error messages
function getErrorMessage(error: any): string {
  if (typeof error === "string") return error;
  if (error.name === "NotAllowedError" || error.code === "PERMISSION_DENIED") {
    return "Camera permission denied. Please allow camera access in your browser settings.";
  }
  if (error.name === "NotFoundError" || error.code === "DEVICE_NOT_FOUND") {
    return "No camera device found. Please check if a camera is connected and enabled.";
  }
  if (error.name === "NotReadableError" || error.code === "DEVICE_IN_USE") {
    return "Camera is already in use by another application. Please close other camera apps.";
  }
  return (
    (error instanceof Error ? error.message : "Unknown error") ||
    "An unknown camera error occurred. Please try again."
  );
}

function playSuccessBeep() {
  if (typeof window === "undefined" || !(window as any).AudioContext) return;

  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.1;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      ctx.close();
    }, 80);
  } catch {
    // Ignore audio errors (some browsers restrict autoplay without user interaction)
  }
}

export function useCameraBarcodeScanner(config: CameraBarcodeScannerConfig) {
  const {
    onBarcodeDetected,
    onClose,
    onError,
    enabled = false,
    facingMode = "environment",
  } = config;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);

  const [isSupported, setIsSupported] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // --- Strict, Blocking Shutdown ---
  const startShutdown = useCallback(async () => {
    // If already shutting down, or no scanner exists, just ensure close is called.
    if (isShuttingDown || !scannerRef.current) {
      return; // Don't call onClose multiple times
    }

    setIsShuttingDown(true);
    console.log("[Scanner] Starting blocking shutdown...");

    try {
      const scanner = scannerRef.current;
      if (!scanner) return;

      try {
        const state = scanner.getState();
        console.log(`[Scanner] Current state before stop: ${state}`);
        if (state === 2) {
          // Html5QrcodeScannerState.SCANNING = 2
          console.log("[Scanner] Attempting to stop scanner...");
          await scanner.stop();
        }
      } catch (stopError) {
        console.warn(
          "[Scanner] Stop failed (might be in transition):",
          stopError,
        );
        // Continue with clear even if stop fails
      }

      try {
        console.log("[Scanner] Clearing scanner...");
        scanner.clear();
      } catch (clearError) {
        console.warn("[Scanner] Clear failed:", clearError);
      }

      console.log("[Scanner] Scanner cleanup completed.");
    } catch (error) {
      console.error("[Scanner] Unexpected error during cleanup:", error);
    } finally {
      if (isMountedRef.current) {
        scannerRef.current = null;
        setIsInitialized(false);
        setIsShuttingDown(false);
      }
      console.log("[Scanner] Shutdown complete. Calling onClose().");
      onClose(); // Triggers the parent component to unmount.
    }
  }, [onClose]);

  // --- Scanner Initialization ---
  const initializeScanner = useCallback(async () => {
    // Strict Mode Protection: Prevent initialization if already shutting down or initializing
    if (isInitializingRef.current || scannerRef.current || isShuttingDown) {
      if (isShuttingDown) {
        console.log(
          "[Scanner] Initialization skipped: scanner is shutting down.",
        );
      } else {
        console.log(
          "[Scanner] Initialization skipped: already initializing or initialized.",
        );
      }
      return;
    }
    isInitializingRef.current = true;
    setIsInitialized(false);
    console.log("[Scanner] Starting initialization...");

    try {
      // Pre-flight check: Container must exist in the DOM.
      const container = document.getElementById(SCANNER_ID);
      if (!container) {
        throw new Error(`Scanner container #${SCANNER_ID} not found in DOM.`);
      }
      container.innerHTML = ""; // Clear previous content

      // Initialize the scanner library.
      const scanner = new Html5Qrcode(SCANNER_ID);

      // Always prioritize the back camera (environment). If the browser cannot satisfy exact constraints,
      // retry using a less strict constraint rather than falling back to the front camera.
      const desiredFacingMode = "environment";

      const getEnvironmentCameraId = async (): Promise<string | null> => {
        try {
          // First, explicitly call Html5Qrcode.getCameras() to get the array of available devices
          const devices = await Html5Qrcode.getCameras();
          console.log("[Scanner] Available cameras:", devices);

          // Iterate through the devices and explicitly look for a camera where device.label.toLowerCase()
          // includes "back", "rear", or "environment"
          for (const device of devices) {
            const label = (device.label || "").toLowerCase();
            if (
              label.includes("back") ||
              label.includes("rear") ||
              label.includes("environment")
            ) {
              console.log(
                "[Scanner] Found back camera:",
                device.label,
                device.id,
              );
              return device.id;
            }
          }

          // If no back camera found by label, try to find any video input device
          // Html5Qrcode.getCameras() returns all available cameras, so we'll use the last one as fallback
          if (devices.length > 0) {
            // Assume the last camera in the array is the back camera
            const backCamera = devices[devices.length - 1];
            console.log(
              "[Scanner] Using fallback camera (assuming back):",
              backCamera.label,
              backCamera.id,
            );
            return backCamera.id;
          }

          return null;
        } catch (error) {
          console.warn("[Scanner] Failed to enumerate cameras:", error);
          return null;
        }
      };

      const commonScanOptions = {
        fps: 20, // Increased FPS for real-time mobile scanning
        qrbox: (w: number, h: number) => {
          // Rectangular box optimal for standard EAN/UPC barcodes
          return { width: w * 0.8, height: h * 0.5 };
        },
        aspectRatio: 1.0,
        videoConstraints: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const handleScanSuccess = (decodedText: string) => {
        const normalizedText = convertBengaliToEnglishNumerals(decodedText);
        const now = Date.now();
        if (now - lastScannedTimeRef.current < 1500) {
          return; // Debounce duplicate scans
        }
        lastScannedRef.current = normalizedText;
        lastScannedTimeRef.current = now;
        playSuccessBeep();
        console.log("[Scanner] ✅ Barcode detected:", normalizedText);
        onBarcodeDetected(normalizedText);
      };

      const handleScanFailure = (error: any) => {
        const errorMsg =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Unknown error";
        // Avoid logging noisy scan failures that happen on every frame.
        if (
          errorMsg &&
          !errorMsg.includes(
            "No MultiFormat Readers were able to detect the code",
          ) &&
          !errorMsg.includes("No barcode or QR code detected")
        ) {
          console.warn("[Scanner] Scan error:", errorMsg);
        }
      };

      const environmentDeviceId = await getEnvironmentCameraId();
      let started = false;

      // 1) Try deviceId-based selection (most reliable on mobile devices).
      if (environmentDeviceId) {
        try {
          // সরাসরি string ID পাস করতে হবে, কোনো জটিল Object নয়
          await scanner.start(
            environmentDeviceId,
            commonScanOptions,
            handleScanSuccess,
            handleScanFailure,
          );
          started = true;
          console.log("[Scanner] Started using detected back camera deviceId.");
        } catch (deviceIdError) {
          console.warn(
            "[Scanner] Failed to start using environment deviceId...",
            deviceIdError,
          );
          // এখানে throw করা যাবে না, করলে নিচের fallback কাজ করবে না।
        }
      }

      // 2) Fallback: try facingMode constraints if still not started.
      if (!started) {
        try {
          // Strict facingMode Object
          await scanner.start(
            { facingMode: { exact: "environment" } },
            commonScanOptions,
            handleScanSuccess,
            handleScanFailure,
          );
          started = true;
          console.log("[Scanner] Started with strict facingMode=environment.");
        } catch (strictError) {
          console.warn(
            "[Scanner] Strict facingMode failed, retrying relaxed facingMode...",
            strictError,
          );
          try {
            // Relaxed facingMode Object
            await scanner.start(
              { facingMode: "environment" },
              commonScanOptions,
              handleScanSuccess,
              handleScanFailure,
            );
            started = true;
            console.log(
              "[Scanner] Started with relaxed facingMode=environment.",
            );
          } catch (relaxedError) {
            console.error(
              "[Scanner] Failed to start scanner with environment-facing camera.",
              relaxedError,
            );
            throw relaxedError; // এখানে আর কোনো অপশন নেই, তাই Error Throw করতে হবে
          }
        }
      }

      // Check if component is still mounted before setting state.
      if (isMountedRef.current) {
        scannerRef.current = scanner;
        setIsInitialized(true);
        console.log("[Scanner] ✅ Scanner initialized successfully.");
      } else {
        console.log(
          "[Scanner] Component unmounted during initialization, cleaning up.",
        );
        const state = scanner.getState();
        if (state === 2) {
          await scanner.stop();
        }
        scanner.clear();
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error("[Scanner] ❌ Initialization failed:", errorMessage, error);
      if (isMountedRef.current) {
        onError?.(errorMessage);
        setIsSupported(false); // Assume non-recoverable error
      }
    } finally {
      isInitializingRef.current = false;
    }
  }, [facingMode, onBarcodeDetected, onError, isShuttingDown]);

  // --- Lifecycle Effects ---

  // Handle mount and unmount status.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize scanner when the 'enabled' prop becomes true.
  useEffect(() => {
    if (enabled && isSupported) {
      // Use a short delay to ensure the DOM element is available after the dialog opens.
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          initializeScanner();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [enabled, isSupported, initializeScanner]);

  // Final safety-net cleanup on unmount.
  // This should ideally not be needed if startShutdown is always called.
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        console.warn(
          "[Scanner] Unsafe unmount cleanup triggered. The scanner was not shut down correctly.",
        );
        const scanner = scannerRef.current;
        scannerRef.current = null;

        const cleanup = async () => {
          try {
            const state = scanner.getState();
            if (state === 2) {
              await scanner.stop();
            }
            scanner.clear();
          } catch (err) {
            console.error("[Scanner] Unsafe cleanup failed:", err);
          }
        };
        cleanup();
      }
    };
  }, []);

  return {
    isSupported,
    isInitialized,
    isShuttingDown,
    startShutdown,
    scannerId: SCANNER_ID,
  };
}

export default useCameraBarcodeScanner;
