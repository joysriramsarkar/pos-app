import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { safeJsonFetch, getErrorMessage } from './api-utils';

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
  });

  it('converts non-Error values to string', () => {
    expect(getErrorMessage('Custom string error')).toBe('Custom string error');
    expect(getErrorMessage(404)).toBe('404');
    expect(getErrorMessage({ message: 'object' })).toBe('[object Object]');
  });
});

describe('safeJsonFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = mock();
  });

  afterEach(() => {
    // Restore original fetch after each test
    global.fetch = originalFetch;
  });

  it('should handle a successful JSON response', async () => {
    const mockData = { message: 'Success' };
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    };
    (global.fetch as ReturnType<typeof mock>).mockResolvedValue(mockResponse);

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', undefined);
    expect(result).toEqual({
      data: mockData,
      ok: true,
      status: 200,
    });
  });

  it('should handle an HTTP error with a JSON error message', async () => {
    const mockErrorData = { error: 'Bad Request' };
    const mockResponse = {
      ok: false,
      status: 400,
      json: () => Promise.resolve(mockErrorData),
    };
    (global.fetch as ReturnType<typeof mock>).mockResolvedValue(mockResponse);

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(result).toEqual({
      data: null,
      ok: false,
      error: 'Bad Request',
      status: 400,
    });
  });

  it('should handle an HTTP error with JSON but no error field', async () => {
    const mockErrorData = { somethingElse: 'Failed' };
    const mockResponse = {
      ok: false,
      status: 404,
      json: () => Promise.resolve(mockErrorData),
    };
    (global.fetch as ReturnType<typeof mock>).mockResolvedValue(mockResponse);

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(result).toEqual({
      data: null,
      ok: false,
      error: 'HTTP 404',
      status: 404,
    });
  });

  it('should handle an HTTP error with a non-JSON (e.g. HTML) response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('Unexpected token < in JSON at position 0')),
    };
    (global.fetch as ReturnType<typeof mock>).mockResolvedValue(mockResponse);

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(result).toEqual({
      data: null,
      ok: false,
      error: 'Server error: Internal Server Error',
      status: 500,
    });
  });

  it('should handle a successful response but with invalid JSON', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Unexpected token < in JSON at position 0')),
    };
    (global.fetch as ReturnType<typeof mock>).mockResolvedValue(mockResponse);

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(result).toEqual({
      data: null,
      ok: false,
      error: 'Failed to parse response JSON',
      status: 200,
    });
  });

  it('should handle network errors (fetch throws an Error instance)', async () => {
    const networkError = new Error('Failed to fetch');
    (global.fetch as ReturnType<typeof mock>).mockRejectedValue(networkError);

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(result).toEqual({
      data: null,
      ok: false,
      error: 'Failed to fetch',
      status: 0,
    });
  });

  it('should handle network errors (fetch throws a non-Error)', async () => {
    (global.fetch as ReturnType<typeof mock>).mockRejectedValue('String error');

    const result = await safeJsonFetch('https://api.example.com/data');

    expect(result).toEqual({
      data: null,
      ok: false,
      error: 'Network error',
      status: 0,
    });
  });
});
