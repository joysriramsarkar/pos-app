import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { requirePermission, getAuthenticatedUser } from "@/lib/api-middleware";
import { logAudit } from "@/lib/audit";
import { ExpenseInputSchema } from "@/schemas";

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

const parseExpenseDate = (date?: string) => {
  if (!date) return undefined;

  const convertBengaliToEnglishNumerals = (input: string) => {
    const map: Record<string, string> = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return input.replace(/[০-৯]/g, (m) => map[m] || m);
  };

  const normalized = convertBengaliToEnglishNumerals(date);
  const ddmm = normalized.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (ddmm) {
    return new Date(`${ddmm[3]}-${ddmm[2]}-${ddmm[1]}T00:00:00.000Z`);
  }

  const parsed = new Date(normalized);
  return !isNaN(parsed.getTime()) ? parsed : undefined;
};

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "expenses.view");
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const includeInactive = searchParams.get("includeInactive") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (dateFrom || dateTo) {
      const toDate = dateTo ? new Date(dateTo) : undefined;
      if (toDate && !dateTo?.includes('T')) toDate.setHours(23, 59, 59, 999);
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        include: { supplier: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = expenses.map(e => ({
      ...e,
      supplierName: e.supplier?.name ?? e.supplierName ?? null,
    }));

    return NextResponse.json({ success: true, data, total, page, pageSize });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "expenses.create");
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = ExpenseInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { amount, category, notes, date, supplierId, supplierName } = parsed.data;
    const parsedDate = parseExpenseDate(date) ?? new Date();

    const expense = await prisma.expense.create({
      data: { amount, category, notes, date: parsedDate, supplierId: supplierId ?? null, supplierName: supplierName ?? null },
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: user?.id, action: 'CREATE_EXPENSE', entityType: 'Expense', entityId: expense.id, details: { amount: expense.amount, category: expense.category, notes: expense.notes ?? undefined }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, data: expense });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: "Failed to create expense" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = await requirePermission(request, "expenses.edit");
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Expense ID is required" }, { status: 400 });
    }

    const parsed = ExpenseInputSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      amount: parsed.data.amount,
      category: parsed.data.category,
      notes: parsed.data.notes ?? null,
      supplierId: parsed.data.category === 'Supplies' ? parsed.data.supplierId ?? null : null,
      supplierName: parsed.data.category === 'Supplies' ? parsed.data.supplierName ?? null : null,
    };

    const parsedDate = parseExpenseDate(parsed.data.date);
    if (parsedDate) {
      updateData.date = parsedDate;
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: user?.id, action: 'UPDATE_EXPENSE', entityType: 'Expense', entityId: expense.id, details: { amount: expense.amount, category: expense.category, notes: expense.notes ?? undefined }, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, data: expense });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update expense";
    console.error("Error updating expense:", error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requirePermission(request, "expenses.delete");
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
    }

    await prisma.expense.update({ where: { id }, data: { isActive: false } });

    const user = await getAuthenticatedUser(request);
    await logAudit({ userId: user?.id, action: 'DELETE_EXPENSE', entityType: 'Expense', entityId: id, ipAddress: getIp(request) });

    return NextResponse.json({ success: true, message: "Expense deleted" });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: "Failed to delete expense" }, { status: 500 });
  }
}
