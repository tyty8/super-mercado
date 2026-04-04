import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

const SUPERMARKETS = [
  { name: "Jumbo", slug: "jumbo", website_url: "https://www.jumbo.cl", logo_url: "/logos/jumbo.svg" },
  { name: "Líder", slug: "lider", website_url: "https://www.lider.cl", logo_url: "/logos/lider.svg" },
  { name: "Tottus", slug: "tottus", website_url: "https://www.tottus.cl", logo_url: "/logos/tottus.svg" },
  { name: "Unimarc", slug: "unimarc", website_url: "https://www.unimarc.cl", logo_url: "/logos/unimarc.svg" },
  { name: "Santa Isabel", slug: "santa-isabel", website_url: "https://www.santaisabel.cl", logo_url: "/logos/santa-isabel.svg" },
];

// [name, brand, category, unit, basePrices: [jumbo, lider, tottus, unimarc, santa-isabel]]
const PRODUCTS: [string, string, string, string, number[]][] = [
  // Lácteos - Soprole
  ["Leche Entera Soprole 1L", "Soprole", "Lácteos", "1 L", [1350, 1190, 1290, 1390, 1250]],
  ["Leche Descremada Soprole 1L", "Soprole", "Lácteos", "1 L", [1350, 1190, 1290, 1390, 1250]],
  ["Yoghurt Batido Frutilla Soprole 165g", "Soprole", "Lácteos", "165 g", [490, 450, 470, 520, 480]],
  ["Manjar Soprole 400g", "Soprole", "Lácteos", "400 g", [2290, 2090, 2190, 2390, 2190]],
  ["Queso Gauda Laminado Soprole 150g", "Soprole", "Lácteos", "150 g", [2890, 2690, 2790, 2990, 2790]],
  ["Yoghurt Griego Natural Soprole 110g", "Soprole", "Lácteos", "110 g", [590, 550, 570, 620, 580]],

  // Lácteos - Colun
  ["Leche Entera Colun 1L", "Colun", "Lácteos", "1 L", [1290, 1150, 1190, 1350, 1190]],
  ["Yoghurt Natural Colun 1kg", "Colun", "Lácteos", "1 kg", [2790, 2590, 2690, 2890, 2690]],
  ["Mantequilla Colun 250g", "Colun", "Lácteos", "250 g", [3390, 3190, 3290, 3490, 3290]],
  ["Queso Mantecoso Laminado Colun 150g", "Colun", "Lácteos", "150 g", [2990, 2790, 2890, 3090, 2890]],

  // Lácteos - Loncoleche
  ["Leche Entera Loncoleche 1L", "Loncoleche", "Lácteos", "1 L", [1100, 990, 1050, 1150, 1000]],
  ["Leche Descremada Loncoleche 1L", "Loncoleche", "Lácteos", "1 L", [1100, 990, 1050, 1150, 1000]],
  ["Leche Chocolate Loncoleche 200ml", "Loncoleche", "Lácteos", "200 ml", [490, 450, 470, 510, 460]],

  // Carnes - Ariztía
  ["Pechuga de Pollo Entera Ariztía kg", "Ariztía", "Carnes", "1 kg", [5990, 5490, 5690, 6190, 5790]],
  ["Trutro Corto de Pollo Ariztía kg", "Ariztía", "Carnes", "1 kg", [3990, 3690, 3790, 4190, 3890]],
  ["Nuggets de Pollo Ariztía 400g", "Ariztía", "Carnes", "400 g", [3490, 3190, 3290, 3590, 3390]],
  ["Hamburguesas de Pollo Ariztía 6un", "Ariztía", "Carnes", "6 un", [3690, 3390, 3490, 3790, 3590]],
  ["Pollo Entero Ariztía kg", "Ariztía", "Carnes", "1 kg", [3290, 2990, 3090, 3490, 3190]],

  // Despensa - Carozzi
  ["Fideos Spaghetti Carozzi 400g", "Carozzi", "Despensa", "400 g", [890, 790, 850, 950, 850]],
  ["Salsa de Tomate Carozzi 200g", "Carozzi", "Despensa", "200 g", [590, 490, 550, 630, 550]],
  ["Arroz Grado 1 Carozzi 1kg", "Carozzi", "Despensa", "1 kg", [1690, 1490, 1590, 1790, 1590]],

  // Despensa - Tucapel
  ["Arroz Grado 1 Tucapel 1kg", "Tucapel", "Despensa", "1 kg", [2450, 2190, 2290, 2550, 2350]],
  ["Arroz Grado 2 Tucapel 1kg", "Tucapel", "Despensa", "1 kg", [1890, 1690, 1790, 1990, 1790]],

  // Despensa - Lucchetti
  ["Fideos Spaghetti Lucchetti 400g", "Lucchetti", "Despensa", "400 g", [790, 690, 750, 850, 750]],
  ["Fideos Corbata Lucchetti 400g", "Lucchetti", "Despensa", "400 g", [790, 690, 750, 850, 750]],

  // Panadería
  ["Pan de Molde Blanco Ideal 750g", "Ideal", "Panadería", "750 g", [2990, 2790, 2890, 3090, 2890]],
  ["Pan de Molde Integral Ideal 580g", "Ideal", "Panadería", "580 g", [3290, 2990, 3090, 3390, 3190]],
  ["Pan de Molde Blanco Bimbo 650g", "Bimbo", "Panadería", "650 g", [3190, 2890, 2990, 3290, 3090]],
  ["Pan de Molde Integral Bimbo 480g", "Bimbo", "Panadería", "480 g", [3490, 3190, 3290, 3590, 3390]],

  // Aceites
  ["Aceite de Maravilla Chef 1L", "Chef", "Despensa", "1 L", [2490, 2290, 2390, 2590, 2390]],
  ["Aceite Vegetal Chef 900ml", "Chef", "Despensa", "900 ml", [2190, 1990, 2090, 2290, 2090]],

  // Cereales y café - Nestlé
  ["Cereal Chocapic Nestlé 500g", "Nestlé", "Desayuno", "500 g", [4490, 4090, 4290, 4690, 4390]],
  ["Nescafé Tradición 170g", "Nestlé", "Desayuno", "170 g", [6990, 6490, 6690, 7190, 6890]],
  ["Leche Condensada Nestlé 397g", "Nestlé", "Despensa", "397 g", [2190, 1990, 2090, 2290, 2090]],

  // Bebidas
  ["Coca-Cola Original 1.5L", "Coca-Cola", "Bebidas", "1.5 L", [1890, 1690, 1790, 1990, 1790]],
  ["Coca-Cola Zero 1.5L", "Coca-Cola", "Bebidas", "1.5 L", [1890, 1690, 1790, 1990, 1790]],
  ["Fanta 1.5L", "Coca-Cola", "Bebidas", "1.5 L", [1590, 1390, 1490, 1690, 1490]],
  ["Bilz 1.5L", "CCU", "Bebidas", "1.5 L", [1490, 1290, 1390, 1590, 1390]],
  ["Pap 1.5L", "CCU", "Bebidas", "1.5 L", [1490, 1290, 1390, 1590, 1390]],
  ["Agua Mineral Cachantún 1.6L", "CCU", "Bebidas", "1.6 L", [990, 890, 950, 1090, 950]],

  // Huevos
  ["Huevos Blancos 12 un", "Huevos Chile", "Lácteos", "12 un", [3290, 2990, 3090, 3490, 3190]],
  ["Huevos de Campo 6 un", "Huevos Chile", "Lácteos", "6 un", [2690, 2490, 2590, 2790, 2590]],

  // Marcas Propias
  ["Leche Entera Jumbo 1L", "Jumbo", "Lácteos", "1 L", [990, 0, 0, 0, 0]],
  ["Arroz Grado 1 Jumbo 1kg", "Jumbo", "Despensa", "1 kg", [1490, 0, 0, 0, 0]],
  ["Arroz Grado 1 Líder 1kg", "Líder", "Despensa", "1 kg", [0, 1390, 0, 0, 0]],
  ["Aceite Vegetal Líder 1L", "Líder", "Despensa", "1 L", [0, 1790, 0, 0, 0]],
  ["Leche Entera Cuisine & Co 1L", "Cuisine & Co", "Lácteos", "1 L", [0, 0, 0, 0, 1000]],
  ["Huevos Cuisine & Co 12 un", "Cuisine & Co", "Lácteos", "12 un", [0, 0, 0, 0, 3290]],
];

