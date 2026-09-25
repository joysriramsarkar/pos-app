export const revalidate = 30;

// ============================================================================
// Products API Route - Multi-Tenant POS
// ALL queries scoped to authenticated user's business (requireBusinessContext)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ProductInputSchema } from '@/schemas';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { requireAuth } from '@/lib/api-middleware';

const MAX_PRODUCT_LIMIT = 10000;

const getIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  undefined;

// GET /api/products - Fetch all products (tenant-scoped)
export async function GET(request: NextRequest) {
  try {
    // 1. Verify CSRF + session
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    // 2. Resolve business context (server-side trusted)
    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    // 3. Check permission
    const denied = checkPermission(ctx, 'products.view');
    if (denied) return denied;

    const businessId = ctx.business.id;

    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const cursor = searchParams.get('cursor');
    const limitParam = searchParams.get('limit');

    const parsedLimit = limitParam ? parseInt(limitParam, 10) : undefined;
    const limit =
      typeof parsedLimit === 'number' && Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), MAX_PRODUCT_LIMIT)
        : undefined;

    // CRITICAL: Always filter by businessId — tenant isolation
    const where: Record<string, unknown> = { businessId };

    if (!includeInactive) where.isActive = true;
    if (barcode) where.barcode = barcode;
    if (category) where.category = category;

    if (search) {
      const engSearch = search.replace(/[০-৯]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 2534 + 48),
      );
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameBn: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: engSearch, mode: 'insensitive' } },
      ];
    }

    const findManyArgs: any = {
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    };

    if (limit) findManyArgs.take = limit + 1;

    if (cursor) {
      findManyArgs.cursor = { id: cursor };
      findManyArgs.skip = 1;
    }

    const products = await db.product.findMany(findManyArgs);

    let nextCursor: string | undefined = undefined;
    if (limit && products.length > limit) {
      products.pop();
      nextCursor = products[products.length - 1]?.id;
    }

    return NextResponse.json({ success: true, data: products, nextCursor });
  } catch (error: unknown) {
    console.error('Error fetching products:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products', details },
      { status: 500 },
    );
  }
}

// POST /api/products - Create new product (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    const denied = checkPermission(ctx, 'products.create');
    if (denied) return denied;

    const businessId = ctx.business.id;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = ProductInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 },
      );
    }

    const validatedData = result.data;
    const categoryName = String(validatedData.category).trim();

    const product = await db.product.create({
      data: {
        businessId, // CRITICAL: tenant scope
        barcode: validatedData.barcode ? String(validatedData.barcode).trim() : null,
        name: String(validatedData.name).trim(),
        nameBn: validatedData.nameBn ? String(validatedData.nameBn).trim() : null,
        category: categoryName,
        subCategory: validatedData.subCategory
          ? String(validatedData.subCategory).trim()
          : null,
        buyingPrice: validatedData.buyingPrice,
        sellingPrice: validatedData.sellingPrice,
        unit: validatedData.unit,
        currentStock: validatedData.currentStock,
        minStockLevel: validatedData.minStockLevel,
        isActive: validatedData.isActive,
      },
    });

    // Upsert category in business scope
    await db.category.upsert({
      where: { businessId_name: { businessId, name: categoryName } },
      create: { businessId, name: categoryName },
      update: {},
    });

    await logAudit({
      userId: ctx.user.id,
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      details: { name: product.name, category: product.category, barcode: product.barcode, businessId },
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: product,
      message: 'Product created successfully',
    });
  } catch (error: unknown) {
    console.error('Error creating product:', error);
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return NextResponse.json(
        { success: false, error: 'Barcode already exists for another product in this business' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 },
    );
  }
}

// PUT /api/products - Update product (tenant-scoped, IDOR protection)
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    const denied = checkPermission(ctx, 'products.update');
    if (denied) return denied;

    const businessId = ctx.business.id;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    if (!(body as any)?.id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 },
      );
    }

    const result = ProductInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 },
      );
    }

    const { id: _id, ...validatedData } = result.data;
    const productId = (body as any).id as string;
    const categoryName =
      validatedData.category !== undefined ? String(validatedData.category).trim() : undefined;

    // IDOR protection: update only if product belongs to this business
    const product = await db.product.update({
      where: { id: productId, businessId }, // businessId ensures IDOR protection
      data: {
        barcode:
          validatedData.barcode !== undefined
            ? validatedData.barcode
              ? String(validatedData.barcode).trim()
              : null
            : undefined,
        name:
          validatedData.name !== undefined ? String(validatedData.name).trim() : undefined,
        nameBn:
          validatedData.nameBn !== undefined
            ? validatedData.nameBn
              ? String(validatedData.nameBn).trim()
              : null
            : undefined,
        category: categoryName,
        subCategory:
          validatedData.subCategory !== undefined
            ? validatedData.subCategory
              ? String(validatedData.subCategory).trim()
              : null
            : undefined,
        buyingPrice: validatedData.buyingPrice,
        sellingPrice: validatedData.sellingPrice,
        unit: validatedData.unit,
        currentStock: validatedData.currentStock,
        minStockLevel: validatedData.minStockLevel,
        isActive: validatedData.isActive,
        updatedAt: new Date(),
      },
    });

    if (categoryName) {
      await db.category.upsert({
        where: { businessId_name: { businessId, name: categoryName } },
        create: { businessId, name: categoryName },
        update: {},
      });
    }

    await logAudit({
      userId: ctx.user.id,
      action: 'UPDATE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      details: { name: product.name, changes: validatedData, businessId },
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: product,
      message: 'Product updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating product:', error);
    // If product not found in this business, return 404 (not 403) to avoid info leak
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 },
    );
  }
}

// DELETE /api/products - Soft delete product (tenant-scoped, IDOR protection)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    const denied = checkPermission(ctx, 'products.delete');
    if (denied) return denied;

    const businessId = ctx.business.id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 },
      );
    }

    // IDOR protection: update only if product belongs to this business
    await db.product.update({
      where: { id, businessId }, // businessId ensures IDOR protection
      data: { isActive: false, updatedAt: new Date() },
    });

    await logAudit({
      userId: ctx.user.id,
      action: 'DELETE_PRODUCT',
      entityType: 'Product',
      entityId: id,
      details: { businessId },
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true, message: 'Product deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting product:', error);
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to delete product' },
      { status: 500 },
    );
  }
}
