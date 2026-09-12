export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext, checkPermission } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "reports.view");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const customersWithDues = await prisma.customer.findMany({
      where: {
        businessId,
        totalDue: {
          gt: 0,
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        totalDue: true,
        totalPaid: true,
        updatedAt: true,
        _count: {
          select: { sales: true },
        },
      },
      orderBy: {
        totalDue: "desc",
      },
      take: 50,
    });

    const totalOutstandingDue = customersWithDues.reduce(
      (sum, customer) => sum + Number(customer.totalDue),
      0,
    );

    return NextResponse.json({
      customersWithDues,
      totalOutstandingDue,
      count: customersWithDues.length,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch due report:", error);
    return NextResponse.json(
      { error: "Failed to fetch due report", details: (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    );
  }
}
