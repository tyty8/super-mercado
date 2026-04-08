import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface CartItem {
  productId: number;
  quantity: number;
}

interface PriceRow {
  product_id: number;
  supermarket_id: number;
  price: number;
  product_name: string;
  product_brand: string;
  product_category: string;
  product_unit: string;
  supermarket_name: string;
  supermarket_slug: string;
}

interface SubstituteSuggestion {
  productId: number;
  name: string;
  brand: string;
  unit: string;
  price: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: CartItem[] = body.items;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const productIds = items.map((i) => i.productId);
    const { rows: supermarkets } = await sql`
      SELECT id, name, slug FROM supermarkets ORDER BY name
    `;

    const { rows } = await sql.query(
      `SELECT
        pr.product_id,
        pr.supermarket_id,
        pr.price,
        p.name as product_name,
        p.brand as product_brand,
        p.category as product_category,
        p.unit as product_unit,
        s.name as supermarket_name,
        s.slug as supermarket_slug
      FROM prices pr
      JOIN products p ON pr.product_id = p.id
      JOIN supermarkets s ON pr.supermarket_id = s.id
      WHERE pr.product_id = ANY($1::int[])`,
      [productIds]
    );
    const prices = rows as PriceRow[];

    const quantityMap = new Map<number, number>();
    for (const item of items) {
      quantityMap.set(item.productId, item.quantity);
    }

    // Per-store totals (existing behavior)
    const comparison = supermarkets.map((sm) => {
      const smPrices = prices.filter((p) => p.supermarket_slug === sm.slug);
      let total = 0;
      let availableCount = 0;
      const itemDetails = items.map((item) => {
        const priceRow = smPrices.find((p) => p.product_id === item.productId);
        const unitPrice = priceRow?.price || 0;
        const subtotal = unitPrice * item.quantity;
        total += subtotal;
        if (unitPrice > 0) availableCount++;
        return {
          productId: item.productId,
          name: priceRow?.product_name || "Unknown",
          unit: priceRow?.product_unit || "",
          unitPrice,
          quantity: item.quantity,
          subtotal,
        };
      });

      return {
        supermarket: sm.name,
        slug: sm.slug,
        total,
        availableCount,
        totalCount: items.length,
        items: itemDetails,
      };
    });

    comparison.sort((a, b) => {
      // Stores missing items can artificially appear cheap; rank by completeness first.
      if (a.availableCount !== b.availableCount) {
        return b.availableCount - a.availableCount;
      }
      return a.total - b.total;
    });

    const cheapest = comparison[0];
    const mostExpensive = comparison[comparison.length - 1];

    // ─── Optimal split ───
    // For each item, pick the cheapest store that carries it.
    // Group items by their best store and report.
    const splitByStore = new Map<
      string,
      { name: string; items: typeof comparison[0]["items"]; total: number }
    >();
    let optimalTotal = 0;
    let optimalMissing = 0;

    for (const item of items) {
      const offers = prices.filter(
        (p) => p.product_id === item.productId && p.price > 0
      );
      if (offers.length === 0) {
        optimalMissing++;
        continue;
      }
      offers.sort((a, b) => a.price - b.price);
      const best = offers[0];
      const subtotal = best.price * item.quantity;
      optimalTotal += subtotal;

      if (!splitByStore.has(best.supermarket_slug)) {
        splitByStore.set(best.supermarket_slug, {
          name: best.supermarket_name,
          items: [],
          total: 0,
        });
      }
      const bucket = splitByStore.get(best.supermarket_slug)!;
      bucket.items.push({
        productId: item.productId,
        name: best.product_name,
        unit: best.product_unit,
        unitPrice: best.price,
        quantity: item.quantity,
        subtotal,
      });
      bucket.total += subtotal;
    }

    const optimalSplit = {
      stores: Array.from(splitByStore.entries())
        .map(([slug, b]) => ({ slug, ...b }))
        .sort((a, b) => b.total - a.total),
      total: optimalTotal,
      missingCount: optimalMissing,
      savingsVsCheapestStore:
        cheapest.availableCount === items.length
          ? cheapest.total - optimalTotal
          : 0,
    };

    // ─── Substitutes ───
    // For each store, for items it doesn't carry, find up to 2 same-category
    // same-brand alternatives that ARE available at that store.
    const substitutesByStore: Record<string, Record<number, SubstituteSuggestion[]>> = {};

    // Need product metadata for the missing items
    const { rows: missingMetaRows } = await sql.query(
      `SELECT id, name, brand, category, unit FROM products WHERE id = ANY($1::int[])`,
      [productIds]
    );
    const productMeta = new Map<
      number,
      { name: string; brand: string; category: string; unit: string }
    >();
    for (const r of missingMetaRows) {
      productMeta.set(r.id, {
        name: r.name,
        brand: r.brand,
        category: r.category,
        unit: r.unit,
      });
    }

    for (const entry of comparison) {
      const missing = entry.items.filter((it) => it.unitPrice === 0);
      if (missing.length === 0) continue;
      substitutesByStore[entry.slug] = {};

      for (const it of missing) {
        const meta = productMeta.get(it.productId);
        if (!meta) continue;

        // Try same category + same brand at this store
        const { rows: subRows } = await sql.query(
          `SELECT p.id, p.name, p.brand, p.unit, pr.price
           FROM products p
           JOIN prices pr ON p.id = pr.product_id
           JOIN supermarkets s ON pr.supermarket_id = s.id
           WHERE s.slug = $1
             AND p.category = $2
             AND p.brand = $3
             AND p.id != $4
             AND pr.price > 0
           ORDER BY pr.price ASC
           LIMIT 2`,
          [entry.slug, meta.category, meta.brand, it.productId]
        );

        if (subRows.length === 0) continue;
        substitutesByStore[entry.slug][it.productId] = subRows.map((r) => ({
          productId: r.id,
          name: r.name,
          brand: r.brand,
          unit: r.unit,
          price: r.price,
        }));
      }
    }

    return NextResponse.json({
      comparison,
      savings: {
        cheapest: cheapest.supermarket,
        cheapestSlug: cheapest.slug,
        mostExpensive: mostExpensive.supermarket,
        mostExpensiveSlug: mostExpensive.slug,
        savedAmount: mostExpensive.total - cheapest.total,
      },
      optimalSplit,
      substitutes: substitutesByStore,
    });
  } catch (error) {
    console.error("Compare error:", error);
    return NextResponse.json(
      { error: "Error comparing prices" },
      { status: 500 }
    );
  }
}
