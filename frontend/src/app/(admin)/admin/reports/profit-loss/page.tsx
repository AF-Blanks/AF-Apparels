"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface ProductRow {
  product_name: string;
  units: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number | null;
  units_without_cost: number;
}

interface MonthOption { value: string; label: string }

interface PnL {
  period: { value: string | null; label: string; from: string; to: string };
  available_months: MonthOption[];
  summary: {
    orders: number;
    product_sales: number;
    shipping_charged: number;
    discounts: number;
    sales_tax_excluded: number;
    refunds: number;
    revenue: number;
    cogs: number;
    gross_profit: number;
    margin_pct: number | null;
    units_without_cost: number;
  };
  products: ProductRow[];
}

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProfitLossPage() {
  const [data, setData] = useState<PnL | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState("");

  const load = useCallback((m?: string) => {
    setLoading(true);
    setError(null);
    apiClient
      .get<PnL>(`/api/v1/admin/reports/profit-loss${m ? `?month=${m}` : ""}`)
      .then(res => { setData(res); if (res.period.value) setMonth(res.period.value); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the report."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profit &amp; Loss</h1>
        <p className="text-sm text-gray-500 mt-1">
          What was sold, what it cost, and what was left.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Month</span>
          <select value={month} onChange={e => { setMonth(e.target.value); load(e.target.value); }}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[170px]">
            {(data?.available_months ?? []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <button onClick={() => load(month)} disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Show"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && s ? (
        <>
          {/* The statement itself */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <span className="font-semibold text-gray-900">{data.period.label}</span>
              <span className="text-xs text-gray-500">{s.orders.toLocaleString()} orders</span>
            </div>
            <div className="divide-y divide-gray-100">
              <Line label="Product sales" hint="goods sold, after any discount" value={money(s.product_sales)} />
              {s.shipping_charged > 0 && (
                <Line label="Shipping charged" hint="what customers paid towards delivery" value={money(s.shipping_charged)} />
              )}
              {s.refunds > 0 && (
                <Line label="Refunds" hint="paid back on returns" value={`− ${money(s.refunds)}`} negative />
              )}
              <Line label="Revenue" value={money(s.revenue)} bold accent />
              <Line label="Cost of goods sold" hint="what the stock sold this month cost us"
                value={`− ${money(s.cogs)}`} negative />
              <div className="px-6 py-5 flex items-baseline justify-between gap-6 bg-gray-50">
                <div>
                  <div className="text-lg font-bold text-gray-900">Gross profit</div>
                  <div className="text-xs text-gray-500 mt-0.5">Revenue − cost of goods sold</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-3xl font-bold ${s.gross_profit >= 0 ? "text-green-700" : "text-red-600"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(s.gross_profit)}
                  </div>
                  {s.margin_pct !== null && (
                    <div className="text-sm font-semibold text-gray-500 mt-0.5">{s.margin_pct}% margin</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {s.sales_tax_excluded > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg px-6 py-4 text-sm text-gray-600">
              <strong className="text-gray-900">{money(s.sales_tax_excluded)}</strong> of sales tax was collected in
              this period and is <strong>not</strong> counted above. It is collected for the state and owed straight
              back, so it is never income — the same treatment QuickBooks applies.
            </div>
          )}

          {s.units_without_cost > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <strong>{s.units_without_cost.toLocaleString()}</strong> unit{s.units_without_cost === 1 ? "" : "s"} sold
              have no cost recorded on the product, so they count as zero cost and make the profit above look better
              than it is. Add a unit cost on those products for a true figure.
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              By product
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">Units</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.products.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Nothing sold in {data.period.label}.
                    </td></tr>
                  ) : data.products.map(p => (
                    <tr key={p.product_name} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900">
                        {p.product_name}
                        {p.units_without_cost > 0 && (
                          <span className="ml-2 text-[11px] text-amber-600"
                            title={`${p.units_without_cost} units have no cost on file`}>
                            (no cost on {p.units_without_cost})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {p.units.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {money(p.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {money(p.cogs)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${p.gross_profit >= 0 ? "text-green-700" : "text-red-600"}`}
                        style={{ fontVariantNumeric: "tabular-nums" }}>
                        {money(p.gross_profit)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {p.margin_pct === null ? "—" : `${p.margin_pct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-2">How these figures are worked out</p>
            <p className="mb-2">
              <strong>Revenue</strong> is what customers were billed for goods and shipping, less any discount and
              any refund paid back. Sales tax is excluded — it is collected for the state, not earned.
            </p>
            <p className="mb-2">
              <strong>Cost of goods sold</strong> is each item&rsquo;s quantity at the product&rsquo;s current unit
              cost. Nothing records the cost onto an order at the moment of sale, so a product whose cost has changed
              since is valued at today&rsquo;s figure — exact while costs hold steady, an estimate after a sharp move.
            </p>
            <p>
              Cancelled and refunded orders are left out entirely. This is gross profit: it does not deduct wages,
              rent, marketing, card fees or shipping the business paid — those sit in QuickBooks.
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the report.</div>
      )}
    </div>
  );
}

function Line({ label, hint, value, bold, accent, negative }: {
  label: string; hint?: string; value: string;
  bold?: boolean; accent?: boolean; negative?: boolean;
}) {
  return (
    <div className="px-6 py-3 flex items-start justify-between gap-6">
      <div>
        <div className={`${bold ? "font-bold" : "font-medium"} ${accent ? "text-blue-700" : "text-gray-900"}`}>{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
      <div className={`shrink-0 ${bold ? "font-bold text-base" : "font-semibold"} ${
        negative ? "text-red-600" : accent ? "text-blue-700" : "text-gray-900"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
