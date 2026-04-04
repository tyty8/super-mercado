import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface CartItem {
  productId: number;
  quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: CartItem[] = body.items;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty" },
        { status: 400 }
      );
    }

    const productIds = items.map((i) => i.productId);
    const { rows: supermarkets } = await sql`
      SELECT id, name, slug FROM supermarkets ORDER BY name
    `;

    const { rows: prices } = await sql.query(
      `SELECT
        pr.product_id,
        pr.supermarket_id,
        pr.price,
        p.name as product_name,
        s.name as supermarket_name,
        s.slug as supermarket_slug
      FROM prices pr
      JOIN products p ON pr.product_id = p.id
      JOIN supermarkets s ON pr.supermarket_id = s.id
      WHERE pr.product_id = ANY($1::int[])`,
      [productIds]
    );

    const quantityMap = new Map<number, number>();
    for (const item of items) {
      quantityMap.set(item.productId, item.quantity);
    }

    const comparison = supermarkets.map((sm) => {
      const smPrices = prices.filter((p) => p.supermarket_slug === sm.slug);
      let total = 0;
      const itemDetails = items.map((item) => {
        const priceRow = smPrices.find((p) => p.product_id === item.productId);
        const unitPrice = priceRow?.price || 0;
        const subtotal = unitPrice * item.quantity;
        total += subtotal;
        return {
          productId: item.productId,
          name: priceRow?.product_name || "Unknown",
          unitPrice,
          quantity: item.quantity,
          subtotal,
        };
      });

      return {
        supermarket: sm.name,
        slug: sm.slug,
        total,
        items: itemDetails,
      };
    });

    comparison.sort((a, b) => a.total - b.total);

    const cheapest = comparison[0];
    const mostExpensive = comparison[comparison.length - 1];

    return NextResponse.json({
      comparison,
      savings: {
        cheapest: cheapest.supermarket,
        cheapestSlug: cheapest.slug,
        mostExpensive: mostExpensive.supermarket,
        mostExpensiveSlug: mostExpensive.slug,
        savedAmount: mostExpensive.total - cheapest.total,
      },
    });
  } catch (error) {
    console.error("Compare error:", error);
    return NextResponse.json(
      { error: "Error comparing prices" },
      { status: 500 }
    );
  }
}
