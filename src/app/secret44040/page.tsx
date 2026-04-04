"use client";

import { useState, useEffect } from "react";

interface PriceRow {
  product_id: number;
  product_name: string;
  brand: string;
  category: string;
  unit: string;
  jumbo: number | null;
  lider: number | null;
  tottus: number | null;
  unimarc: number | null;
  santa_isabel: number | null;
}

const formatCLP = (n: number | null) =>
  n
    ? new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
      }).format(n)
    : "—";

export default function SecretPage() {
  const [data, setData] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sortCol, setSortCol] = useState<string>("product_name");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    fetch("/api/all-prices")
      .then((r) => r.json())
      .then((d) => {
        setData(d.prices || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const filtered = data
    .filter(
      (row) =>
        row.product_name.toLowerCase().includes(filter.toLowerCase()) ||
        row.brand.toLowerCase().includes(filter.toLowerCase()) ||
        row.category.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortCol];
      const valB = (b as unknown as Record<string, unknown>)[sortCol];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === "string" && typeof valB === "string") {
        return sortAsc
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortAsc
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

  const getCheapest = (row: PriceRow) => {
    const prices = [
      { store: "jumbo", price: row.jumbo },
      { store: "lider", price: row.lider },
      { store: "tottus", price: row.tottus },
      { store: "unimarc", price: row.unimarc },
      { store: "santa_isabel", price: row.santa_isabel },
    ].filter((p) => p.price && p.price > 0);
    if (prices.length === 0) return null;
    return prices.reduce((min, p) => (p.price! < min.price! ? p : min));
  };

  const supermarkets = [
    { key: "jumbo", label: "Jumbo", color: "#00a650" },
    { key: "lider", label: "Líder", color: "#0071ce" },
    { key: "tottus", label: "Tottus", color: "#e31837" },
    { key: "unimarc", label: "Unimarc", color: "#e4002b" },
    { key: "santa_isabel", label: "Santa Isabel", color: "#e30613" },
  ];

  return (
    <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              Base de Datos de Precios
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {data.length} productos · {data.length * 5} precios registrados
            </p>
          </div>
          <input
            type="text"
            placeholder="Filtrar por producto, marca o categoría..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition text-sm w-full sm:w-80"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500">Cargando precios...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  {[
                    { key: "product_name", label: "Producto" },
                    { key: "brand", label: "Marca" },
                    { key: "category", label: "Categoría" },
                    { key: "unit", label: "Unidad" },
                    ...supermarkets.map((s) => ({
                      key: s.key,
                      label: s.label,
                    })),
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left px-3 py-3 font-semibold text-slate-600 cursor-pointer hover:text-blue-600 transition whitespace-nowrap select-none"
                    >
                      {col.label}
                      {sortCol === col.key && (
                        <span className="ml-1 text-blue-500">
                          {sortAsc ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const cheapest = getCheapest(row);
                  return (
                    <tr
                      key={row.product_id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {row.product_name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {row.brand}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                          {row.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {row.unit}
                      </td>
                      {supermarkets.map((sm) => {
                        const price = row[
                          sm.key as keyof PriceRow
                        ] as number | null;
                        const isCheapest =
                          cheapest?.store === sm.key && price != null;
                        return (
                          <td
                            key={sm.key}
                            className={`px-3 py-2.5 text-right font-mono whitespace-nowrap ${
                              isCheapest
                                ? "text-green-700 font-bold bg-green-50"
                                : price
                                ? "text-slate-700"
                                : "text-slate-300"
                            }`}
                          >
                            {formatCLP(price)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center py-8 text-slate-400">
                No se encontraron productos
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
