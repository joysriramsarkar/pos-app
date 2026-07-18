import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockFindMany = vi.fn(() => Promise.resolve([]));
const mockCount = vi.fn(() => Promise.resolve(0));

vi.mock('@/lib/env', () => ({ env: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(() => Promise.resolve(null)) },
    rolePermission: { findFirst: vi.fn(() => Promise.resolve(null)) },
    product: { findMany: mockFindMany, count: mockCount },
  },
}));

vi.mock('@/lib/permissions', () => ({
  hasPermission: vi.fn(() => Promise.resolve(true)),
  getUserRole: vi.fn(() => null),
  roleHasPermission: vi.fn(() => true),
  rolePermissions: {},
}));

vi.mock('@/lib/permissions-helpers', () => ({
  getUserRole: vi.fn(() => null),
  roleHasPermission: vi.fn(() => true),
  rolePermissions: {},
}));

vi.mock('@/lib/api-middleware', () => ({
  requireAuth: vi.fn(() => Promise.resolve({ authorized: true, response: null, session: { user: { id: '1', role: 'ADMIN' } } })),
  requirePermission: vi.fn(() => Promise.resolve(null)),
  requireRole: vi.fn(() => Promise.resolve(null)),
  getAuthenticatedUser: vi.fn(() => Promise.resolve({ id: '1', role: 'ADMIN' })),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { id: '1', role: 'ADMIN' } })),
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

const { GET } = await import('./route');

describe('GET /api/products', () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockCount.mockClear();
  });

  it('should return products on success', async () => {
    const products = [{ id: '1', name: 'Test Product', currentStock: 10 }];
    mockFindMany.mockResolvedValueOnce(products as never);
    mockCount.mockResolvedValueOnce(1);

    const req = new Request('http://localhost:3000/api/products');
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(products);
    expect(mockFindMany).toHaveBeenCalled();
  });

  it('should use the last returned product as the next cursor', async () => {
    const products = [
      { id: '1', name: 'A', currentStock: 10 },
      { id: '2', name: 'B', currentStock: 10 },
      { id: '3', name: 'C', currentStock: 10 },
    ];
    mockFindMany.mockResolvedValueOnce(products as never);

    const req = new Request('http://localhost:3000/api/products?limit=2');
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.map((p: { id: string }) => p.id)).toEqual(['1', '2']);
    expect(json.nextCursor).toBe('2');
  });

  it('should return 500 if database query fails', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('Database error'));

    const req = new Request('http://localhost:3000/api/products');
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
