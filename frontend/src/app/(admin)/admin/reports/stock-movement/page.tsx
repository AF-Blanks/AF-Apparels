"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Row {
  variant_id: string;
  product_name: string;
  color: string;
  size: string;
  sku: string;
  opening: number;
  sold: number;
  received: number;
  other: number;
  closing: number;
  on_order: number;
}

interface MonthOption { value: string; label: string }

interface Movement {
  period: MonthOption;
  available_months: MonthOption[];
  summary: {
    variants: number;
    opening: number; sold: number; received: number;
    other: number; closing: number; on_order: number;
  };
  rows: Row[];
}

const n = (v: number) => v.toLocaleString();

export default function StockMovementPage() {
  const [data, setData] = useState<Movement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback((m?: string, q?: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (m) params.set("month", m);
    if (q && q.trim()) params.set("q", q.trim());
    apiClient
      .get<Movement>(`/api/v1/admin/reports/stock-movement?${params.toString()}`)
      .then(res => { setData(res); setMonth(res.period.value); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the report."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock Movement</h1>
        <p className="text-sm text-gray-500 mt-1">
          For every variant: what you started the month with, what sold, what arrived, and what is still on order.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Month</span>
          <select value={month} onChange={e => { setMonth(e.target.value); load(e.target.value, search); }}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[160px]">
            {(data?.available_months ?? []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[240px]">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Product, colour or size</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") load(month, search); }}
            placeholder="e.g. 1001 pink 3XL"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <button onClick={() => load(month, search)} disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Show"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && s ? (
        <>
          {/* The month as one sentence of arithmetic */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              {data.period.label} — all {n(s.variants)} variants
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Fig label="Opening" value={n(s.opening)} />
              <Op>+</Op>
              <Fig label="Received" value={n(s.received)} tone="good" />
              <Op>−</Op>
              <Fig label="Sold" value={n(s.sold)} tone="sold" />
              {s.other !== 0 && (<><Op>{s.other > 0 ? "+" : "−"}</Op><Fig label="Adjustments" value={n(Math.abs(s.other))} /></>)}
              <Op>=</Op>
              <Fig label="Closing" value={n(s.closing)} strong />
              <div className="ml-auto pl-4 border-l border-gray-200">
                <Fig label="Still on order" value={n(s.on_order)} tone="pending" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900 flex items-center justify-between flex-wrap gap-2">
              <span>By variant</span>
              <span className="text-xs font-normal text-gray-500">busiest first</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-3 py-3 text-left">Colour</th>
                    <th className="px-3 py-3 text-left">Size</th>
                    <th className="px-3 py-3 text-right">Opening</th>
                    <th className="px-3 py-3 text-right">Received</th>
                    <th className="px-3 py-3 text-right">Sold</th>
                    <th className="px-3 py-3 text-right">Adjust.</th>
                    <th className="px-3 py-3 text-right">Closing</th>
                    <th className="px-3 py-3 text-right">On order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-400">
                      Nothing moved in {data.period.label} for this search.
                    </td></tr>
                  ) : data.rows.map(r => (
                    <tr key={r.variant_id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900">
                        {r.product_name}
                        <div className="text-[11px] text-gray-400 font-mono">{r.sku}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{r.color}</td>
                      <td className="px-3 py-3 text-gray-700">{r.size}</td>
                      <Num v={r.opening} />
                      <Num v={r.received} tone={r.received > 0 ? "good" : undefined} plus />
                      <Num v={r.sold} tone={r.sold > 0 ? "sold" : undefined} />
                      <Num v={r.other} tone={r.other !== 0 ? "muted" : undefined} signed />
                      <Num v={r.closing} strong />
                      <Num v={r.on_order} tone={r.on_order > 0 ? "pending" : undefined} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-2">Reading this</p>
            <p className="mb-2">
              Every row balances: <strong>Opening + Received − Sold ± Adjustments = Closing</strong>.
            </p>
            <p className="mb-2">
              <strong>Received</strong> is stock that physically arrived on a purchase order that month.
              <strong> On order</strong> is stock booked with a supplier that has not arrived yet — it is not in
              the closing figure, because it is not on the shelf.
            </p>
            <p>
              <strong>Adjustments</strong> is everything else that moved the count: a manual correction, a
              cancelled order putting stock back, a return. It is shown rather than hidden so the row adds up.
              Opening and closing are worked back from the stock-change log, since nothing records a snapshot
              at a month boundary.
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the report.</div>
      )}
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <span className="text-lg text-gray-300 font-bold">{children}</span>;
}

function Fig({ label, value, tone, strong }: {
  label: string; value: string; tone?: "good" | "sold" | "pending"; strong?: boolean;
}) {
  const color = tone === "good" ? "text-green-700" : tone === "sold" ? "text-blue-700"
    : tone === "pending" ? "text-amber-700" : "text-gray-900";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`${strong ? "text-2xl" : "text-xl"} font-bold ${color}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Num({ v, tone, strong, signed, plus }: {
  v: number; tone?: "good" | "sold" | "pending" | "muted"; strong?: boolean; signed?: boolean; plus?: boolean;
}) {
  const color = tone === "good" ? "text-green-700" : tone === "sold" ? "text-blue-700"
    : tone === "pending" ? "text-amber-700" : tone === "muted" ? "text-gray-500" : "text-gray-700";
  const text = v === 0 ? "—" : signed ? `${v > 0 ? "+" : "−"}${n(Math.abs(v))}` : plus ? `+${n(v)}` : n(v);
  return (
    <td className={`px-3 py-3 text-right ${strong ? "font-bold text-gray-900" : "font-medium"} ${v === 0 ? "text-gray-300" : color}`}
      style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </td>
  );
}
