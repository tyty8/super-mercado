// Parse a product's unit string like "1 L", "500 g", "12 un.", "1.5 kg"
// into a normalized {qty, baseUnit}. Used to compute price-per-unit so a
// 591 ml soda and a 1.5 L soda can be compared fairly.

export type BaseUnit = "g" | "ml" | "un";

export interface ParsedUnit {
  qty: number;
  baseUnit: BaseUnit;
}

export function parseUnit(unit: string | null | undefined): ParsedUnit | null {
  if (!unit) return null;
  const m = unit.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|lt|l|cc|un)\b/i);
  if (!m) return null;
  let qty = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const raw = m[2].toLowerCase();

  let baseUnit: BaseUnit;
  if (raw === "kg") {
    qty *= 1000;
    baseUnit = "g";
  } else if (raw === "gr" || raw === "g") {
    baseUnit = "g";
  } else if (raw === "l" || raw === "lt") {
    qty *= 1000;
    baseUnit = "ml";
  } else if (raw === "cc" || raw === "ml") {
    baseUnit = "ml";
  } else {
    baseUnit = "un";
  }
  return { qty, baseUnit };
}

export interface PricePerUnit {
  value: number;
  label: string; // e.g. "$1.190/L" already formatted
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

export function pricePerUnit(
  price: number,
  unit: string | null | undefined
): PricePerUnit | null {
  if (!price || price <= 0) return null;
  const parsed = parseUnit(unit);
  if (!parsed) return null;
  const per = price / parsed.qty;
  if (parsed.baseUnit === "g") {
    return { value: per * 1000, label: `${fmtCLP(per * 1000)}/kg` };
  }
  if (parsed.baseUnit === "ml") {
    return { value: per * 1000, label: `${fmtCLP(per * 1000)}/L` };
  }
  return { value: per, label: `${fmtCLP(per)}/un` };
}

// Heuristic: is this product a "store brand" / generic product?
// Chilean store brands have predictable name prefixes.
const STORE_BRAND_RE =
  /^(Cuisine\s*&?\s*Co|Lider|Líder|Acuenta|Great\s*Value|Selección|Seleccion|Top\s*Hogar|Bell's|Ramonet|Arcoíris|Arcoiris)\b/i;

export function isStoreBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  return STORE_BRAND_RE.test(brand.trim());
}
