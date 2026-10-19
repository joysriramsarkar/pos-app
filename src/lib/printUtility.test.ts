import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { printToIframe } from './printUtility';
import { Capacitor } from '@capacitor/core';
import { GlobalWindow } from 'happy-dom';

// Setup happy-dom globally
const setupDOM = () => {
  const window = new GlobalWindow();
  global.window = window as any;
  global.document = window.document as any;
  try {
    Object.defineProperty(global, 'navigator', {
      value: window.navigator,
      configurable: true,
      writable: true,
    });
  } catch {
    // navigator might already be defined by the environment
  }
  return window;
};

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

/** Simulate a browser/WebView that exposes window.print(). */
function mockTopWindowPrint() {
  const spy = vi.fn();
  (global.window as any).print = spy;
  return spy;
}

/** Simulate a browser with no window.print() at all (iframe-only path). */
function removeTopWindowPrint() {
  try {
    delete (global.window as any).print;
  } catch {
    (global.window as any).print = undefined;
  }
}

/** Spy on iframe printing by faking the contentWindow of any appended iframe. */
function spyOnIframePrint() {
  const iframePrintSpy = vi.fn();
  const originalAppend = document.body.appendChild.bind(document.body);
  const appendChildSpy = vi
    .spyOn(document.body, 'appendChild')
    .mockImplementation(((node: any) => {
      if (node && node.tagName === 'IFRAME') {
        Object.defineProperty(node, 'contentWindow', {
          value: {
            document: {
              querySelectorAll: () => [],
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn(),
            },
            focus: vi.fn(),
            print: iframePrintSpy,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
          writable: true,
        });
      }
      return originalAppend(node);
    }) as any);
  return { iframePrintSpy, appendChildSpy };
}

describe('printToIframe', () => {
  let originalWindow: any;
  let originalDocument: any;
  let originalNavigator: any;
  let originalSetTimeout: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalNavigator = global.navigator;
    originalSetTimeout = global.setTimeout;

    setupDOM();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    try {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore restore if unchanged
    }
    global.setTimeout = originalSetTimeout;

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should log an error and return early if printContent is missing', async () => {
    const onError = vi.fn();
    const ok = await printToIframe({ printContent: null as any, onError });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[PrintUtil] Print content is missing.');
    expect(onError).toHaveBeenCalled();
    expect(ok).toBe(false);
  });

  it('prints through window.print() — the path mobile browsers actually support', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p>Test Invoice</p>';

    const topPrintSpy = mockTopWindowPrint();
    const onBeforePrint = vi.fn();
    const onAfterPrint = vi.fn();

    const ok = await printToIframe({
      printContent,
      onBeforePrint,
      onAfterPrint,
    });

    expect(topPrintSpy).toHaveBeenCalled();
    expect(onBeforePrint).toHaveBeenCalled();
    expect(onAfterPrint).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it('mounts the invoice into the real document so mobile engines can render it', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p class="thermal-invoice">Test Invoice</p>';

    mockTopWindowPrint();
    await printToIframe({ printContent });

    const root = document.getElementById('app-print-root');
    expect(root).not.toBeNull();
    expect(root?.innerHTML).toContain('thermal-invoice');
    expect(document.getElementById('app-print-root-style')).not.toBeNull();
  });

  it('falls back to the hidden iframe when window.print() is unavailable', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p>Test Invoice</p>';

    removeTopWindowPrint();
    global.setTimeout = ((fn: any) => {
      fn();
      return 0 as any;
    }) as any;

    const { iframePrintSpy, appendChildSpy } = spyOnIframePrint();

    const ok = await printToIframe({ printContent });

    expect(iframePrintSpy).toHaveBeenCalled();
    expect(ok).toBe(true);

    appendChildSpy.mockRestore();
  });

  it('reports an error when no print route is available on the web', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p>Test Invoice</p>';

    removeTopWindowPrint();
    const { appendChildSpy } = spyOnIframePrint();

    // Break the iframe route too: pretend the iframe has no print().
    const originalAppend = document.body.appendChild.bind(document.body);
    appendChildSpy.mockImplementation(((node: any) => {
      if (node && node.tagName === 'IFRAME') {
        Object.defineProperty(node, 'contentWindow', { value: undefined, writable: true });
      }
      return originalAppend(node);
    }) as any);

    const onError = vi.fn();
    const ok = await printToIframe({ printContent, onError });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalled();

    appendChildSpy.mockRestore();
  });

  describe('Capacitor native environment', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    });

    it('should use cordova.plugins.printer if available', async () => {
      const printContent = document.createElement('div');
      const cordovaPrintSpy = vi.fn((_html: string, _opts: unknown, cb: (ok: boolean) => void) => {
        cb(true);
      });

      (global.window as any).cordova = {
        plugins: {
          printer: {
            print: cordovaPrintSpy,
          },
        },
      };

      const topPrintSpy = mockTopWindowPrint();

      const ok = await printToIframe({ printContent });

      expect(cordovaPrintSpy).toHaveBeenCalled();
      // Cordova wins, so the web paths must not run.
      expect(topPrintSpy).not.toHaveBeenCalled();
      expect(ok).toBe(true);

      delete (global.window as any).cordova;
    });

    it('prints via the top window when no cordova printer is installed', async () => {
      const printContent = document.createElement('div');
      printContent.innerHTML = '<p>Test Invoice</p>';

      delete (global.window as any).cordova;
      const topPrintSpy = mockTopWindowPrint();

      const ok = await printToIframe({ printContent });

      expect(topPrintSpy).toHaveBeenCalled();
      expect(ok).toBe(true);
    });
  });
});