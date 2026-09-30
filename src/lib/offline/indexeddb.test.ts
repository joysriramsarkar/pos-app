import { describe, it, expect, afterEach } from 'vitest';
import { isOnline } from './indexeddb';

describe('isOnline', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    // Restore navigator after each test
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('should return false when navigator is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(isOnline()).toBe(false);
  });

  it('should return true when navigator.onLine is true', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true } as any,
      configurable: true,
      writable: true,
    });
    expect(isOnline()).toBe(true);
  });

  it('should return false when navigator.onLine is false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false } as any,
      configurable: true,
      writable: true,
    });
    expect(isOnline()).toBe(false);
  });
});
