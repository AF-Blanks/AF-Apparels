"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface InventoryValue {
  total_value: number;
  total_units: number;
  product_count: number;
  missing_cost_units: number;
  missing_cost_skus: number;
  items: { product_name: string; quantity: number; value: number; fully_costed: boolean }[];
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InventoryValuePage() {
  const [data, setData] = useState<InventoryValue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get("/api/v1/admin/reports/inventory-value")
      .then((r: any) => setData(r))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventory Value</h1>
        <p className="text-sm text-gray-500 mt-1">
          How much your stock on hand is worth right now — each item&rsquo;s quantity × unit cost.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Total Inventory Value</p>
              <p className="text-3xl font-bold text-green-700 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {money(data.total_value)}
              </p>
              <p className="text-xs text-gray-500 mt-1">value of all stock on hand</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Units</p>
              <p className="text-3xl font-bold text-gray-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {data.total_units.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">pieces in stock</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Products in Stock</p>
              <p className="text-3xl font-bold text-gray-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {data.product_count.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">distinct products</p>
            </div>
          </div>

          {/* Missing-cost note */}
          {data.missing_cost_skus > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <strong>{data.missing_cost_units.toLocaleString()}</strong> unit{data.missing_cost_units !== 1 ? "s" : ""} across{" "}
              <strong>{data.missing_cost_skus}</strong> variant{data.missing_cost_skus !== 1 ? "s" : ""} have stock but no unit cost on file,
              so they aren&rsquo;t counted in the total above. Add a cost on those products to include them.
            </div>
          )}

          {/* Per-product breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Value by Product
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">#</th>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-6 py-3 text-right">Qty in Stock</th>
                    <th className="px-6 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No stock on hand.</td></tr>
                  ) : data.items.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {row.product_name}
                        {!row.fully_costed && (
                          <span className="ml-2 text-[11px] text-amber-600" title="Some variants of this product have no cost on file">
                            (partial cost)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {row.quantity.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-green-700" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {money(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.items.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-6 py-3" />
                      <td className="px-6 py-3 font-bold text-gray-900">Total</td>
                      <td className="px-6 py-3 text-right font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {data.total_units.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-green-700" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {money(data.total_value)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load inventory value.</div>
      )}
    </div>
  );
}
