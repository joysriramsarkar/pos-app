// ============================================================================
// useCameraBarcodeScanner - High-quality in-page camera barcode scanning
// Browser/PWA path for Lakhan Bhandar POS (Capacitor uses ML Kit separately)
// ============================================================================

import { useEffect, useRef, useCallback, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { convertBengaliToEnglishNumerals } from "@/lib/utils";

interface CameraBarcodeScannerConfig {
  onBarcodeDetected: (barcode: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
  enabled?: boolean;
  facingMode?: "environment" | "user";
}

const SCANNER_ID = "html5-qr-code-full-region";

/** High-res rear camera constraints — applied both via facingMode and videoConstraints */
const HIGH_QUALITY_VIDEO: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920, min: 640 },
  height: { ideal: 1080, min: 480 },
  frameRate: { ideal: 30, min: 15 },
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  const err = error as { name?: string; code?: string; message?: string };
  if (err.name === "NotAllowedError" || err.code === "PERMISSION_DENIED") {
    return "Camera permission denied. Please allow camera access in your browser settings.";
  }
  if (err.name === "NotFoundError" || err.code === "DEVICE_NOT_FOUND") {
    return "No camera device found. Please check if a camera is connected and enabled.";
  }
  if (err.name === "NotReadableError" || err.code === "DEVICE_IN_USE") {
    return "Camera is already in use by another application. Please close other camera apps.";
  }
  if (err.name === "OverconstrainedError") {
    return "Camera does not support the requested quality. Trying lower settings...";
  }
  return (
    (error instanceof Error ? error.message : "Unknown error") ||
    "An unknown camera error occurred. Please try again."
  );
}

function playSuccessBeep() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
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
    // ignore autoplay restrictions
  }
}

function isBackCameraLabel(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("back") ||
    l.includes("rear") ||
    l.includes("environment") ||
    l.includes("পশ্চাৎ") ||
    // Common OEM labels
    l.includes("camera2 0") ||
    l.includes("0, facing back")
  );
}

/**
 * Prefer continuous autofocus + max resolution on the live track after start.
 * Silently no-ops when capabilities are missing.
 */
