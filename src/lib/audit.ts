import { db } from './db';

/**
 * Type-safe audit action constants.
 * Use these instead of raw strings to prevent typos and enable autocomplete.
 */
export const AUDIT_ACTIONS = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',

  // User management
  USER_CREATED: 'USER_CREATED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  RESET_MEMBER_PASSWORD: 'RESET_MEMBER_PASSWORD',
  ADD_MEMBER: 'ADD_MEMBER',
  REMOVE_MEMBER: 'REMOVE_MEMBER',
  CREATE_USER_MEMBER: 'CREATE_USER_MEMBER',
  UPDATE_MEMBER: 'UPDATE_MEMBER',

  // Products
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',

  // Sales
  SALE_CREATED: 'SALE_CREATED',
  SALE_CANCELLED: 'SALE_CANCELLED',
  SALE_REFUNDED: 'SALE_REFUNDED',
  CREATE_SALE: 'CREATE_SALE',

  // Stock
  STOCK_ADJUSTED: 'STOCK_ADJUSTED',
  STOCK_ENTRY_CREATED: 'STOCK_ENTRY_CREATED',

  // Purchases
  PURCHASE_CREATED: 'PURCHASE_CREATED',
  PURCHASE_UPDATED: 'PURCHASE_UPDATED',

  // Due / ledger
  DUE_CREATED: 'DUE_CREATED',
  DUE_COLLECTED: 'DUE_COLLECTED',

  // Settings / Business
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  BUSINESS_UPDATED: 'BUSINESS_UPDATED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

type CreateAuditLogParams = {
  businessId?: string;
  userId?: string;
  action: string; // string (not AuditAction) for backwards compatibility with existing callers
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export async function logAudit(params: CreateAuditLogParams) {
  try {
    await db.auditLog.create({
      data: {
        businessId: params.businessId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: (params.details as any) || undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
