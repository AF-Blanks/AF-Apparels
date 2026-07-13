"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

interface Variant {
  color: string;
  size: string;
  units_sold: number;
  revenue: number;
}

interface ProductRow {
  product_name: string;
  total_units: number;
  total_revenue: number;
  variants: Variant[];
}

interface ReportData {
  period: string;
  date_from: string;
  date_to: string;
  products: ProductRow[];
  summary: {
    total_products: number;
    total_units: number;
    total_revenue: number;
  };
}

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export default function VariantSalesPage() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    load(period);
  }, [period]);

  async function load(p: string) {
    setLoading(true);
    try {
      const res = await adminService.getVariantSalesReport(p) as ReportData;
      setData(res);
      // auto-expand if only a few products
      if (res.products.length <= 5) {
        setExpanded(new Set(res.products.map(r => r.product_name)));
      } else {
        setExpanded(new Set());
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(name: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });
  }

  function expandAll() {
    if (!data) return;
    setExpanded(new Set(data.products.map(r => r.product_name)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function exportCsv() {
    if (!data) return;
    const rows: string[][] = [
      ["Product", "Color", "Size", "Units Sold", "Revenue"],
    ];
    for (const p of data.products) {
      for (const v of p.variants) {
        rows.push([p.product_name, v.color, v.size, String(v.units_sold), v.revenue.toFixed(2)]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variant-sales-${data.period}-${data.date_from}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filtered = data
    ? data.products.filter(p =>
        !search || p.product_name.toLowerCase().includes(search.toLowerCase()) ||
        p.variants.some(v => v.color.toLowerCase().includes(search.toLowerCase()) || v.size.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales by Product Variants</h1>
          <p className="text-sm text-gray-500 mt-1">
            Color &amp; size breakdown of sold variants for the selected period
            {data && <span className="ml-1 text-gray-400">({data.date_from} → {data.date_to})</span>}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data || data.products.length === 0}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* Period filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              period === p.value
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product, color, size…"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Summary cards */}
      {data && !loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Products Sold</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.total_products}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Units</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.total_units.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ${data.summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Table toolbar */}
        {data && data.products.length > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <span className="text-xs text-gray-500">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</span>
            <button onClick={expandAll} className="text-xs text-blue-600 hover:underline">Expand all</button>
            <button onClick={collapseAll} className="text-xs text-gray-500 hover:underline">Collapse all</button>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product / Color / Size</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Units Sold</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-16 text-center text-gray-400 text-sm">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center text-gray-400 text-sm">
                  {search ? "No results match your search" : "No sales found for this period"}
                </td>
              </tr>
            ) : (
              filtered.map((product) => {
                const isExp = expanded.has(product.product_name);
                return (
                  <>
                    {/* Product header row */}
                    <tr
                      key={product.product_name}
                      onClick={() => toggleExpand(product.product_name)}
                      className="border-b border-gray-100 bg-white hover:bg-gray-50 cursor-pointer select-none"
                    >
                      <td className="px-4 py-3 text-center">
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#9CA3AF",
                            display: "inline-block",
                            transform: isExp ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform .15s",
                          }}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {product.product_name}
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {product.variants.length} variant{product.variants.length !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {product.total_units.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        ${product.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {/* Variant rows */}
                    {isExp && product.variants.map((v, vi) => (
                      <tr
                        key={`${product.product_name}-${vi}`}
                        className="border-b border-gray-50 bg-blue-50 hover:bg-blue-100"
                      >
                        <td className="px-4 py-2" />
                        <td className="py-2 text-sm" style={{ paddingLeft: "36px" }}>
                          <span className="inline-flex items-center gap-2">
                            {/* Color swatch */}
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                              style={{ background: colorToHex(v.color) }}
                              title={v.color}
                            />
                            <span className="text-gray-700 font-medium">{v.color}</span>
                            <span className="text-gray-400">/</span>
                            <span className="inline-flex items-center justify-center min-w-[28px] h-5 rounded bg-gray-200 text-gray-600 text-xs font-semibold px-1">
                              {v.size}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 text-sm">{v.units_sold.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-700 text-sm">
                          ${v.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })
            )}

            {/* Grand total row */}
            {data && !loading && filtered.length > 0 && (
              <tr className="bg-gray-900">
                <td />
                <td className="px-4 py-3 text-white font-bold text-sm">TOTAL</td>
                <td className="px-4 py-3 text-right text-white font-bold text-sm">
                  {filtered.reduce((s, p) => s + p.total_units, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-white font-bold text-sm">
                  ${filtered.reduce((s, p) => s + p.total_revenue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Best-effort color name → hex for swatch
function colorToHex(name: string): string {
  const map: Record<string, string> = {
    black: "#111", white: "#f9f9f9", navy: "#001f5b", "navy blue": "#001f5b",
    red: "#dc2626", blue: "#2563eb", green: "#16a34a", grey: "#9ca3af",
    gray: "#9ca3af", charcoal: "#4b5563", khaki: "#c3a46e", tan: "#d4b483",
    brown: "#92400e", orange: "#ea580c", yellow: "#eab308", pink: "#ec4899",
    purple: "#9333ea", maroon: "#7f1d1d", olive: "#78716c", coral: "#f97316",
    teal: "#0d9488", silver: "#d1d5db", gold: "#d97706", burgundy: "#9b2335",
    forest: "#166534", "forest green": "#166534", "royal blue": "#1d4ed8",
    sky: "#0ea5e9", "sky blue": "#0ea5e9", "light blue": "#7dd3fc",
    "dark grey": "#374151", "dark gray": "#374151",
  };
  return map[name.toLowerCase()] ?? "#e5e7eb";
}
