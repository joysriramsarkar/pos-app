import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock next-auth/react BEFORE importing the module under test
const mockUseSession = vi.fn(() => ({ data: null as any }));

vi.mock('next-auth/react', () => ({
  useSession: mockUseSession,
}));

// Mock the permissions library to avoid database dependencies in tests
vi.mock('@/lib/permissions-helpers', () => ({
  roleHasPermission: (role: string, permissionCode: string) => {
    if (role === 'ADMIN') return true;
    if (role === 'MANAGER' && permissionCode === 'reports.view') return true;
    if (role === 'CASHIER' && permissionCode === 'sales.create') return true;
    return false;
  }
}));

// Import the module after setting up mocks
const {
  usePermission,
  useAllPermissions,
  useAnyPermission,
  useUserRole,
  useIsAdmin,
  useIsManagerOrHigher,
  PermissionGuard,
  AllPermissionsGuard,
  AnyPermissionGuard,
  RoleGuard
} = await import('./use-permissions');

describe('use-permissions hook tests', () => {
  beforeEach(() => {
    mockUseSession.mockClear();
  });

  describe('usePermission', () => {
    it('should return false when session is null', () => {
      mockUseSession.mockReturnValue({ data: null });
      expect(usePermission('any.permission')).toBe(false);
    });

    it('should return false when user has no role', () => {
      mockUseSession.mockReturnValue({ data: { user: { id: '1' } } });
      expect(usePermission('any.permission')).toBe(false);
    });

    it('should return true when role has permission', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
      expect(usePermission('users.create')).toBe(true);
    });

    it('should return false when role lacks permission', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      expect(usePermission('users.create')).toBe(false);
    });
  });

  describe('useAllPermissions', () => {
    it('should return false when session is null', () => {
      mockUseSession.mockReturnValue({ data: null });
      expect(useAllPermissions(['p1', 'p2'])).toBe(false);
    });

    it('should return true when role has all permissions', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
      expect(useAllPermissions(['users.create', 'reports.view'])).toBe(true);
    });

    it('should return false when role lacks some permissions', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      expect(useAllPermissions(['sales.create', 'reports.view'])).toBe(false);
    });
  });

  describe('useAnyPermission', () => {
    it('should return false when session is null', () => {
      mockUseSession.mockReturnValue({ data: null });
      expect(useAnyPermission(['p1', 'p2'])).toBe(false);
    });

    it('should return true when role has at least one permission', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      expect(useAnyPermission(['reports.view', 'users.create'])).toBe(true);
    });

    it('should return false when role has none of the permissions', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      expect(useAnyPermission(['reports.view', 'users.create'])).toBe(false);
    });
  });

  describe('useUserRole', () => {
    it('should return null when session is null', () => {
      mockUseSession.mockReturnValue({ data: null });
      expect(useUserRole()).toBe(null);
    });

    it('should return the role when it exists', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      expect(useUserRole()).toBe('MANAGER');
    });
  });

  describe('useIsAdmin', () => {
    it('should return true for ADMIN', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
      expect(useIsAdmin()).toBe(true);
    });

    it('should return false for MANAGER', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      expect(useIsAdmin()).toBe(false);
    });
  });

  describe('useIsManagerOrHigher', () => {
    it('should return true for ADMIN', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
      expect(useIsManagerOrHigher()).toBe(true);
    });

    it('should return true for MANAGER', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      expect(useIsManagerOrHigher()).toBe(true);
    });

    it('should return false for CASHIER', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      expect(useIsManagerOrHigher()).toBe(false);
    });
  });
});

describe('Guard Components', () => {
  beforeEach(() => {
    mockUseSession.mockClear();
  });

  describe('PermissionGuard', () => {
    it('should render children when permission is granted', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
      const result = PermissionGuard({ permission: 'users.create', children: 'Child Content' });
      expect(result).toBe('Child Content');
    });

    it('should render fallback when permission is denied', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      const result = PermissionGuard({ permission: 'users.create', children: 'Child Content', fallback: 'Fallback Content' });
      expect(result).toBe('Fallback Content');
    });

    it('should return null when permission is denied and no fallback provided', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      const result = PermissionGuard({ permission: 'users.create', children: 'Child Content' });
      expect(result).toBe(null);
    });
  });

  describe('AllPermissionsGuard', () => {
    it('should render children when all permissions granted', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'ADMIN' } } });
      const result = AllPermissionsGuard({ permissions: ['p1', 'p2'], children: 'Child Content' });
      expect(result).toBe('Child Content');
    });

    it('should render fallback when some permissions denied', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      // MANAGER has reports.view but not users.create
      const result = AllPermissionsGuard({
        permissions: ['reports.view', 'users.create'],
        children: 'Child Content',
        fallback: 'Fallback Content'
      });
      expect(result).toBe('Fallback Content');
    });
  });

  describe('AnyPermissionGuard', () => {
    it('should render children when at least one permission granted', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      // MANAGER has reports.view
      const result = AnyPermissionGuard({
        permissions: ['reports.view', 'users.create'],
        children: 'Child Content'
      });
      expect(result).toBe('Child Content');
    });

    it('should render fallback when no permissions granted', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      // CASHIER lacks both
      const result = AnyPermissionGuard({
        permissions: ['reports.view', 'users.create'],
        children: 'Child Content',
        fallback: 'Fallback Content'
      });
      expect(result).toBe('Fallback Content');
    });
  });

  describe('RoleGuard', () => {
    it('should render children when role matches', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'MANAGER' } } });
      const result = RoleGuard({
        roles: ['MANAGER', 'ADMIN'],
        children: 'Child Content'
      });
      expect(result).toBe('Child Content');
    });

    it('should render fallback when role does not match', () => {
      mockUseSession.mockReturnValue({ data: { user: { role: 'CASHIER' } } });
      const result = RoleGuard({
        roles: ['MANAGER', 'ADMIN'],
        children: 'Child Content',
        fallback: 'Fallback Content'
      });
      expect(result).toBe('Fallback Content');
    });
  });
});
