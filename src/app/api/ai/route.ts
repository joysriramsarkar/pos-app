import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const business = ctx.business;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const { summary } = body as { summary?: Record<string, unknown> };

    if (!summary || typeof summary !== 'object') {
      return NextResponse.json(
        { success: false, error: "Summary data is required" },
        { status: 400 },
      );
    }

    const currencySymbol = business.currency || "₹";

    const summaryData = summary as Record<string, unknown>;
    const margin = parseFloat(String(summaryData.profitMargin ?? "0"));
    const growth = Number(summaryData.revenueGrowth ?? 0);
    const salesCount = Number(summaryData.totalSalesCount ?? 0);
    const revenue = Number(summaryData.totalRevenue ?? 0);
    const profit = Number(summaryData.totalProfit ?? 0);
    const paymentBreakdown = (summaryData.paymentBreakdown as Record<string, unknown> | undefined) ?? {};
    const topPayment = Object.entries(paymentBreakdown).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))[0]?.[0] ?? "N/A";

    // Structured prompt context — gives the rule-based engine enough signal for specific advice
    const insights: string[] = [];

    // Margin analysis
    if (margin >= 30) {
      insights.push(`✅ Excellent profit margin of ${margin}%. You have pricing power — consider bundling slow-moving items with top sellers to clear stock.`);
    } else if (margin >= 15) {
      insights.push(`⚠️ Moderate profit margin of ${margin}%. Review your top 5 products' buying prices — even a 5% reduction in cost can significantly improve margins.`);
    } else {
      insights.push(`🔴 Low profit margin of ${margin}%. Urgently review pricing strategy. Identify products sold below cost or with near-zero margin and either reprice or discontinue them.`);
    }

    // Revenue growth
    if (growth > 10) {
      insights.push(`📈 Revenue grew ${growth}% vs the previous period. Capitalize on this momentum — ensure your best-selling items are fully stocked.`);
    } else if (growth >= 0) {
      insights.push(`➡️ Revenue is stable (${growth}% growth). To accelerate, consider loyalty discounts for repeat customers or upselling higher-margin products at checkout.`);
    } else {
      insights.push(`📉 Revenue declined ${Math.abs(growth)}% vs the previous period. Investigate which product categories dropped and whether it's seasonal or a pricing issue.`);
    }

    // Sales volume
    if (salesCount < 5) {
      insights.push(`📢 Very low transaction count (${salesCount}). Consider running a short-term promotion or reaching out to regular customers via WhatsApp.`);
    } else if (salesCount >= 50) {
      insights.push(`🔥 High transaction volume (${salesCount} sales). Ensure your checkout process is fast — long queues during peak hours can lose customers.`);
    }

    // Payment method insight
    if (topPayment !== "N/A") {
      insights.push(`💳 Most revenue came via ${topPayment}. If it's cash-heavy, consider offering a small UPI discount to reduce cash handling overhead.`);
    }

    // Profit vs revenue sanity
    if (revenue > 0 && profit < 0) {
      insights.push(`⚠️ You are selling at a net loss (Revenue: ${currencySymbol}${revenue.toFixed(0)}, Profit: ${currencySymbol}${profit.toFixed(0)}). Check if any products have buying prices higher than their selling prices in your inventory.`);
    }

    const advice = insights.join("\n\n");
    return NextResponse.json({ success: true, advice });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: "Failed to get AI advice" },
      { status: 500 },
    );
  }
}