async function enhanceLiveTrack(scanner: Html5Qrcode): Promise<void> {
  try {
    const caps = scanner.getRunningTrackCapabilities?.() as
      | (MediaTrackCapabilities & {
          focusMode?: string[];
          zoom?: { min: number; max: number };
          torch?: boolean;
        })
      | undefined;
    if (!caps) return;

    const advanced: Record<string, unknown>[] = [];
    const constraints: Record<string, unknown> = {};

    if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
      constraints.focusMode = "continuous";
    }

    // Slight optical zoom when available helps dense 1D barcodes
    if (caps.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1) {
      const zoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min ?? 1, 1.5));
      advanced.push({ zoom });
    }

    if (Object.keys(constraints).length || advanced.length) {
      if (advanced.length) {
        constraints.advanced = advanced;
      }
      await scanner.applyVideoConstraints(constraints as MediaTrackConstraints);
    }
  } catch (e) {
    console.warn("[Scanner] Live track enhance skipped:", e);
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
  const isInitializingRef = useRef(false);
  const isMountedRef = useRef(false);

  const [isSupported, setIsSupported] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const lastScannedRef = useRef("");
  const lastScannedTimeRef = useRef(0);

  const startShutdown = useCallback(async () => {
    if (isShuttingDown || !scannerRef.current) {
      return;
    }

    setIsShuttingDown(true);
    console.log("[Scanner] Starting blocking shutdown...");

    try {
      const scanner = scannerRef.current;
      if (!scanner) return;

      try {
        // Turn torch off before stop
        if (torchOn) {
          try {
            await scanner.applyVideoConstraints({
              advanced: [{ torch: false }],
            } as unknown as MediaTrackConstraints);
          } catch {
            /* ignore */
          }
        }
        const state = scanner.getState();
        if (state === 2) {
          await scanner.stop();
        }
      } catch (stopError) {
        console.warn("[Scanner] Stop failed:", stopError);
      }

      try {
        scanner.clear();
      } catch (clearError) {
        console.warn("[Scanner] Clear failed:", clearError);
      }
    } catch (error) {
      console.error("[Scanner] Unexpected cleanup error:", error);
    } finally {
      if (isMountedRef.current) {
        scannerRef.current = null;
        setIsInitialized(false);
        setIsShuttingDown(false);
        setTorchOn(false);
        setTorchSupported(false);
      }
      onClose();
    }
  }, [onClose, isShuttingDown, torchOn]);

  const setTorch = useCallback(async (on: boolean) => {
    const scanner = scannerRef.current;
    if (!scanner || !torchSupported) return false;
    try {
      await scanner.applyVideoConstraints({
        advanced: [{ torch: on }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(on);
      return true;
    } catch (e) {
      console.warn("[Scanner] Torch toggle failed:", e);
      return false;
    }
  }, [torchSupported]);

  const toggleTorch = useCallback(async () => {
    return setTorch(!torchOn);
  }, [setTorch, torchOn]);

  const initializeScanner = useCallback(async () => {
    if (isInitializingRef.current || scannerRef.current || isShuttingDown) {
      return;
    }
    isInitializingRef.current = true;
    setIsInitialized(false);
    setTorchSupported(false);
    setTorchOn(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const msg = "Camera API is not supported in this browser.";
      onError?.(msg);
      setIsSupported(false);
      isInitializingRef.current = false;
      return;
    }

    try {
      const container = document.getElementById(SCANNER_ID);
      if (!container) {
        throw new Error(`Scanner container #${SCANNER_ID} not found in DOM.`);
      }
      container.innerHTML = "";

      // Style container for full-bleed in-page video (avoids tiny/blurry default)
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.overflow = "hidden";
      container.style.position = "relative";
      container.style.background = "#000";

      // Prefer native BarcodeDetector when available (Chrome Android) for sharper decode
      const scanner = new Html5Qrcode(SCANNER_ID, {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // Warm permission once so labels are available and UI stays in-page
      try {
        const warm = await navigator.mediaDevices.getUserMedia({
          video: HIGH_QUALITY_VIDEO,
          audio: false,
        });
        warm.getTracks().forEach((t) => t.stop());
      } catch (warmErr) {
        // Fall through — html5-qrcode will request again with softer constraints
        console.warn("[Scanner] Warm-up getUserMedia failed:", warmErr);
      }

      const getPreferredCameraId = async (): Promise<string | null> => {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (!devices?.length) return null;
          const back = devices.find((d) => isBackCameraLabel(d.label || ""));
          if (back) return back.id;
          // Many phones list rear last when facing labels are empty
          return devices[devices.length - 1]?.id ?? null;
        } catch {
          return null;
        }
      };

      const commonScanOptions = {
        fps: 15, // slightly lower fps → more decode time per frame on mobile CPUs
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Wide box for 1D EAN/UPC; leave margin for handheld shake
          const width = Math.floor(Math.min(viewfinderWidth * 0.88, 480));
          const height = Math.floor(Math.min(viewfinderHeight * 0.32, 180));
          return { width: Math.max(width, 240), height: Math.max(height, 100) };
        },
        // Match phone landscape camera feed; 1.0 square often forces downscale
        aspectRatio: 1.777778,
        disableFlip: false,
        videoConstraints: {
          ...HIGH_QUALITY_VIDEO,
          facingMode: facingMode === "user" ? { ideal: "user" } : { ideal: "environment" },
        } as MediaTrackConstraints,
      };

      const handleScanSuccess = (decodedText: string) => {
        const normalizedText = convertBengaliToEnglishNumerals(decodedText);
        const now = Date.now();
        if (now - lastScannedTimeRef.current < 1200) return;
        lastScannedRef.current = normalizedText;
        lastScannedTimeRef.current = now;
        playSuccessBeep();
        console.log("[Scanner] ✅ Barcode detected:", normalizedText);
        onBarcodeDetected(normalizedText);
      };

      const handleScanFailure = (error: unknown) => {
        const errorMsg =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "";
        if (
          errorMsg &&
          !errorMsg.includes("No MultiFormat Readers were able to detect the code") &&
          !errorMsg.includes("No barcode or QR code detected") &&
          !errorMsg.includes("QR code parse error")
        ) {
          // rare real errors only
          console.warn("[Scanner] Scan error:", errorMsg);
        }
      };

      let started = false;

      // 1) Best path: full MediaTrackConstraints (resolution applied by browser)
      const constraintAttempts: MediaTrackConstraints[] = [
        {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 15 },
        },
        {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        { facingMode: { ideal: facingMode } },
        { facingMode: facingMode },
      ];

      for (const cameraConfig of constraintAttempts) {
        if (started) break;
        try {
          await scanner.start(
            cameraConfig,
            commonScanOptions,
            handleScanSuccess,
            handleScanFailure,
          );
          started = true;
          console.log("[Scanner] Started with MediaTrackConstraints:", cameraConfig);
        } catch (e) {
          console.warn("[Scanner] Constraint attempt failed:", cameraConfig, e);
        }
      }

      // 2) Fallback: explicit deviceId (labels available after warm-up)
      if (!started) {
        const deviceId = await getPreferredCameraId();
        if (deviceId) {
          try {
            await scanner.start(
              deviceId,
              commonScanOptions,
              handleScanSuccess,
              handleScanFailure,
            );
            started = true;
            console.log("[Scanner] Started with deviceId:", deviceId);
          } catch (e) {
            console.warn("[Scanner] deviceId start failed:", e);
          }
        }
      }

      // 3) Last resort: any camera
      if (!started) {
        await scanner.start(
          { facingMode: "environment" },
          {
            ...commonScanOptions,
            videoConstraints: { facingMode: "environment" },
            aspectRatio: 1.333,
          },
          handleScanSuccess,
          handleScanFailure,
        );
        started = true;
        console.log("[Scanner] Started with last-resort environment facingMode");
      }

      // Polish live video CSS (html5-qrcode injects <video>)
      const video = container.querySelector("video");
      if (video) {
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        video.style.transform = "translateZ(0)"; // promote layer — sharper on some GPUs
      }
      const videoParent = container.querySelector("video")?.parentElement;
      if (videoParent) {
        (videoParent as HTMLElement).style.width = "100%";
        (videoParent as HTMLElement).style.height = "100%";
      }

      await enhanceLiveTrack(scanner);

      // Detect torch support for UI
      try {
        const caps = scanner.getRunningTrackCapabilities?.() as
          | { torch?: boolean }
          | undefined;
        if (caps?.torch) {
          setTorchSupported(true);
        }
      } catch {
        /* no torch */
      }

      if (isMountedRef.current) {
        scannerRef.current = scanner;
        setIsInitialized(true);
        console.log("[Scanner] ✅ Scanner initialized successfully.");
      } else {
        const state = scanner.getState();
        if (state === 2) await scanner.stop();
        scanner.clear();
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error("[Scanner] ❌ Initialization failed:", errorMessage, error);
      if (isMountedRef.current) {
        onError?.(errorMessage);
        setIsSupported(false);
      }
    } finally {
      isInitializingRef.current = false;
    }
  }, [facingMode, onBarcodeDetected, onError, isShuttingDown]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (enabled && isSupported) {
      // Wait for fullscreen overlay paint so #scanner container has non-zero size
      const timer = setTimeout(() => {
        if (isMountedRef.current) initializeScanner();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [enabled, isSupported, initializeScanner]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        void (async () => {
          try {
            if (scanner.getState() === 2) await scanner.stop();
            scanner.clear();
          } catch {
            /* ignore */
          }
        })();
      }
    };
  }, []);

  return {
    isSupported,
    isInitialized,
    isShuttingDown,
    startShutdown,
    scannerId: SCANNER_ID,
    torchSupported,
    torchOn,
    toggleTorch,
    setTorch,
  };
}

export default useCameraBarcodeScanner;
