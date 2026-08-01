// frontend/src/app/(customer)/account/inventory/page.tsx
"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { PackageIcon } from "@/components/ui/icons";

interface InventoryItem {
  variant_id: string;
  sku: string;
  product_id: string;
  product_name: string;
  product_code: string | null;
  color: string;
  size: string;
  warehouse_id: string;
  warehouse_name: string;
  available: number;
}

interface InventoryResponse {
  items: InventoryItem[];
  warehouses: { id: string; name: string }[];
  products: { id: string; name: string; product_code: string | null }[];
  colors: string[];
}

function productLabel(name: string, code: string | null) {
  return code ? `${name} (${code})` : name;
}

// Size column order — small first, then up (matches the ordering grid).
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"];
function sizeRank(s: string): number {
  const i = SIZE_ORDER.indexOf((s || "").toUpperCase().trim());
  return i === -1 ? 900 : i;
}

export default function InventoryListingPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasLoaded = useRef(false);

  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; product_code: string | null }[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedColor, setSelectedColor] = useState("all");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Load filter options on mount — do NOT load items
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    apiClient
      .get<InventoryResponse>("/api/v1/account/inventory-report")
      .then((data) => {
        setWarehouses(data.warehouses);
        setProducts(data.products);
        setColors(data.colors);
        // Do NOT setItems here — wait for Generate Report
      })
      .finally(() => setInitLoading(false));
  }, [isLoading]);

  // Reset color when product changes
  useEffect(() => {
    setSelectedColor("all");
  }, [selectedProduct]);

  async function handleGenerateReport() {
    setLoading(true);
    setGenerated(false);
    try {
      const params = new URLSearchParams();
      if (selectedWarehouse !== "all") params.set("warehouse_id", selectedWarehouse);
      if (selectedProduct !== "all") params.set("product_id", selectedProduct);
      if (selectedColor !== "all") params.set("color", selectedColor);
      const qs = params.toString();

      const data = await apiClient.get<InventoryResponse>(
        `/api/v1/account/inventory-report${qs ? `?${qs}` : ""}`
      );
      setItems(data.items);
      setColors(data.colors);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    if (!items.length) return;
    const headers = ["Style (SKU)", "Color", "Size", "Available", "Warehouse"];
    const rows = items.map((item) => [
      item.sku,
      item.color,
      item.size,
      item.available.toString(),
      item.warehouse_name,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    // importProductsModal - downloadTemplate  
    const a = document.createElement("a");
    a.href = url;
    a.download = "af-apparel-import-template.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Build a color × size matrix per product (sizes as columns, colors as rows).
  // Quantities are summed across warehouses for each color+size cell — same
  // shape as the ordering grid so it reads the way customers place orders.
  const productMatrix = items.reduce(
    (acc, item) => {
      let p = acc[item.product_id];
      if (!p) {
        p = { product_name: item.product_name, product_code: item.product_code, sizes: new Set<string>(), colors: [], cell: {} };
        acc[item.product_id] = p;
      }
      p.sizes.add(item.size);
      if (!p.cell[item.color]) {
        p.cell[item.color] = {};
        p.colors.push(item.color);
      }
      p.cell[item.color]![item.size] = (p.cell[item.color]![item.size] ?? 0) + item.available;
      return acc;
    },
    {} as Record<string, { product_name: string; product_code: string | null; sizes: Set<string>; colors: string[]; cell: Record<string, Record<string, number>> }>
  );

  const cellColor = (n: number) =>
    n === 0 ? "text-red-500" : n < 10 ? "text-orange-500" : "text-gray-900";

  if (initLoading) return <div className="py-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Inventory Listing</h1>

      {/* 3-step filter card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-gray-200 inventory-filter-grid">
          {/* Step 1 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              1. Select A Warehouse
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              2. Select Product(s)
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Styles</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {productLabel(p.name, p.product_code)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Colors</option>
                  {colors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              3. Get Report
            </p>
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 mb-3"
            >
              {loading ? "Generating…" : "Generate Report"}
            </button>

            {generated && items.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Print
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty state — before generate */}
      {!generated && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg text-gray-400">
          <div className="mb-2 flex justify-center"><PackageIcon size={32} color="#9CA3AF" /></div>
          <p className="text-sm">Select filters and click Generate Report</p>
        </div>
      )}

      {/* Empty state — after generate, no results */}
      {generated && items.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400">No inventory found for selected filters.</p>
        </div>
      )}

      {/* Results — one color × size matrix per product (same shape as ordering) */}
      {generated && items.length > 0 && (
        <div id="print-area" className="space-y-4">
          {/* Print-only header */}
          <div className="hidden print:block mb-2">
            <h2 className="text-lg font-bold">AF Apparels — Inventory Listing Report</h2>
            <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
          </div>

          {Object.entries(productMatrix).map(([productId, p]) => {
            const orderedSizes = [...p.sizes].sort(
              (a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b)
            );
            const productTotal = p.colors.reduce(
              (sum, c) => sum + orderedSizes.reduce((s, sz) => s + (p.cell[c]?.[sz] ?? 0), 0),
              0
            );
            const isCollapsed = collapsed[productId];
            return (
              <div key={productId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Product header — click to collapse/expand */}
                <button
                  onClick={() => setCollapsed((prev) => ({ ...prev, [productId]: !prev[productId] }))}
                  className="w-full flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-100 hover:bg-blue-100 transition-colors text-left"
                >
                  <span className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                    <span className="text-blue-400 text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
                    {productLabel(p.product_name, p.product_code)}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-3">
                    {p.colors.length} {p.colors.length === 1 ? "color" : "colors"} · {productTotal.toLocaleString()} units
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="text-sm" style={{ minWidth: `${160 + orderedSizes.length * 60}px`, width: "100%" }}>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-gray-600 font-medium text-xs uppercase">Color</th>
                          {orderedSizes.map((sz) => (
                            <th key={sz} className="text-center px-3 py-2.5 text-gray-600 font-medium text-xs uppercase">{sz}</th>
                          ))}
                          <th className="text-center px-3 py-2.5 text-gray-600 font-bold text-xs uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.colors.map((color, idx) => {
                          const rowTotal = orderedSizes.reduce((s, sz) => s + (p.cell[color]?.[sz] ?? 0), 0);
                          return (
                            <tr key={color} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                              <td className="px-4 py-2 text-gray-700 font-medium whitespace-nowrap">{color}</td>
                              {orderedSizes.map((sz) => {
                                const qty = p.cell[color]?.[sz];
                                return (
                                  <td
                                    key={sz}
                                    className={`px-3 py-2 text-center font-semibold ${qty === undefined ? "text-gray-300" : cellColor(qty)}`}
                                  >
                                    {qty === undefined ? "—" : qty.toLocaleString()}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-center font-bold text-gray-800 bg-gray-50">{rowTotal.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand total */}
          <div className="bg-gray-800 rounded-lg px-5 py-3 flex justify-between items-center">
            <span className="text-white font-bold text-sm">TOTAL AVAILABLE</span>
            <span className="text-white font-bold text-sm">
              {items.reduce((sum, i) => sum + i.available, 0).toLocaleString()} units
            </span>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}