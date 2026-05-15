import { describe, expect, it, mock, beforeEach } from 'bun:test';

mock.module('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => {
      return new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  },
}));

mock.module('next-auth', () => ({
  getServerSession: mock(() => Promise.resolve({ user: { id: '1', role: 'ADMIN' } })),
}));

mock.module('../auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

// Mock api-middleware to avoid permissions.ts -> db chain
const mockRequireRole = mock(() => Promise.resolve(null));
mock.module('@/lib/api-middleware', () => ({
  requireAuth: mock(() => Promise.resolve({ authorized: true, response: null, session: { user: { id: '1', role: 'ADMIN' } } })),
  requirePermission: mock(() => Promise.resolve(null)),
  requireRole: mockRequireRole,
  getAuthenticatedUser: mock(() => Promise.resolve({ id: '1', role: 'ADMIN' })),
}));

mock.module('bcryptjs', () => ({
  default: {
    hash: mock(() => Promise.resolve('hashed-password')),
    compare: mock(() => Promise.resolve(true)),
  },
  hash: mock(() => Promise.resolve('hashed-password')),
  compare: mock(() => Promise.resolve(true)),
}));

mock.module('crypto', () => ({
  default: {
    randomBytes: mock(() => ({ toString: () => 'random-string' })),
  },
  randomBytes: mock(() => ({ toString: () => 'random-string' })),
}));

mock.module('@/lib/db', () => ({
  db: {
    $transaction: mock((cb) => cb({
      saleItem: { deleteMany: mock(), createMany: mock() },
      purchaseItem: { deleteMany: mock(), createMany: mock() },
      stockHistory: { deleteMany: mock(), createMany: mock() },
      ledgerEntry: { deleteMany: mock(), createMany: mock() },
      sale: { deleteMany: mock(), createMany: mock() },
      purchase: { deleteMany: mock(), createMany: mock() },
      product: { deleteMany: mock(), createMany: mock() },
      category: { deleteMany: mock(), createMany: mock() },
      customer: { deleteMany: mock(), createMany: mock() },
      supplier: { deleteMany: mock(), createMany: mock() },
      setting: { deleteMany: mock(), createMany: mock() },
      user: { deleteMany: mock(), createMany: mock() },
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
    req.json = mock().mockRejectedValue(new Error('Invalid JSON'));

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
    req.json = mock().mockResolvedValue({ wrongKey: 'something' });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid backup format');
  });
});
