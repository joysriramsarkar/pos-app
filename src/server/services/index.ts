/**
 * Server Services — Domain Layer
 *
 * All business logic lives here. Route handlers call services,
 * NOT Prisma directly (except for simple reads).
 *
 * Service → Repository/Prisma pattern:
 *   HTTP Route → Auth → Validation → Service → Prisma
 */

export * from './sales.service';
export * from './inventory.service';
export * from './shift.service';
export * from './supplier.service';
export * from './product-import.service';
