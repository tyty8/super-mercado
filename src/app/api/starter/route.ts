import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { STARTER_TERMS } from "@/lib/starter";

// Returns the curated weekly-staples starter list resolved to actual products.
// For each search term, picks the cheapest available match (by min price across stores).
export async function GET() {
  try {
    const products: Array<{
      id: number;
      name: string;
      brand: string;
      category: string;
      unit: string;
      prices: Record<string, number>;
    }> = [];
    const seen = new Set<number>();

    for (const term of STARTER_TERMS) {
      // Tokenize the term and build a flexible LIKE pattern.
      const tokens = term
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !/^\d/.test(t));
      if (tokens.length === 0) continue;

      // Use the first 2-3 most distinctive tokens
      const keyTokens = tokens.slice(0, 3);
      const likePatterns = keyTokens.map((t) => `%${t}%`);

      const { rows } = await sql.query(
        `SELECT
          p.id, p.name, p.brand, p.category, p.unit,
          json_agg(
            json_build_object(
              'supermarket_slug', s.slug,
              'price', pr.price
            )
          ) FILTER (WHERE s.slug IS NOT NULL) as prices
         FROM products p
         LEFT JOIN prices pr ON p.id = pr.product_id
         LEFT JOIN supermarkets s ON pr.supermarket_id = s.id
         WHERE ${keyTokens.map((_, i) => `LOWER(p.name) LIKE $${i + 1}`).join(" AND ")}
         GROUP BY p.id, p.name, p.brand, p.category, p.unit
         ORDER BY p.id
         LIMIT 5`,
        likePatterns
      );

      // Pick first not-yet-seen product
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const pricesMap: Record<string, number> = {};
        if (Array.isArray(row.prices)) {
          for (const p of row.prices) {
            if (p?.supermarket_slug) pricesMap[p.supermarket_slug] = p.price;
          }
        }
        // Skip if no prices at all
        if (Object.keys(pricesMap).length === 0) continue;
        products.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          category: row.category,
          unit: row.unit,
          prices: pricesMap,
        });
        break;
      }
    }

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Starter error:", error);
    return NextResponse.json(
      { error: "Error fetching starter list" },
      { status: 500 }
    );
  }
}
