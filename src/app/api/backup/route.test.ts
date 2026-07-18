import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => {
      return new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { id: '1', role: 'ADMIN' } })),
}));

vi.mock('../auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

// Mock api-middleware to avoid permissions.ts -> db chain
const mockRequireRole = vi.fn(() => Promise.resolve(null));
vi.mock('@/lib/api-middleware', () => ({
  requireAuth: vi.fn(() => Promise.resolve({ authorized: true, response: null, session: { user: { id: '1', role: 'ADMIN' } } })),
  requirePermission: vi.fn(() => Promise.resolve(null)),
  requireRole: mockRequireRole,
  getAuthenticatedUser: vi.fn(() => Promise.resolve({ id: '1', role: 'ADMIN' })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('hashed-password')),
    compare: vi.fn(() => Promise.resolve(true)),
  },
  hash: vi.fn(() => Promise.resolve('hashed-password')),
  compare: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({ toString: () => 'random-string' })),
  },
  randomBytes: vi.fn(() => ({ toString: () => 'random-string' })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: vi.fn((cb) => cb({
      saleItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      purchaseItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      stockHistory: { deleteMany: vi.fn(), createMany: vi.fn() },
      ledgerEntry: { deleteMany: vi.fn(), createMany: vi.fn() },
      sale: { deleteMany: vi.fn(), createMany: vi.fn() },
      purchase: { deleteMany: vi.fn(), createMany: vi.fn() },
      product: { deleteMany: vi.fn(), createMany: vi.fn() },
      category: { deleteMany: vi.fn(), createMany: vi.fn() },
      customer: { deleteMany: vi.fn(), createMany: vi.fn() },
      supplier: { deleteMany: vi.fn(), createMany: vi.fn() },
      setting: { deleteMany: vi.fn(), createMany: vi.fn() },
      user: { deleteMany: vi.fn(), createMany: vi.fn() },
    })),
  },
}));

// Import the route AFTER mocks
const { POST } = await import('./route');

describe('POST /api/backup', () => {
  it('should return 400 for invalid JSON backup file', async () => {
    const req = new Request('http://localhost:3000/api/backup', {
      method: 'POST',
      body: 'invalid json',
    });

    // Mock the json() method directly on this instance
    req.json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid JSON backup file');
  });

  it('should return 400 for invalid backup format (missing data)', async () => {
    const req = new Request('http://localhost:3000/api/backup', {
      method: 'POST',
      body: JSON.stringify({ wrongKey: 'something' }),
    });

    // Mock the json() method directly on this instance
    req.json = vi.fn().mockResolvedValue({ wrongKey: 'something' });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid backup format');
  });
});
