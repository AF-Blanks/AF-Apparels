"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

type RowState = "up" | "down" | "same" | "new" | "stopped";

interface Row {
  product_name: string;
  color: string;
  size: string;
  units: number;
  prev_units: number;
  units_change: number;
  units_change_pct: number | null;
  revenue: number;
  prev_revenue: number;
  revenue_change: number;
  state: RowState;
}

interface MonthOption { value: string; label: string }

interface Comparison {
  period: MonthOption;
  compare: MonthOption;
  available_months: MonthOption[];
  summary: {
    variants: number;
    units: number; prev_units: number; units_change: number; units_change_pct: number | null;
    revenue: number; prev_revenue: number; revenue_change: number; revenue_change_pct: number | null;
    improved: number; declined: number;
  };
  rows: Row[];
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATE: Record<RowState, { label: string; cls: string }> = {
  up:      { label: "Up",        cls: "bg-green-50 text-green-700 border-green-200" },
  new:     { label: "New",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  down:    { label: "Down",      cls: "bg-amber-50 text-amber-800 border-amber-200" },
  stopped: { label: "Stopped",   cls: "bg-red-50 text-red-700 border-red-200" },
  same:    { label: "No change", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

const FILTERS: { id: string; label: string; keep: (r: Row) => boolean }[] = [
  { id: "all",     label: "All",          keep: () => true },
  { id: "up",      label: "Selling more", keep: r => r.state === "up" || r.state === "new" },
  { id: "down",    label: "Selling less", keep: r => r.state === "down" || r.state === "stopped" },
  { id: "stopped", label: "Stopped",      keep: r => r.state === "stopped" },
];

/** A product with its variants, and the product's own totals.
 *
 * Three hundred and twenty eight rows in one list is a list nobody reads. The
 * question is asked product first — "how did 1001 do" — and only then, of the
 * product that stands out, colour and size. So the report is shaped the way the
 * question is, and opens one product at a time.
 */
interface ProductGroup {
  product_name: string;
  rows: Row[];
  units: number;
  prev_units: number;
  units_change: number;
  revenue: number;
  revenue_change: number;
  stopped: number;
  down: number;
  up: number;
}

function groupByProduct(rows: Row[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const r of rows) {
    let g = map.get(r.product_name);
    if (!g) {
      g = {
        product_name: r.product_name, rows: [],
        units: 0, prev_units: 0, units_change: 0,
        revenue: 0, revenue_change: 0,
        stopped: 0, down: 0, up: 0,
      };
      map.set(r.product_name, g);
    }
    g.rows.push(r);
    g.units += r.units;
    g.prev_units += r.prev_units;
    g.units_change += r.units_change;
    g.revenue += r.revenue;
    g.revenue_change += r.revenue_change;
    if (r.state === "stopped") g.stopped += 1;
    else if (r.state === "down") g.down += 1;
    else if (r.state === "up" || r.state === "new") g.up += 1;
  }
  // Biggest movers first, as before — but by product now, so the one that
  // actually shifted is at the top rather than its loudest single size.
  return [...map.values()].sort(
    (a, b) => Math.abs(b.units_change) - Math.abs(a.units_change)
  );
}

export default function VariantComparisonPage() {
  const [data, setData] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [compareTo, setCompareTo] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback((m?: string, c?: string, q?: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (m) params.set("month", m);
    if (c) params.set("compare_to", c);
    if (q && q.trim()) params.set("q", q.trim());
    apiClient
      .get<Comparison>(`/api/v1/admin/reports/variant-sales-comparison?${params.toString()}`)
      .then(res => {
        setData(res);
        setMonth(res.period.value);
        setCompareTo(res.compare.value);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the comparison."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const keep = FILTERS.find(f => f.id === filter)?.keep ?? (() => true);
  const rows = (data?.rows ?? []).filter(keep);
  const groups = groupByProduct(rows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Variant Sales Comparison</h1>
        <p className="text-sm text-gray-500 mt-1">
          One month against another, down to the colour and size — what is selling more, and what has fallen away.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Show</span>
          <select value={month} onChange={e => { setMonth(e.target.value); load(e.target.value, compareTo, search); }}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[150px]">
            {(data?.available_months ?? []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Compare to</span>
          <select value={compareTo} onChange={e => { setCompareTo(e.target.value); load(month, e.target.value, search); }}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[150px]">
            {(data?.available_months ?? []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[220px]">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Product, colour or size</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") load(month, compareTo, search); }}
            placeholder="e.g. 1001 pink 3XL"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <button onClick={() => load(month, compareTo, search)} disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Compare"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && s ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label="Units sold" value={s.units.toLocaleString()}
              sub={`${s.prev_units.toLocaleString()} in ${data.compare.label}`}
              change={s.units_change} pct={s.units_change_pct} />
            <Tile label="Revenue" value={money(s.revenue)}
              sub={`${money(s.prev_revenue)} in ${data.compare.label}`}
              change={s.revenue_change} pct={s.revenue_change_pct} isMoney />
            <Tile label="Selling more" value={s.improved.toLocaleString()} sub="variants up or newly selling" tone="good" />
            <Tile label="Selling less" value={s.declined.toLocaleString()} sub="variants down or stopped" tone="bad" />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
                  filter === f.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900 flex items-center justify-between flex-wrap gap-2">
              <span>{data.period.label} vs {data.compare.label}</span>
              <span className="text-xs font-normal text-gray-500">
                <span className="mr-3">
                  {groups.length} product{groups.length === 1 ? "" : "s"} ·{" "}
                  {rows.length.toLocaleString()} variant{rows.length === 1 ? "" : "s"} · biggest changes first
                </span>
                <button
                  onClick={() => setOpen(new Set(groups.map(g => g.product_name)))}
                  className="text-xs text-blue-600 hover:underline mr-2"
                >
                  Expand all
                </button>
                <button
                  onClick={() => setOpen(new Set())}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Collapse all
                </button>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left">Colour</th>
                    <th className="px-4 py-3 text-left">Size</th>
                    <th className="px-4 py-3 text-right">{data.period.label}</th>
                    <th className="px-4 py-3 text-right">{data.compare.label}</th>
                    <th className="px-4 py-3 text-right">Change</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groups.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                      Nothing sold in either month for this filter.
                    </td></tr>
                  ) : groups.map(g => {
                    const isOpen = open.has(g.product_name);
                    return (
                      <Fragment key={g.product_name}>
                        {/* The product line: the whole answer for most questions,
                            and the way in when it is not. */}
                        <tr
                          className="bg-white hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            const next = new Set(open);
                            if (isOpen) next.delete(g.product_name);
                            else next.add(g.product_name);
                            setOpen(next);
                          }}
                        >
                          <td className="px-6 py-3 font-semibold text-gray-900" colSpan={3}>
                            <span className="inline-block w-4 text-gray-400">
                              {isOpen ? "▾" : "▸"}
                            </span>
                            {g.product_name}
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              {g.rows.length} variant{g.rows.length === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {g.units.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {g.prev_units.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                            <span className={g.units_change > 0 ? "text-green-700 font-bold" : g.units_change < 0 ? "text-red-600 font-bold" : "text-gray-400"}>
                              {g.units_change > 0 ? "+" : ""}{g.units_change.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {money(g.revenue)}
                            {g.revenue_change !== 0 && (
                              <div className={`text-[11px] font-normal ${g.revenue_change > 0 ? "text-green-600" : "text-red-500"}`}>
                                {g.revenue_change > 0 ? "+" : ""}{money(g.revenue_change)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {/* How this product's sizes are behaving, counted, so
                                one worth opening says so while still closed. */}
                            <div className="flex flex-wrap gap-1">
                              {g.up > 0 && <span className="px-1.5 py-0.5 rounded border text-[11px] bg-green-50 text-green-700 border-green-200">{g.up} up</span>}
                              {g.down > 0 && <span className="px-1.5 py-0.5 rounded border text-[11px] bg-amber-50 text-amber-800 border-amber-200">{g.down} down</span>}
                              {g.stopped > 0 && <span className="px-1.5 py-0.5 rounded border text-[11px] bg-red-50 text-red-700 border-red-200">{g.stopped} stopped</span>}
                            </div>
                          </td>
                        </tr>

                        {isOpen && g.rows.map((r, i) => {
                          const st = STATE[r.state];
                          return (
                            <tr key={`${r.color}|${r.size}|${i}`} className="bg-gray-50/60 hover:bg-gray-100/60 text-[13px]">
                              <td className="px-6 py-2 pl-14"></td>
                              <td className="px-4 py-2 text-gray-700">{r.color}</td>
                              <td className="px-4 py-2 text-gray-700">{r.size}</td>
                              <td className="px-4 py-2 text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {r.units.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {r.prev_units.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                                <span className={r.units_change > 0 ? "text-green-700 font-semibold" : r.units_change < 0 ? "text-red-600 font-semibold" : "text-gray-400"}>
                                  {r.units_change > 0 ? "+" : ""}{r.units_change.toLocaleString()}
                                </span>
                                {r.units_change_pct !== null && r.units_change !== 0 && (
                                  <div className="text-[11px] text-gray-400">
                                    {r.units_change_pct > 0 ? "+" : ""}{r.units_change_pct}%
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {money(r.revenue)}
                                {r.revenue_change !== 0 && (
                                  <div className={`text-[11px] ${r.revenue_change > 0 ? "text-green-600" : "text-red-500"}`}>
                                    {r.revenue_change > 0 ? "+" : ""}{money(r.revenue_change)}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded border text-[11px] ${st.cls}`}>
                                  {st.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            Cancelled and refunded orders are left out. Months start at August 2026, when the shop opened — there is
            nothing before it to compare against. A variant that sold nothing in the earlier month shows as
            <strong> New</strong> rather than a percentage, because a rise from zero has no meaningful percentage.
          </p>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the comparison.</div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, change, pct, tone, isMoney }: {
  label: string; value: string; sub: string;
  change?: number; pct?: number | null; tone?: "good" | "bad"; isMoney?: boolean;
}) {
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const color = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {change !== undefined && change !== 0 && (
        <p className={`text-sm font-semibold mt-1 ${up ? "text-green-700" : down ? "text-red-600" : "text-gray-500"}`}>
          {up ? "↑" : "↓"} {isMoney ? money(Math.abs(change)) : Math.abs(change).toLocaleString()}
          {pct !== null && pct !== undefined && ` (${pct > 0 ? "+" : ""}${pct}%)`}
        </p>
      )}
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
