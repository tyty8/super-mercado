import { sql } from "./db";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Template {
  /** Stable URL-safe identifier. */
  id: string;
  /** Display name (Spanish). */
  name: string;
  /** Short description shown under the name. */
  description: string;
  /** Key into the icon map in `page.tsx`. Falls back to a generic list icon. */
  iconKey: string;
  /** Search terms — server-only, never sent to the client. */
  terms: ReadonlyArray<string>;
}

export interface ResolvedProduct {
  id: number;
  name: string;
  brand: string;
  category: string;
  unit: string;
  prices: Record<string, number>;
}

/** Public template metadata (no terms). */
export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  iconKey: string;
  itemCount: number;
}

// ─── Templates ───────────────────────────────────────────────────────────────
//
// Each template is a curated list of search terms. When the user picks a
// template, the server resolves each term to its first matching product (see
// `resolveTemplateProducts` below). Order matters — earlier terms get priority
// when picking from the catalog.

export const TEMPLATES: ReadonlyArray<Template> = [
  {
    id: "basica",
    name: "Básica",
    description: "Lo esencial para empezar",
    iconKey: "list-check",
    terms: [
      "Leche Colun Entera 1 L",
      "Pan de Molde Blanco",
      "Huevos Grandes 12 un",
      "Arroz Grado 1 1 kg",
      "Aceite Vegetal 1 L",
      "Azúcar Granulada 1 kg",
      "Café Nescafé",
      "Té Supremo",
      "Mantequilla Con Sal 250 g",
      "Yogurt Natural Soprole 1 kg",
      "Queso Gauda Laminado 250 g",
      "Pechuga de Pollo",
      "Carne Molida 500 g",
      "Fideos Spaghetti 400 g",
      "Salsa de Tomate Italiana 200 g",
      "Atún Lomitos en Aceite",
      "Detergente Líquido 3 L",
      "Papel Higiénico Doble Hoja",
      "Shampoo Dove",
      "Cloro Tradicional 1 L",
    ],
  },
  {
    id: "familia",
    name: "Familia",
    description: "Una semana para 4 personas",
    iconKey: "users",
    terms: [
      "Leche Colun Entera 1 L",
      "Pan de Molde Blanco Grande",
      "Huevos Grandes 12 un",
      "Arroz Grado 1 1 kg",
      "Fideos Spaghetti 400 g",
      "Aceite Vegetal 1 L",
      "Azúcar Granulada 1 kg",
      "Mantequilla Con Sal 250 g",
      "Queso Gauda Laminado 250 g",
      "Yogurt Natural Soprole 1 kg",
      "Pechuga de Pollo",
      "Carne Molida 500 g",
      "Vienesas",
      "Jamón Sandwich",
      "Salsa de Tomate Italiana 200 g",
      "Atún Lomitos en Aceite",
      "Cereal Corn Flakes",
      "Galletas",
      "Bebida Coca Cola 1.5 L",
      "Jugo Néctar 1 L",
      "Papel Higiénico Doble Hoja 12",
      "Toalla Nova",
      "Detergente Líquido 3 L",
      "Lavalozas Quix",
      "Pasta de Dientes Colgate",
    ],
  },
  {
    id: "limpieza",
    name: "Limpieza",
    description: "Aseo del hogar",
    iconKey: "sparkles",
    terms: [
      "Detergente Líquido 3 L",
      "Suavizante Ropa",
      "Cloro Tradicional 1 L",
      "Lavalozas Quix",
      "Limpiador Multiuso",
      "Limpiavidrios",
      "Desinfectante Lysoform",
      "Esponja Cocina",
      "Paño Multiuso",
      "Bolsas Basura",
      "Papel Higiénico Doble Hoja",
      "Toalla Nova",
    ],
  },
  {
    id: "desayuno",
    name: "Desayuno",
    description: "Café, pan, mermelada, cereal",
    iconKey: "sun",
    terms: [
      "Café Nescafé",
      "Té Supremo",
      "Leche Colun Entera 1 L",
      "Pan de Molde Blanco",
      "Mantequilla Con Sal 250 g",
      "Mermelada Frutilla",
      "Cereal Corn Flakes",
      "Avena Quaker",
      "Yogurt Natural Soprole 1 kg",
      "Jugo Néctar 1 L",
    ],
  },
  {
    id: "sin-lactosa",
    name: "Sin lactosa",
    description: "Alternativas sin lactosa",
    iconKey: "leaf",
    terms: [
      "Leche Colun Sin Lactosa 1 L",
      "Leche Soprole Sin Lactosa 1 L",
      "Leche de Almendras",
      "Leche de Avena",
      "Yogurt Sin Lactosa",
      "Queso Sin Lactosa",
      "Mantequilla Sin Lactosa",
      "Helado Sin Lactosa",
      "Crema Sin Lactosa",
      "Manjar Sin Lactosa",
    ],
  },
  {
    id: "proteina",
    name: "Alto en proteína",
    description: "Pollo, atún, huevos, legumbres",
    iconKey: "dumbbell",
    terms: [
      "Pechuga de Pollo",
      "Filete de Pollo",
      "Posta Negra",
      "Carne Molida 500 g",
      "Atún Lomitos en Aceite",
      "Atún Natural",
      "Huevos Grandes 12 un",
      "Lentejas 500 g",
      "Garbanzos 500 g",
      "Porotos Negros",
      "Quesillo",
      "Yogurt Griego",
    ],
  },
  {
    id: "asado",
    name: "Asado",
    description: "Carne, pan, carbón, bebidas",
    iconKey: "flame",
    terms: [
      "Lomo Vetado",
      "Asado de Tira",
      "Costillar de Cerdo",
      "Chorizo Parrillero",
      "Pollo Entero",
      "Pan Amasado",
      "Carbón 5 kg",
      "Sal Gruesa",
      "Pebre",
      "Cerveza Cristal",
      "Bebida Coca Cola 1.5 L",
      "Hielo",
    ],
  },
  {
    id: "vegetariano",
    name: "Vegetariano",
    description: "Legumbres, verduras, granos",
    iconKey: "carrot",
    terms: [
      "Lentejas 500 g",
      "Garbanzos 500 g",
      "Porotos Negros",
      "Quínoa",
      "Arroz Integral",
      "Avena Quaker",
      "Tofu",
      "Hamburguesa Vegetal",
      "Leche de Almendras",
      "Yogurt Natural Soprole 1 kg",
      "Mantequilla de Maní",
      "Aceite de Oliva",
    ],
  },
  {
    id: "bebe",
    name: "Bebé",
    description: "Pañales, leche, papillas",
    iconKey: "baby",
    terms: [
      "Pañales Huggies",
      "Pañales Babysec",
      "Toallitas Húmedas",
      "Leche Nan",
      "Compota Nestlé",
      "Cereal Infantil",
      "Shampoo Bebé Johnson",
      "Crema Bebé",
    ],
  },
  {
    id: "mascotas",
    name: "Mascotas",
    description: "Comida y arena",
    iconKey: "paw",
    terms: [
      "Alimento Perro Master Dog",
      "Alimento Perro Pedigree",
      "Alimento Gato Whiskas",
      "Alimento Gato Felix",
      "Arena Sanitaria Gato",
      "Snack Perro",
    ],
  },
];

// ─── Resolution helper ───────────────────────────────────────────────────────
//
// For each search term, tokenize and run a parameterized LIKE query against
// product names. Pick the first not-yet-seen product that has at least one
// price. This is the same logic that previously lived in
// `app/api/starter/route.ts:7-72`, lifted into a reusable helper.

export async function resolveTemplateProducts(
  template: Template
): Promise<ResolvedProduct[]> {
  const products: ResolvedProduct[] = [];
  const seen = new Set<number>();

  for (const term of template.terms) {
    const tokens = term
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/^\d/.test(t));
    if (tokens.length === 0) continue;

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

    for (const row of rows) {
      if (seen.has(row.id)) continue;
      const pricesMap: Record<string, number> = {};
      if (Array.isArray(row.prices)) {
        for (const p of row.prices) {
          if (p?.supermarket_slug) pricesMap[p.supermarket_slug] = p.price;
        }
      }
      if (Object.keys(pricesMap).length === 0) continue;
      seen.add(row.id);
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

  return products;
}

/** Public metadata for the template list endpoint (omits server-only `terms`). */
export function templateMeta(t: Template): TemplateMeta {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    iconKey: t.iconKey,
    itemCount: t.terms.length,
  };
}
