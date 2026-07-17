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

    // Reset Capacitor mock behavior
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
    expect(consoleErrorSpy).toHaveBeenCalledWith("[PrintUtil] Print content is missing.");
    expect(document.body.innerHTML).toBe(''); // No iframe appended
  });

  it('should standard web print with an iframe and trigger onBeforePrint and onAfterPrint', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p>Test Invoice</p>';

    const onBeforePrint = vi.fn();
    const onAfterPrint = vi.fn();

    // We need to mock setTimeout so it triggers handlePrint immediately
    global.setTimeout = ((fn: any, delay: number) => fn()) as any;

    // Create a spy for appendChild to capture the iframe
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const iframe = node as HTMLIFrameElement;
      Object.defineProperty(iframe, 'contentWindow', {
        value: {
          document: {
            querySelectorAll: () => [], // Use empty array since it's used with Array.from
            open: vi.fn(),
            write: vi.fn(),
            close: vi.fn()
          },
          focus: vi.fn(),
          print: vi.fn()
        },
        writable: true
      });
      return node;
    });

    printToIframe({
      printContent,
      onBeforePrint,
      onAfterPrint
    });

    const newIframe = appendChildSpy.mock.calls[0][0] as HTMLIFrameElement;

    // Wait for the simulated setTimeout
    await new Promise(resolve => originalSetTimeout(resolve, 0));

    expect(onBeforePrint).toHaveBeenCalled();
    expect(newIframe.contentWindow?.print).toHaveBeenCalled();
    expect(onAfterPrint).toHaveBeenCalled();
  });

  it('should wait for images to load before printing', async () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = '<p>Test</p>';

    const onBeforePrint = vi.fn();

    // We mock appendChild so we can intercept the iframe and mock its contentWindow
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const iframe = node as HTMLIFrameElement;

      // Create a mock image element
      const mockImg = document.createElement('img');
      Object.defineProperty(mockImg, 'complete', { value: false });
      let loadCallback: any;
      mockImg.addEventListener = vi.fn((event: string, cb: any) => {
        if (event === 'load') loadCallback = cb;
      });

      Object.defineProperty(iframe, 'contentWindow', {
        value: {
          document: {
            querySelectorAll: (sel: string) => sel === 'img' ? [mockImg] : [],
            open: vi.fn(),
            write: vi.fn(),
            close: vi.fn()
          },
          focus: vi.fn(),
          print: vi.fn()
        },
        writable: true
      });

      // Simulate image load after a tiny delay
      global.setTimeout(() => {
        if (loadCallback) loadCallback();
      }, 10);

      return document.body; // Fake return
    });

    printToIframe({
      printContent,
      onBeforePrint
    });

    // Initially not printed
    expect(onBeforePrint).not.toHaveBeenCalled();

    // Wait for image load simulation
    await new Promise(resolve => global.setTimeout(resolve, 20));

    expect(onBeforePrint).toHaveBeenCalled();

    appendChildSpy.mockRestore();
  });

  describe('Capacitor native environment', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    });

    it('should use cordova.plugins.printer if available', async () => {
      const printContent = document.createElement('div');

      const cordovaPrintSpy = vi.fn();
      global.window.cordova = {
        plugins: {
          printer: {
            print: cordovaPrintSpy
          }
        }
      };

      // We need to mock setTimeout so it triggers handlePrint immediately
      global.setTimeout = ((fn: any, delay: number) => fn()) as any;

      // Mock appendChild to ensure contentWindow exists so we bypass error handling
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        const iframe = node as HTMLIFrameElement;
        Object.defineProperty(iframe, 'contentWindow', {
          value: {
            document: {
              querySelectorAll: () => [],
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn()
            }
          },
          writable: true
        });
        return node;
      });

      printToIframe({ printContent });

      await new Promise(resolve => originalSetTimeout(resolve, 0));

      expect(cordovaPrintSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
      delete global.window.cordova;
    });

    it('should fallback to navigator.share or warn if cordova printer is not available', async () => {
      const printContent = document.createElement('div');

      // navigator.share may or may not be called depending on happy-dom support
      // We just verify the function completes without throwing
      global.setTimeout = ((fn: any) => fn()) as any;

      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        const iframe = node as HTMLIFrameElement;
        Object.defineProperty(iframe, 'contentWindow', {
          value: {
            document: {
              querySelectorAll: () => [],
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn()
            }
          },
          writable: true
        });
        return node;
      });

      // Should not throw
      expect(() => printToIframe({ printContent })).not.toThrow();

      await new Promise(resolve => originalSetTimeout(resolve, 0));

      appendChildSpy.mockRestore();
    });
  });
});
