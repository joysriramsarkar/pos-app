import type { UserRole } from '@/lib/permissions';

export const SESSION_USER_STORAGE_KEY = 'pos-app-session-user';

export interface StoredSessionUser {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  role?: UserRole;
  requiresPasswordChange?: boolean;
}

export function readStoredSessionUser(): StoredSessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const item = window.localStorage.getItem(SESSION_USER_STORAGE_KEY);
    if (!item) return null;
    return JSON.parse(item) as StoredSessionUser;
  } catch (error) {
    console.warn('Failed to read stored session user:', error);
    return null;
  }
}

export function writeStoredSessionUser(user: StoredSessionUser | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (!user || Object.keys(user).length === 0) {
      window.localStorage.removeItem(SESSION_USER_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SESSION_USER_STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.warn('Failed to write stored session user:', error);
  }
}
