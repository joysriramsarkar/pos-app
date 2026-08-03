export const revalidate = 30;

// ============================================================================
// Products API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ProductInputSchema } from '@/schemas';
import { withAuthMiddleware, type RouteContext } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';

const MAX_PRODUCT_LIMIT = 10000;

const getIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  undefined;

// GET /api/products - Fetch all products
export const GET = withAuthMiddleware(handleGet, { permissionCode: 'products.view' });

async function handleGet(request: NextRequest, _ctx: RouteContext) {
  try {
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

    const where: Record<string, unknown> = {};

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
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 },
    );
  }
}

// POST /api/products - Create new product
export const POST = withAuthMiddleware(handlePost, { permissionCode: 'products.create' });

async function handlePost(request: NextRequest, ctx: RouteContext) {
  try {
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

    const { ensureCategoryExists } = await import('@/lib/ensure-category');
    await ensureCategoryExists(categoryName);

    await logAudit({
      userId: ctx.auth?.user?.id,
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      details: { name: product.name, category: product.category, barcode: product.barcode },
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
        { success: false, error: 'Barcode already exists for another product' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 },
    );
  }
}

// PUT /api/products - Update product
export const PUT = withAuthMiddleware(handlePut, { permissionCode: 'products.edit' });

async function handlePut(request: NextRequest, ctx: RouteContext) {
  try {
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

    const product = await db.product.update({
      where: { id: productId },
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
      const { ensureCategoryExists } = await import('@/lib/ensure-category');
      await ensureCategoryExists(categoryName);
    }

    await logAudit({
      userId: ctx.auth?.user?.id,
      action: 'UPDATE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      details: { name: product.name, changes: validatedData },
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
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 },
    );
  }
}

// DELETE /api/products - Soft delete product
export const DELETE = withAuthMiddleware(handleDelete, { permissionCode: 'products.delete' });

async function handleDelete(request: NextRequest, ctx: RouteContext) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 },
      );
    }

    await db.product.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
    });

    await logAudit({
      userId: ctx.auth?.user?.id,
      action: 'DELETE_PRODUCT',
      entityType: 'Product',
      entityId: id,
      ipAddress: getIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true, message: 'Product deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete product' },
      { status: 500 },
    );
  }
}
