export const revalidate = 30;

// ============================================================================
// Products API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Product } from '@/types/pos';
import { ProductInputSchema } from '@/schemas';
import { requirePermission } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const MAX_PRODUCT_LIMIT = 10000;

// GET /api/products - Fetch all products
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'products.view');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const cursor = searchParams.get('cursor');
    const limitParam = searchParams.get('limit');

    const parsedLimit = limitParam ? parseInt(limitParam, 10) : undefined;
    const limit = typeof parsedLimit === 'number' && Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_PRODUCT_LIMIT)
      : undefined;

    // Build where clause
    const where: Record<string, unknown> = {};
    
    if (!includeInactive) {
      where.isActive = true;
    }
    
    if (barcode) {
      where.barcode = barcode;
    }
    
    if (category) {
      where.category = category;
    }
    
    if (search) {
      const engSearch = search.replace(/[০-৯]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 2534 + 48));
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

    if (limit) {
      findManyArgs.take = limit + 1; // Fetch one extra to check if there are more
    }

    if (cursor) {
      findManyArgs.cursor = { id: cursor };
      // Note: when using cursor pagination, typically you skip the cursor itself,
      // but if the client sends the last ID they saw, we should skip it.
      findManyArgs.skip = 1;
    }

    const products = await db.product.findMany(findManyArgs);

    let nextCursor: string | undefined = undefined;
    if (limit && products.length > limit) {
      products.pop();
      nextCursor = products[products.length - 1]?.id;
    }

    return NextResponse.json({
      success: true,
      data: products,
      nextCursor,
    });
  } catch (error: unknown) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

// POST /api/products - Create new product
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'products.create');
  if (authError) return authError;

  try {
    const body = await request.json();

    // Validate with Zod
    const result = ProductInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors)
        .flat()
        .join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 }
      );
    }
    
    const validatedData = result.data;

    const product = await db.product.create({
      data: {
        barcode: validatedData.barcode ? String(validatedData.barcode).trim() : null,
        name: String(validatedData.name).trim(),
        nameBn: validatedData.nameBn ? String(validatedData.nameBn).trim() : null,
        category: String(validatedData.category).trim(),
        subCategory: validatedData.subCategory ? String(validatedData.subCategory).trim() : null,
        buyingPrice: validatedData.buyingPrice,
        sellingPrice: validatedData.sellingPrice,
        unit: validatedData.unit,
        currentStock: validatedData.currentStock,
        minStockLevel: validatedData.minStockLevel,
        isActive: validatedData.isActive,
      },
    });

    const session = await getServerSession(authOptions);
    await logAudit({
      userId: session?.user?.id,
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      details: { name: product.name, category: product.category, barcode: product.barcode },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: product,
      message: 'Product created successfully',
    });
  } catch (error: unknown) {
    console.error('Error creating product:', error);
    
    // Handle specific Prisma errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint failed')) {
        return NextResponse.json(
          { success: false, error: 'Barcode already exists for another product' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Failed to create product' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 }
    );
  }
}

// PUT /api/products - Update product
export async function PUT(request: NextRequest) {
  const authError = await requirePermission(request, 'products.edit');
  if (authError) return authError;

  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    const result = ProductInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors)
        .flat()
        .join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 }
      );
    }

    const { id, ...validatedData } = result.data;

    const product = await db.product.update({
      where: { id: body.id },
      data: {
        barcode: validatedData.barcode !== undefined ? (validatedData.barcode ? String(validatedData.barcode).trim() : null) : undefined,
        name: validatedData.name !== undefined ? String(validatedData.name).trim() : undefined,
        nameBn: validatedData.nameBn !== undefined ? (validatedData.nameBn ? String(validatedData.nameBn).trim() : null) : undefined,
        category: validatedData.category !== undefined ? String(validatedData.category).trim() : undefined,
        subCategory: validatedData.subCategory !== undefined ? (validatedData.subCategory ? String(validatedData.subCategory).trim() : null) : undefined,
        buyingPrice: validatedData.buyingPrice,
        sellingPrice: validatedData.sellingPrice,
        unit: validatedData.unit,
        currentStock: validatedData.currentStock,
        minStockLevel: validatedData.minStockLevel,
        isActive: validatedData.isActive,
        updatedAt: new Date(),
      },
    });

    const session = await getServerSession(authOptions);
    await logAudit({
      userId: session?.user?.id,
      action: 'UPDATE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      details: { name: product.name, changes: validatedData },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
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
      { status: 500 }
    );
  }
}

// DELETE /api/products - Soft delete product
export async function DELETE(request: NextRequest) {
  const authError = await requirePermission(request, 'products.delete');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Soft delete by setting isActive to false
    const product = await db.product.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
    });

    const session = await getServerSession(authOptions);
    await logAudit({
      userId: session?.user?.id,
      action: 'DELETE_PRODUCT',
      entityType: 'Product',
      entityId: id,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
