import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockFindUnique = mock(() => Promise.resolve(null));
const mockFindMany = mock(() => Promise.resolve([]));
const mockCount = mock(() => Promise.resolve(0));
const mockCreate = mock(() => Promise.resolve({}));
const mockUpdate = mock(() => Promise.resolve({}));

mock.module('@/lib/env', () => ({ env: {} }));
mock.module('@/lib/db', () => ({
  db: {
    supplier: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

const mockLogAudit = mock(() => Promise.resolve());
mock.module('@/lib/audit', () => ({
  logAudit: mockLogAudit,
}));

mock.module('@/lib/api-middleware', () => ({
  requirePermission: mock(() => Promise.resolve(null)),
  getAuthenticatedUser: mock(() => Promise.resolve({ id: '1', role: 'ADMIN' })),
}));

const { GET, POST, PUT, DELETE } = await import('./route');

describe('Suppliers API', () => {
  beforeEach(() => {
    mockFindUnique.mockClear();
    mockFindMany.mockClear();
    mockCount.mockClear();
    mockCreate.mockClear();
    mockUpdate.mockClear();
    mockLogAudit.mockClear();
  });

  describe('GET /api/suppliers', () => {
    it('returns 404 if supplier not found by ID', async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      const req = new Request('http://localhost:3000/api/suppliers?id=nonexistent');
      const res = await GET(req as any);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns supplier with ledger details when ID is specified', async () => {
      const mockSupplier = {
        id: 'sup1',
        name: 'Supplier One',
        purchases: [
          {
            id: 'p1',
            totalAmount: 1000,
            invoiceNumber: 'INV1',
            notes: 'Test Purchase',
            createdAt: '2026-06-01T00:00:00Z',
          },
        ],
        expenses: [
          {
            id: 'e1',
            category: 'Supplies',
            amount: 400,
            notes: 'Expense Supplies',
            date: '2026-06-02T00:00:00Z',
          },
          {
            id: 'e2',
            category: 'Supplier Payment',
            amount: 500,
            notes: 'Payment',
            date: '2026-06-03T00:00:00Z',
          },
        ],
      };

      mockFindUnique.mockResolvedValueOnce(mockSupplier as any);
      const req = new Request('http://localhost:3000/api/suppliers?id=sup1');
      const res = await GET(req as any);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalPurchases).toBe(1400); // 1000 PO + 400 Supplies EXP
      expect(json.data.totalPaid).toBe(900); // 400 + 500
      expect(json.data.totalDue).toBe(500); // 1400 - 900
      expect(json.data.ledgerEntries.length).toBe(4);
    });

    it('returns a list of suppliers with search and pagination', async () => {
      const mockSuppliers = [
        {
          id: 'sup1',
          name: 'Supplier One',
          purchases: [{ totalAmount: 1000 }],
          expenses: [{ amount: 400, category: 'Supplies' }],
        },
      ];
      mockCount.mockResolvedValueOnce(1);
      mockFindMany.mockResolvedValueOnce(mockSuppliers as any);

      const req = new Request('http://localhost:3000/api/suppliers?search=one&page=1&pageSize=10');
      const res = await GET(req as any);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].totalPurchases).toBe(1400);
      expect(json.total).toBe(1);
    });

    it('returns 500 on database error during GET', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('DB error'));
      const req = new Request('http://localhost:3000/api/suppliers');
      const res = await GET(req as any);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('POST /api/suppliers', () => {
    it('creates a supplier successfully', async () => {
      const input = { name: 'New Supplier', phone: '01700000000', email: 'test@test.com' };
      mockCreate.mockResolvedValueOnce({ id: 'sup2', ...input, isActive: true });

      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('New Supplier');
      expect(mockLogAudit).toHaveBeenCalled();
    });

    it('returns 400 on invalid input schemas', async () => {
      const input = { email: 'invalid-email' };
      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error during POST', async () => {
      mockCreate.mockRejectedValueOnce(new Error('DB Error'));
      const input = { name: 'New Supplier', phone: '01700000000' };
      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const res = await POST(req as any);
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/suppliers', () => {
    it('updates a supplier successfully', async () => {
      const input = { id: 'sup1', name: 'Updated Supplier', phone: '01700000000' };
      mockUpdate.mockResolvedValueOnce({ id: 'sup1', name: 'Updated Supplier', phone: '01700000000' });

      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      const res = await PUT(req as any);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Updated Supplier');
      expect(mockLogAudit).toHaveBeenCalled();
    });

    it('returns 400 if ID is missing in PUT request', async () => {
      const input = { name: 'Updated Supplier' };
      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      const res = await PUT(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 on schema validation failure during PUT', async () => {
      const input = { id: 'sup1', email: 'invalid-email' };
      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      const res = await PUT(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error during PUT', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('DB Error'));
      const input = { id: 'sup1', name: 'Updated Supplier', phone: '01700000000' };
      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      const res = await PUT(req as any);
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/suppliers', () => {
    it('deactivates a supplier successfully', async () => {
      mockUpdate.mockResolvedValueOnce({ id: 'sup1', isActive: false });
      const req = new Request('http://localhost:3000/api/suppliers?id=sup1', {
        method: 'DELETE',
      });
      const res = await DELETE(req as any);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockLogAudit).toHaveBeenCalled();
    });

    it('returns 400 if ID is missing in DELETE request', async () => {
      const req = new Request('http://localhost:3000/api/suppliers', {
        method: 'DELETE',
      });
      const res = await DELETE(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error during DELETE', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('DB Error'));
      const req = new Request('http://localhost:3000/api/suppliers?id=sup1', {
        method: 'DELETE',
      });
      const res = await DELETE(req as any);
      expect(res.status).toBe(500);
    });
  });
});
