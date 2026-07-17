import { describe, it, expect, afterEach } from 'vitest';
import { isOnline } from './indexeddb';

describe('isOnline', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    // Restore navigator after each test
    global.navigator = originalNavigator;
  });

  it('should return false when navigator is undefined', () => {
    // @ts-ignore - explicitly setting to undefined for testing
    global.navigator = undefined;
    expect(isOnline()).toBe(false);
  });

  it('should return true when navigator.onLine is true', () => {
    // @ts-ignore
    global.navigator = { onLine: true };
    expect(isOnline()).toBe(true);
  });

  it('should return false when navigator.onLine is false', () => {
    // @ts-ignore
    global.navigator = { onLine: false };
    expect(isOnline()).toBe(false);
  });
});
