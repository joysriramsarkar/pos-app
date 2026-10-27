export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext } from "@/lib/tenant";
import { parseComamCommand, type ComamDraft } from "@/lib/comam/comam-engine";
import { formatBnNumber, formatBnTaka } from "@/lib/comam/bn-parser";
import type { Product, Customer } from "@/types/pos";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const businessId = ctx.business.id;

  try {
    let body: { command?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const command = (body.command || "").trim();
    if (!command) {
      return NextResponse.json({ error: "Command cannot be empty" }, { status: 400 });
    }

    // 1. Fetch products & customers for the current business
    const [dbProducts, dbCustomers] = await Promise.all([
      db.product.findMany({
        where: { businessId, isActive: true },
        select: {
          id: true,
          barcode: true,
          name: true,
          nameBn: true,
          category: true,
          subCategory: true,
          buyingPrice: true,
          sellingPrice: true,
          unit: true,
          currentStock: true,
          minStockLevel: true,
          isActive: true,
          imageUrl: true,
          attributes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.customer.findMany({
        where: { businessId, isActive: true },
        select: {
          id: true,
          name: true,
          nameEn: true,
          phone: true,
          address: true,
          totalDue: true,
          totalPaid: true,
          prepaidBalance: true,
          notes: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const products: Product[] = dbProducts.map((p) => ({
      ...p,
      nameBn: p.nameBn ?? undefined,
      subCategory: p.subCategory ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
      buyingPrice: Number(p.buyingPrice),
      sellingPrice: Number(p.sellingPrice),
      currentStock: Number(p.currentStock),
      minStockLevel: Number(p.minStockLevel),
      attributes: (p.attributes as Record<string, string>) ?? null,
    }));

    const customers: Customer[] = dbCustomers.map((c) => ({
      ...c,
      phone: c.phone ?? undefined,
      address: c.address ?? undefined,
      nameEn: c.nameEn ?? undefined,
      notes: c.notes ?? undefined,
      totalDue: Number(c.totalDue),
      totalPaid: Number(c.totalPaid),
      prepaidBalance: Number(c.prepaidBalance),
    }));

    // 2. Parse command using Comam engine
    const draft: ComamDraft = parseComamCommand(command, products, customers);

    // 3. Handle live dynamic server-side reports or queries
    if (draft.kind === "report") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

      if (draft.report === "sales_summary") {
        const todaySales = await db.sale.findMany({
          where: {
            businessId,
            createdAt: { gte: todayStart },
            status: "COMPLETED",
          },
          select: {
            totalAmount: true,
          },
        });

        const totalAmount = todaySales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
        const count = todaySales.length;

        const answerBn = `আজ মোট ${formatBnTaka(totalAmount)} বিক্রি হয়েছে (${formatBnNumber(
          count
        )}টি বিল)।`;

        return NextResponse.json({
          kind: "report",
          report: draft.report,
          answerBn,
          data: {
            salesCount: count,
            totalSales: totalAmount,
          },
          draft,
        });
      }

      if (draft.report === "low_stock") {
        const lowStockProducts = products.filter((p) => p.currentStock <= p.minStockLevel);
        const answerBn =
          lowStockProducts.length === 0
            ? "সব পণ্যের স্টক ঠিকঠাক আছে, ঘাটতি নেই।"
            : `শেষ হয়ে আসছে: ${lowStockProducts
                .slice(0, 5)
                .map((p) => `${p.nameBn || p.name} (${formatBnNumber(p.currentStock)} ${p.unit})`)
                .join(", ")}।`;

        return NextResponse.json({
          kind: "report",
          report: draft.report,
          answerBn,
          data: {
            lowStock: lowStockProducts.slice(0, 10),
          },
          draft,
        });
      }

      if (draft.report === "top_products") {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const topItems = await db.saleItem.groupBy({
          by: ["productId"],
          where: {
            sale: {
              businessId,
              createdAt: { gte: sevenDaysAgo },
              status: "COMPLETED",
            },
          },
          _sum: {
            quantity: true,
            totalPrice: true,
          },
          orderBy: {
            _sum: {
              totalPrice: "desc",
            },
          },
          take: 5,
        });

        const topWithNames = topItems.map((item) => {
          const prod = products.find((p) => p.id === item.productId);
          return {
            name: prod?.nameBn || prod?.name || "পণ্য",
            amount: Number(item._sum?.totalPrice || 0),
            qty: Number(item._sum?.quantity || 0),
          };
        });

        const answerBn =
          topWithNames.length === 0
            ? "গত ৭ দিনে বিক্রির কোনো ডেটা পাওয়া যায়নি।"
            : `গত ৭ দিনে বেশি বিক্রি: ${topWithNames
                .map((t) => `${t.name} (${formatBnTaka(t.amount)})`)
                .join(", ")}।`;

        return NextResponse.json({
          kind: "report",
          report: draft.report,
          answerBn,
          data: { topProducts: topWithNames },
          draft,
        });
      }
    }

    if (draft.kind === "due_query") {
      if (draft.customer) {
        const answerBn = `${draft.customer.name}-এর বাকি ${formatBnTaka(draft.customer.totalDue)}।`;
        return NextResponse.json({
          kind: "due_query",
          answerBn,
          customer: draft.customer,
          due: draft.customer.totalDue,
          draft,
        });
      }

      const topDues = customers
        .filter((c) => c.totalDue > 0)
        .sort((a, b) => b.totalDue - a.totalDue)
        .slice(0, 5);

      const totalOutstanding = customers.reduce((acc, c) => acc + c.totalDue, 0);

      const answerBn =
        topDues.length === 0
          ? "কারো কোনো বাকি নেই।"
          : `মোট বাকি ${formatBnTaka(totalOutstanding)}। প্রধান বাকি: ${topDues
              .map((c) => `${c.name} ${formatBnTaka(c.totalDue)}`)
              .join(", ")}।`;

      return NextResponse.json({
        kind: "due_query",
        answerBn,
        totalOutstanding,
        topDues,
        draft,
      });
    }

    // Default: sale draft, due_payment, undo, or unknown
    return NextResponse.json({
      kind: draft.kind,
      draft,
      summaryBn: draft.summaryBn,
      needsClarification: draft.needsClarification,
    });
  } catch (err: unknown) {
    console.error("[comam] command processing error:", err);
    return NextResponse.json(
      { error: "Failed to process command. Please try again." },
      { status: 500 }
    );
  }
}
