import { describe, it, expect, afterEach, vi } from 'vitest';
import { toClientError } from './api-errors';

describe('toClientError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps known prepaid balance errors to safe 400 copy', () => {
    const { message, status } = toClientError(
      new Error('Insufficient prepaid balance. Available: 10, Tried to use: 50'),
    );
    expect(status).toBe(400);
    expect(message).toBe('Insufficient prepaid balance for this sale');
    expect(message).not.toContain('Available');
  });

  it('maps product-not-found without leaking product ids', () => {
    const { message, status } = toClientError(
      new Error('Product not found: clxyz123secret'),
    );
    expect(status).toBe(404);
    expect(message).toBe('One or more products were not found');
    expect(message).not.toContain('clxyz');
  });

  it('maps customer-not-found without leaking customer ids', () => {
    const { message, status } = toClientError(
      new Error('Customer cust_abc not found'),
    );
    expect(status).toBe(404);
    expect(message).toBe('Customer not found');
    expect(message).not.toContain('cust_abc');
  });

  it('hides unknown internal messages behind fallback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { message, status } = toClientError(
      new Error('relation "sales" does not exist'),
      'Failed to create sale',
    );
    expect(status).toBe(500);
    expect(message).toBe('Failed to create sale');
    expect(message).not.toContain('relation');
  });

  it('maps cancel-with-returns to a safe client message', () => {
    const { message, status } = toClientError(
      new Error(
        'Cannot cancel/refund a sale that already has returns. Process remaining items via returns instead.',
      ),
    );
    expect(status).toBe(400);
    expect(message).toContain('returns');
  });
});
