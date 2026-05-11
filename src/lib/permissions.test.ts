import { describe, it, expect } from 'bun:test';
import { getUserRole, roleHasPermission } from './permissions-helpers';
import { Session } from 'next-auth';

describe('getUserRole', () => {
  it('should return null when session is null', () => {
    expect(getUserRole(null)).toBeNull();
  });

  it('should return null when session is empty', () => {
    expect(getUserRole({} as Session)).toBeNull();
  });

  it('should return null when session user is missing', () => {
    expect(getUserRole({ user: undefined } as unknown as Session)).toBeNull();
  });

  it('should return null when session user has no role', () => {
    expect(getUserRole({ user: { name: 'Test' } } as unknown as Session)).toBeNull();
  });

  it('should return ADMIN for admin session', () => {
    const session = { user: { role: 'ADMIN' } } as unknown as Session;
    expect(getUserRole(session)).toBe('ADMIN');
  });

  it('should return MANAGER for manager session', () => {
    const session = { user: { role: 'MANAGER' } } as unknown as Session;
    expect(getUserRole(session)).toBe('MANAGER');
  });

  it('should return CASHIER for cashier session', () => {
    const session = { user: { role: 'CASHIER' } } as unknown as Session;
    expect(getUserRole(session)).toBe('CASHIER');
  });

  it('should return VIEWER for viewer session', () => {
    const session = { user: { role: 'VIEWER' } } as unknown as Session;
    expect(getUserRole(session)).toBe('VIEWER');
  });
});

describe('roleHasPermission', () => {
  it('should return true if ADMIN has users.create', () => {
    expect(roleHasPermission('ADMIN', 'users.create')).toBe(true);
  });

  it('should return false if CASHIER has users.create', () => {
    expect(roleHasPermission('CASHIER', 'users.create')).toBe(false);
  });

  it('should return true if MANAGER has products.edit', () => {
    expect(roleHasPermission('MANAGER', 'products.edit')).toBe(true);
  });

  it('should return true if VIEWER has reports.view', () => {
    expect(roleHasPermission('VIEWER', 'reports.view')).toBe(true);
  });

  it('should return false if VIEWER has users.view', () => {
    expect(roleHasPermission('VIEWER', 'users.view')).toBe(false);
  });

  it('should return false for unknown roles', () => {
    // @ts-expect-error Testing invalid runtime input
    expect(roleHasPermission('UNKNOWN_ROLE', 'users.view')).toBe(false);
  });

  it('should return false for unknown permissions', () => {
    expect(roleHasPermission('ADMIN', 'unknown.permission')).toBe(false);
  });

  it('should return false if role is null', () => {
    // @ts-expect-error Testing invalid runtime input
    expect(roleHasPermission(null, 'users.view')).toBe(false);
  });

  it('should return false if role is undefined', () => {
    // @ts-expect-error Testing invalid runtime input
    expect(roleHasPermission(undefined, 'users.view')).toBe(false);
  });

  it('should return false if permission is null', () => {
    // @ts-expect-error Testing invalid runtime input
    expect(roleHasPermission('ADMIN', null)).toBe(false);
  });

  it('should return false if permission is undefined', () => {
    // @ts-expect-error Testing invalid runtime input
    expect(roleHasPermission('ADMIN', undefined)).toBe(false);
  });
});
