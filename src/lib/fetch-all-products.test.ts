import { describe, expect, it } from 'vitest';
import { isAbortError } from './fetch-all-products';

describe('isAbortError', () => {
  it('detects AbortError and TimeoutError by name', () => {
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
  });

  it('detects abort message strings', () => {
    expect(isAbortError('signal is aborted without reason')).toBe(true);
    expect(isAbortError(new Error('The operation was aborted'))).toBe(true);
  });

  it('returns false for normal errors', () => {
    expect(isAbortError(new Error('network down'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
