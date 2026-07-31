"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";

interface InventoryItem {
  sku: string;
  product_name: string;
  product_code: string | null;
  variant_name: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  available: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
}

interface InventoryReport {
  total_skus: number;
  low_stock_count: number;
  items: InventoryItem[];
  low_stock: InventoryItem[];
}

// Known sizes (longest-match first for the trailing-token split)
const SIZE_TOKENS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "XXL", "XXXL"];
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "XXL", "XXXL", "—"];

// "Charcoal Heather 2XL" → { color: "Charcoal Heather", size: "2XL" }
function splitVariant(name: string): { color: string; size: string } {
  const parts = (name || "").trim().split(/\s+/);
  const last = (parts[parts.length - 1] || "").toUpperCase();
  if (parts.length > 1 && SIZE_TOKENS.includes(last)) {
    return { color: parts.slice(0, -1).join(" ") || "—", size: last };
  }
  return { color: name || "—", size: "—" };
}

interface ProductGroup {
  key: string;
  code: string | null;
  name: string;
  colors: string[];
  sizes: string[];
  cells: Record<string, InventoryItem>; // `${color}|${size}` → item
}

export default function InventoryReportPage() {
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get(`/api/v1/admin/reports/inventory?low_stock_only=${lowStockOnly}`)
      .then((r: unknown) => setData(r as InventoryReport))
      .finally(() => setLoading(false));
  }, [lowStockOnly]);

  function handleExport() {
    adminService.exportInventoryCsv().catch(() => {});
  }

  const filtered = useMemo(
    () =>
      data?.items.filter(
        (i) =>
          !search ||
          i.sku.toLowerCase().includes(search.toLowerCase()) ||
          i.product_name.toLowerCase().includes(search.toLowerCase()) ||
          (i.product_code ?? "").toLowerCase().includes(search.toLowerCase())
      ) ?? [],
    [data, search]
  );

  // Group into product → colour × size matrix
  const groups = useMemo<ProductGroup[]>(() => {
    const map: Record<string, ProductGroup> = {};
    for (const it of filtered) {
      const { color, size } = splitVariant(it.variant_name);
      const key = `${it.product_code ?? ""}|${it.product_name}`;
      if (!map[key]) {
        map[key] = { key, code: it.product_code, name: it.product_name, colors: [], sizes: [], cells: {} };
      }
      const g = map[key];
      if (!g.colors.includes(color)) g.colors.push(color);
      if (!g.sizes.includes(size)) g.sizes.push(size);
      g.cells[`${color}|${size}`] = it;
    }
    const list = Object.values(map);
    for (const g of list) {
      g.sizes.sort((a, b) => {
        const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      g.colors.sort((a, b) => a.localeCompare(b));
    }
    list.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
    return list;
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
          <p className="text-sm text-gray-500 mt-1">Stock by product — colour × size grid (available units)</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-500">Total SKUs</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.total_skus}</p>
          </div>
          <div className={`border rounded-lg p-5 ${data.low_stock_count > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
            <p className="text-sm text-gray-500">Low Stock SKUs</p>
            <p className={`text-2xl font-bold mt-1 ${data.low_stock_count > 0 ? "text-red-700" : "text-gray-900"}`}>
              {data.low_stock_count}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search SKU, product code, or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-64"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          Low stock only
        </label>
        <span className="text-xs text-gray-400">Red = low stock · numbers are available units</span>
      </div>

      {/* Matrix per product */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-12 text-center text-gray-400">
          No inventory data found.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-baseline gap-2">
                {g.code && <span className="font-mono text-xs text-gray-400">{g.code}</span>}
                <span className="font-semibold text-gray-900">{g.name}</span>
                <span className="text-xs text-gray-400">
                  · {g.colors.length} colour{g.colors.length !== 1 ? "s" : ""} × {g.sizes.length} size{g.sizes.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left sticky left-0 bg-gray-50">Colour</th>
                      {g.sizes.map((s) => (
                        <th key={s} className="px-3 py-2 text-center font-semibold tabular-nums">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.colors.map((color) => (
                      <tr key={color} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white">{color}</td>
                        {g.sizes.map((size) => {
                          const it = g.cells[`${color}|${size}`];
                          if (!it) return <td key={size} className="px-3 py-2 text-center text-gray-200">·</td>;
                          return (
                            <td
                              key={size}
                              title={`On hand ${it.quantity_on_hand} · Reserved ${it.quantity_reserved} · Available ${it.available}`}
                              className={`px-3 py-2 text-center tabular-nums font-semibold ${
                                it.is_low_stock ? "bg-red-50 text-red-700" : "text-gray-800"
                              }`}
                            >
                              {it.available}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
