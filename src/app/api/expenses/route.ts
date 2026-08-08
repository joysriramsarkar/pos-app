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
    const tzOffset = parseInt(searchParams.get("tzOffset") ?? "0", 10);

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (dateFrom || dateTo) {
      let gteDate: Date | undefined;
      let lteDate: Date | undefined;

      if (dateFrom) {
        const parts = dateFrom.split('T')[0].split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        gteDate = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) + tzOffset * 60 * 1000);
      }

      if (dateTo) {
        const parts = dateTo.split('T')[0].split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        lteDate = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) + tzOffset * 60 * 1000);
      }

      where.date = {
        ...(gteDate ? { gte: gteDate } : {}),
        ...(lteDate ? { lte: lteDate } : {}),
      };
    }

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        include: { supplier: { select: { id: true, name: true, nameEn: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = expenses.map(e => ({
      ...e,
      supplierName: e.supplier?.name ?? e.supplierName ?? null,
      supplierNameEn: e.supplier?.nameEn ?? null,
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

    const { id, amount, category, notes, paymentMethod, date, supplierId, supplierName } = parsed.data;
    const parsedDate = parseExpenseDate(date) ?? new Date();

    let expense;
    if (id) {
      expense = await prisma.expense.upsert({
        where: { id },
        update: {}, // Idempotency: return existing if it exists
        create: {
          id,
          amount,
          category,
          notes,
          paymentMethod: paymentMethod || 'Cash',
          date: parsedDate,
          supplierId: supplierId ?? null,
          supplierName: supplierName ?? null,
        },
      });
    } else {
      expense = await prisma.expense.create({
        data: {
          amount,
          category,
          notes,
          paymentMethod: paymentMethod || 'Cash',
          date: parsedDate,
          supplierId: supplierId ?? null,
          supplierName: supplierName ?? null,
        },
      });
    }

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
      paymentMethod: parsed.data.paymentMethod || 'Cash',
      supplierId: parsed.data.category === 'Supplier Payment' ? parsed.data.supplierId ?? null : null,
      supplierName: parsed.data.category === 'Supplier Payment' ? parsed.data.supplierName ?? null : null,
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
