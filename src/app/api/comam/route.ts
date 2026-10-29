export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext } from "@/lib/tenant";
import { parseComamCommand, type ComamDraft } from "@/lib/comam/comam-engine";
import { understandWithMetaSpark } from "@/lib/comam/comam-ai";
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

    // 2. Parse with deterministic engine first. For reports, due queries,
    // due payments and sales with catalog items, the deterministic engine sees
    // the full catalog and customer list without network latency or hallucinations.
    const localDraft = parseComamCommand(command, products, customers);
    let draft: ComamDraft | null = null;
    if (
      localDraft.kind === 'report' ||
      localDraft.kind === 'due_query' ||
      localDraft.kind === 'due_payment' ||
      localDraft.kind === 'undo' ||
      (localDraft.kind === 'sale' && localDraft.items.length > 0)
    ) {
      draft = localDraft;
    } else {
      draft = await understandWithMetaSpark(command, products, customers);
      if (
        !draft ||
        (localDraft.kind === 'sale' &&
          (draft.kind !== 'sale' || localDraft.items.length > draft.items.length))
      ) {
        draft = localDraft;
      }
    }

    // 3. Handle live dynamic server-side reports or queries
    if (draft.kind === "report") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

      // 3.1 Product Specific Sales Report (e.g. "আমুল শক্তি কয়টা বিক্রি হয়েছে?")
      if (draft.report === "product_sales" && draft.targetProduct) {
        const prod = draft.targetProduct;
        let periodStart = todayStart;
        let periodLabel = "আজ";

        if (draft.period === "week") {
          periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          periodLabel = "এই সপ্তাহে";
        } else if (draft.period === "month") {
          periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          periodLabel = "এই মাসে";
        }

        const saleItems = await db.saleItem.findMany({
          where: {
            productId: prod.id,
            sale: {
              businessId,
              createdAt: { gte: periodStart },
              status: "COMPLETED",
            },
          },
          select: {
            quantity: true,
            totalPrice: true,
          },
        });

        const totalQty = saleItems.reduce((acc, it) => acc + Number(it.quantity), 0);
        const totalAmount = saleItems.reduce((acc, it) => acc + Number(it.totalPrice), 0);
        const prodTitle = prod.nameBn || prod.name;

        let answerBn = "";
        if (totalQty > 0) {
          answerBn = `${periodLabel} "${prodTitle}" মোট ${formatBnNumber(totalQty)} ${prod.unit} বিক্রি হয়েছে (মোট ${formatBnTaka(totalAmount)})। বর্তমান স্টক: ${formatBnNumber(prod.currentStock)} ${prod.unit}।`;
        } else {
          answerBn = `${periodLabel} "${prodTitle}" কোনো বিক্রি হয়নি। বর্তমান স্টক: ${formatBnNumber(prod.currentStock)} ${prod.unit}।`;
        }

        return NextResponse.json({
          kind: "report",
          report: draft.report,
          answerBn,
          data: {
            productId: prod.id,
            productName: prodTitle,
            totalQuantity: totalQty,
            totalAmount,
            currentStock: prod.currentStock,
          },
          draft,
        });
      }

      // 3.2 Sales & Profit Summary
      if (draft.report === "sales_summary") {
        const todaySales = await db.sale.findMany({
          where: {
            businessId,
            createdAt: { gte: todayStart },
            status: "COMPLETED",
          },
          include: {
            items: true,
          },
        });

        const totalAmount = todaySales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
        const count = todaySales.length;

        // Calculate profit
        let totalProfit = 0;
        const prodCostMap = new Map<string, number>(products.map((p) => [p.id, p.buyingPrice]));
        for (const s of todaySales) {
          for (const it of s.items) {
            const buyingPrice = prodCostMap.get(it.productId) || 0;
            const cost = buyingPrice * Number(it.quantity);
            totalProfit += Number(it.totalPrice) - cost;
          }
        }

        let answerBn = "";
        if (/লাভ/.test(command)) {
          answerBn = `আজ মোট ${formatBnTaka(totalAmount)} বিক্রি হয়েছে এবং আনুমানিক লাভ ${formatBnTaka(totalProfit)} (${formatBnNumber(count)}টি বিল)।`;
        } else {
          answerBn = `আজ মোট ${formatBnTaka(totalAmount)} বিক্রি হয়েছে (${formatBnNumber(count)}টি বিল)।`;
        }

        return NextResponse.json({
          kind: "report",
          report: draft.report,
          answerBn,
          data: {
            salesCount: count,
            totalSales: totalAmount,
            totalProfit,
          },
          draft,
        });
      }

      // 3.3 Week Compare
      if (draft.report === "week_compare") {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const weekSales = await db.sale.findMany({
          where: {
            businessId,
            createdAt: { gte: sevenDaysAgo },
            status: "COMPLETED",
          },
          select: {
            totalAmount: true,
          },
        });

        const totalAmount = weekSales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
        const count = weekSales.length;

        const answerBn = `গত ৭ দিনে মোট ${formatBnTaka(totalAmount)} বিক্রি হয়েছে (${formatBnNumber(count)}টি বিল)।`;

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

      // 3.4 Low Stock Report
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

      // 3.5 Top Products Report
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

      // If specific customer was asked but not found
      if (draft.customerName) {
        const answerBn = `"${draft.customerName}" নামে কোনো গ্রাহক খুঁজে পাওয়া যায়নি।`;
        return NextResponse.json({
          kind: "due_query",
          answerBn,
          customerNotFound: true,
          customerName: draft.customerName,
          draft,
        });
      }

      // General due query (for all customers)
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
