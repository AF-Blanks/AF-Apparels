"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

interface PriceItem {
  product_id: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  retail_price: number;
  unit_price: number;
}

interface PriceListResponse {
  items: PriceItem[];
  discount_percent: number;
}

// Size column order — small first, then up (matches the ordering grid).
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"];
function sizeRank(s: string): number {
  const i = SIZE_ORDER.indexOf((s || "").toUpperCase().trim());
  return i === -1 ? 900 : i;
}

export default function AccountPriceListPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasLoaded = useRef(false);

  const [items, setItems] = useState<PriceItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated()) return;
    hasLoaded.current = true;
  }, [isLoading]);

  async function handleGenerateReport() {
    setLoading(true);
    setGenerated(false);
    try {
      const data = await apiClient.get<PriceListResponse>("/api/v1/account/price-list-report");
      setItems(data.items);
      setDiscountPercent(data.discount_percent);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    if (!items.length) return;
    const headers = ["Style (SKU)", "Color", "Size", "Retail Price", "Your Price"];
    const rows = items.map((item) => [
      item.sku,
      item.color,
      item.size,
      `$${item.retail_price.toFixed(2)}`,
      `$${item.unit_price.toFixed(2)}`,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "af-apparel-price-list.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Build a color × size price matrix per product (sizes as columns, colors as
  // rows) — same shape as the ordering grid, for a consistent view. Each cell
  // holds this variant's retail + your price.
  const productMatrix = items.reduce(
    (acc, item) => {
      let p = acc[item.product_id];
      if (!p) {
        p = { product_name: item.product_name, sizes: new Set<string>(), colors: [], cell: {} };
        acc[item.product_id] = p;
      }
      p.sizes.add(item.size);
      if (!p.cell[item.color]) {
        p.cell[item.color] = {};
        p.colors.push(item.color);
      }
      p.cell[item.color]![item.size] = { unit: item.unit_price, retail: item.retail_price };
      return acc;
    },
    {} as Record<string, { product_name: string; sizes: Set<string>; colors: string[]; cell: Record<string, Record<string, { unit: number; retail: number }>> }>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Price List</h1>

      {/* Controls card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-200 price-list-ctrl-grid">
          {/* Step 1 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              1. Select Display Options
            </p>
            <p className="text-sm text-gray-500">
              Your personalized price list with your account pricing applied.
              {discountPercent > 0 && (
                <span className="ml-1 font-medium text-green-600">
                  ({discountPercent}% discount)
                </span>
              )}
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              2. Generate Report
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Generating…" : "Generate Report"}
              </button>
              {generated && items.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state before generate */}
      {!generated && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg text-gray-400">
          <svg className="mx-auto mb-2 w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
          <p className="text-sm">Click Generate Report to view your price list</p>
        </div>
      )}

      {generated && items.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-400">No active products found.</p>
        </div>
      )}

      {/* Results — one color × size price matrix per product (consistent view) */}
      {generated && items.length > 0 && (
        <div id="print-area" className="space-y-4">
          <div className="hidden print:block mb-2">
            <h2 className="text-lg font-bold">AF Apparels — Price List</h2>
            <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
          </div>

          {Object.entries(productMatrix).map(([productId, p]) => {
            const orderedSizes = [...p.sizes].sort(
              (a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b)
            );
            const isCollapsed = collapsed[productId];
            return (
              <div key={productId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setCollapsed((prev) => ({ ...prev, [productId]: !prev[productId] }))}
                  className="w-full flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-100 hover:bg-blue-100 transition-colors text-left"
                >
                  <span className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                    <span className="text-blue-400 text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
                    {p.product_name}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-3">
                    {p.colors.length} {p.colors.length === 1 ? "color" : "colors"}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="text-sm" style={{ minWidth: `${160 + orderedSizes.length * 66}px`, width: "100%" }}>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-gray-600 font-medium text-xs uppercase">Color</th>
                          {orderedSizes.map((sz) => (
                            <th key={sz} className="text-center px-3 py-2.5 text-gray-600 font-medium text-xs uppercase">{sz}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.colors.map((color, idx) => (
                          <tr key={color} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-4 py-2 text-gray-700 font-medium whitespace-nowrap">{color}</td>
                            {orderedSizes.map((sz) => {
                              const c = p.cell[color]?.[sz];
                              if (!c) return <td key={sz} className="px-3 py-2 text-center text-gray-300">—</td>;
                              const discounted = c.unit < c.retail;
                              return (
                                <td key={sz} className="px-3 py-2 text-center whitespace-nowrap">
                                  <div className={discounted ? "font-bold" : "font-semibold text-gray-900"} style={discounted ? { color: "#D01F2D" } : undefined}>
                                    ${c.unit.toFixed(2)}
                                  </div>
                                  {discounted && (
                                    <div className="text-gray-400 line-through text-[10px]">${c.retail.toFixed(2)}</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
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