export async function GET() {
  try {
    // Drop tables in reverse order (foreign keys)
    await sql`DROP TABLE IF EXISTS prices`;
    await sql`DROP TABLE IF EXISTS products`;
    await sql`DROP TABLE IF EXISTS supermarkets`;

    // Create tables
    await sql`
      CREATE TABLE supermarkets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) NOT NULL UNIQUE,
        logo_url VARCHAR(500),
        website_url VARCHAR(500) NOT NULL
      )
    `;

    await sql`
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(300) NOT NULL,
        brand VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        image_url VARCHAR(500)
      )
    `;

    await sql`
      CREATE TABLE prices (
        id SERIAL PRIMARY KEY,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        supermarket_id INT NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
        price INT NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(product_id, supermarket_id)
      )
    `;

    // Seed supermarkets
    for (const sm of SUPERMARKETS) {
      await sql`
        INSERT INTO supermarkets (name, slug, logo_url, website_url)
        VALUES (${sm.name}, ${sm.slug}, ${sm.logo_url}, ${sm.website_url})
      `;
    }

    // Get supermarket IDs
    const { rows: smRows } = await sql`SELECT id, slug FROM supermarkets ORDER BY id`;
    const smIdMap = new Map<string, number>();
    for (const sm of smRows) {
      smIdMap.set(sm.slug, sm.id);
    }

    const slugOrder = ["jumbo", "lider", "tottus", "unimarc", "santa-isabel"];

    // Seed products and prices
    let productCount = 0;
    let priceCount = 0;

    for (const [name, brand, category, unit, basePrices] of PRODUCTS) {
      const { rows } = await sql`
        INSERT INTO products (name, brand, category, unit)
        VALUES (${name}, ${brand}, ${category}, ${unit})
        RETURNING id
      `;
      const productId = rows[0].id;
      productCount++;

      for (let i = 0; i < slugOrder.length; i++) {
        const price = basePrices[i];
        if (price > 0) {
          const smId = smIdMap.get(slugOrder[i]);
          if (smId) {
            await sql`
              INSERT INTO prices (product_id, supermarket_id, price)
              VALUES (${productId}, ${smId}, ${price})
            `;
            priceCount++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${SUPERMARKETS.length} supermarkets, ${productCount} products, ${priceCount} prices`,
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: "Error seeding database", details: String(error) },
      { status: 500 }
    );
  }
}
