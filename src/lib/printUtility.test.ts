import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { printToIframe } from './printUtility';
import { Capacitor } from '@capacitor/core';
import { GlobalWindow } from 'happy-dom';

// Setup happy-dom globally
const setupDOM = () => {
  const window = new GlobalWindow();
  global.window = window as any;
  global.document = window.document as any;
  global.navigator = window.navigator as any;
  return window;
};

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

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
    global.navigator = originalNavigator;
    global.setTimeout = originalSetTimeout;

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should log an error and return early if printContent is missing', () => {
    printToIframe({ printContent: null as any });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[PrintUtil] Print content is missing.');
  });

  it('should standard web print with an iframe and trigger onBeforePrint and onAfterPrint', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p>Test Invoice</p>';

    const onBeforePrint = vi.fn();
    const onAfterPrint = vi.fn();
    const printSpy = vi.fn();

    global.setTimeout = ((fn: any) => {
      fn();
      return 0 as any;
    }) as any;

    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const iframe = node as HTMLIFrameElement;
      Object.defineProperty(iframe, 'contentWindow', {
        value: {
          document: {
            querySelectorAll: () => [],
            open: vi.fn(),
            write: vi.fn(),
            close: vi.fn(),
          },
          focus: vi.fn(),
          print: printSpy,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        writable: true,
      });
      return node;
    });

    printToIframe({
      printContent,
      onBeforePrint,
      onAfterPrint,
    });

    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    expect(onBeforePrint).toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalled();
    expect(onAfterPrint).toHaveBeenCalled();

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

      global.setTimeout = ((fn: any) => {
        fn();
        return 0 as any;
      }) as any;

      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        const iframe = node as HTMLIFrameElement;
        Object.defineProperty(iframe, 'contentWindow', {
          value: {
            document: {
              querySelectorAll: () => [],
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn(),
            },
            focus: vi.fn(),
            print: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
          writable: true,
        });
        return node;
      });

      printToIframe({ printContent });

      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      expect(cordovaPrintSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
      delete (global.window as any).cordova;
    });

    it('should fall back to WebView print when cordova printer is missing', async () => {
      const printContent = document.createElement('div');
      const printSpy = vi.fn();

      delete (global.window as any).cordova;

      global.setTimeout = ((fn: any) => {
        fn();
        return 0 as any;
      }) as any;

      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        const iframe = node as HTMLIFrameElement;
        Object.defineProperty(iframe, 'contentWindow', {
          value: {
            document: {
              querySelectorAll: () => [],
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn(),
            },
            focus: vi.fn(),
            print: printSpy,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
          writable: true,
        });
        return node;
      });

      printToIframe({ printContent });

      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      expect(printSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
    });
  });
});
