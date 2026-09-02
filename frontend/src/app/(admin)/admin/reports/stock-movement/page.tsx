"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { SIZE_ORDER } from "@/lib/utils";

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
  period: MonthOption & { from?: string; to?: string };
  available_months: MonthOption[];
  summary: {
    variants: number;
    opening: number; sold: number; received: number;
    other: number; closing: number; on_order: number;
  };
  rows: Row[];
}

const n = (v: number) => v.toLocaleString();
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf((s ?? "").toUpperCase());
  return i === -1 ? 900 : i;
};

export default function StockMovementPage() {
  const [data, setData] = useState<Movement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [showList, setShowList] = useState(false);
  // A whole month is the usual question; a range is for the times it is not —
  // a season, or the week either side of a delivery.
  const [mode, setMode] = useState<"month" | "range">("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback((m?: string, q?: string, range?: { from: string; to: string } | null) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (range?.from && range?.to) {
      params.set("date_from", range.from);
      params.set("date_to", range.to);
    } else if (m) {
      params.set("month", m);
    }
    if (q && q.trim()) params.set("q", q.trim());
    apiClient
      .get<Movement>(`/api/v1/admin/reports/stock-movement?${params.toString()}`)
      .then(res => {
        setData(res);
        if (res.period.value) setMonth(res.period.value);
        if (res.period.from && !from) setFrom(res.period.from);
        if (res.period.to && !to) setTo(res.period.to);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the report."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // One grid per product: colours down, sizes across. A variant list runs to
  // hundreds of rows for a single tee; the same figures as a grid fit on a screen.
  const grids = useMemo(() => {
    const byProduct = new Map<string, Row[]>();
    for (const r of data?.rows ?? []) {
      const list = byProduct.get(r.product_name) ?? [];
      list.push(r);
      byProduct.set(r.product_name, list);
    }
    return [...byProduct.entries()].map(([product, rows]) => {
      const colours = [...new Set(rows.map(r => r.color))].sort();
      const sizes = [...new Set(rows.map(r => r.size))].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
      const cell = new Map<string, Row>();
      for (const r of rows) cell.set(`${r.color}|${r.size}`, r);
      return { product, colours, sizes, cell, rows };
    }).sort((a, b) => a.product.localeCompare(b.product));
  }, [data]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock Movement</h1>
        <p className="text-sm text-gray-500 mt-1">
          For every variant: what you started the period with, what sold, what arrived, and what is still on order.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Period</span>
          <select
            value={mode}
            onChange={e => {
              const next = e.target.value as "month" | "range";
              setMode(next);
              if (next === "month") load(month, search, null);
            }}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="month">A month</option>
            <option value="range">Between two dates</option>
          </select>
        </label>

        {mode === "month" ? (
          <label className="text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Month</span>
            <select
              value={month}
              onChange={e => { setMonth(e.target.value); load(e.target.value, search, null); }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[160px]"
            >
              {(data?.available_months ?? []).map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">From</span>
              <input type="date" value={from} max={to || undefined}
                onChange={e => setFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">To</span>
              <input type="date" value={to} min={from || undefined}
                onChange={e => setTo(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </label>
          </>
        )}
        <label className="text-sm flex-1 min-w-[240px]">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Product, colour or size</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                load(month, search, mode === "range" && from && to ? { from, to } : null);
              }
            }}
            placeholder="e.g. 1001 pink 3XL"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => load(month, search, mode === "range" && from && to ? { from, to } : null)}
          disabled={loading || (mode === "range" && !(from && to))}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Show"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && s ? (
        <>
          {/* The whole period as one line of arithmetic */}
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
              {s.other !== 0 && (<><Op>{s.other > 0 ? "+" : "−"}</Op><Fig label="Adjustments" value={n(Math.abs(s.other))} tone="adjust" /></>)}
              <Op>=</Op>
              <Fig label="In hand" value={n(s.closing)} strong />
              <div className="ml-auto pl-4 border-l border-gray-200">
                <Fig label="Still on order" value={n(s.on_order)} tone="pending" />
              </div>
            </div>
          </div>


          {/* One row per variant, everything spelled out. This is the view
              people actually read: the grid packs three numbers into a box the
              size of a thumbnail, which is fine for scanning sizes and no use
              at all for answering "how many of this do we have". */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="font-semibold text-gray-900">
                Every variant — {n(data.rows.length)} row{data.rows.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {data.period.label}. Opening + Received − Sold ± Adjustments = In hand.
              </p>
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
                    <th className="px-3 py-3 text-right">Adjustments</th>
                    <th className="px-3 py-3 text-right">In hand</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-right">On order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map(r => (
                    <tr key={r.variant_id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900">
                        {r.product_name}
                        <div className="text-[11px] text-gray-400 font-mono">{r.sku}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{r.color}</td>
                      <td className="px-3 py-3 text-gray-700">{r.size}</td>
                      <Num v={r.opening} />
                      <Num v={r.received} tone="#15803d" plus />
                      <Num v={r.sold} tone="#1d4ed8" />
                      <Num v={r.other} tone="#7c3aed" signed />
                      <Num v={r.closing} strong />
                      <td className="px-3 py-3"><Status closing={r.closing} on_order={r.on_order} /></td>
                      <Num v={r.on_order} tone="#b45309" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* The size grid, for scanning a whole product at once. */}
          <details className="bg-white border border-gray-200 rounded-lg" open={showList}
            onToggle={e => setShowList((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="px-6 py-4 font-semibold text-gray-900 cursor-pointer">
              Size grid — every colour against every size
            </summary>
            <div className="border-t border-gray-100 p-4 space-y-4">
              {grids.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg py-10 text-center text-gray-400">
                  Nothing moved in {data.period.label} for this search.
                </div>
              ) : grids.map(g => (
                <div key={g.product} className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-gray-900">{g.product}</span>
                    <span className="text-xs text-gray-500">
                      {g.colours.length} colour{g.colours.length === 1 ? "" : "s"} · {g.sizes.length} size{g.sizes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-sm" style={{ minWidth: `${190 + g.sizes.length * 88}px` }}>
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-5 py-2.5 text-left sticky left-0 bg-gray-50">Colour</th>
                          {g.sizes.map(sz => <th key={sz} className="px-3 py-2.5 text-center">{sz}</th>)}
                          <th className="px-4 py-2.5 text-center border-l border-gray-200">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {g.colours.map(c => {
                          const cells = g.sizes.map(sz => g.cell.get(`${c}|${sz}`));
                          const tot = {
                            closing: cells.reduce((t, r) => t + (r?.closing ?? 0), 0),
                            sold: cells.reduce((t, r) => t + (r?.sold ?? 0), 0),
                            on_order: cells.reduce((t, r) => t + (r?.on_order ?? 0), 0),
                          };
                          return (
                            <tr key={c} className="hover:bg-gray-50">
                              <td className="px-5 py-2.5 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">{c}</td>
                              {g.sizes.map((sz, i) => <Cell key={sz} r={cells[i]} />)}
                              <td className="px-4 py-2.5 border-l border-gray-200 bg-gray-50/60"><Stack {...tot} strong /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td className="px-5 py-2.5 font-bold text-gray-900 sticky left-0 bg-gray-50">Total</td>
                          {g.sizes.map(sz => {
                            const col = g.colours.map(c => g.cell.get(`${c}|${sz}`));
                            return (
                              <td key={sz} className="px-3 py-2.5">
                                <Stack
                                  closing={col.reduce((t, r) => t + (r?.closing ?? 0), 0)}
                                  sold={col.reduce((t, r) => t + (r?.sold ?? 0), 0)}
                                  on_order={col.reduce((t, r) => t + (r?.on_order ?? 0), 0)}
                                  strong
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 border-l border-gray-200">
                            <Stack
                              closing={g.rows.reduce((t, r) => t + r.closing, 0)}
                              sold={g.rows.reduce((t, r) => t + r.sold, 0)}
                              on_order={g.rows.reduce((t, r) => t + r.on_order, 0)}
                              strong
                            />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </details>

          <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-2">Reading this</p>
            <p className="mb-2">
              Every row balances: <strong>Opening + Received − Sold ± Adjustments = In hand</strong>.
              <strong> Opening</strong> is what was on the shelf when the period began,
              <strong> In hand</strong> what is there now.
              <strong> Adjustments</strong> is anything that was neither a sale nor a
              delivery — a stock count correction, a return put back, a cancelled
              order restocked.
            </p>
            <p className="mb-2">
              <strong>On order</strong> is stock booked with a supplier that hasn&rsquo;t arrived. It is kept out of
              the in-hand figure on purpose — it isn&rsquo;t on the shelf yet.
            </p>
            <p>
              <strong>Owed</strong> means in hand has gone below zero: those pieces are
              already sold to somebody and the next delivery pays them off before
              anything is sellable again. The <strong>size grid</strong> below packs the
              same figures into one box per colour and size, for scanning a whole
              product at once.
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the report.</div>
      )}
    </div>
  );
}

/** One colour × size box: stock in hand, with what sold and what is still coming. */
function Cell({ r }: { r?: Row }) {
  if (!r) return <td className="px-3 py-2.5 text-center text-gray-200">·</td>;
  return <td className="px-3 py-2.5"><Stack closing={r.closing} sold={r.sold} on_order={r.on_order} /></td>;
}

function Stack({ closing, sold, on_order, strong }: {
  closing: number; sold: number; on_order: number; strong?: boolean;
}) {
  const quiet = closing === 0 && sold === 0 && on_order === 0;
  if (quiet) return <div className="text-center text-gray-200">—</div>;
  return (
    <div className="text-center leading-tight" style={{ fontVariantNumeric: "tabular-nums" }}>
      <div className={`${strong ? "font-bold" : "font-semibold"} ${closing === 0 ? "text-gray-300" : "text-gray-900"}`}>
        {n(closing)}
      </div>
      <div className="text-[11px] mt-0.5 whitespace-nowrap">
        <span className={sold ? "text-blue-600" : "text-gray-300"} title="sold this month">↓{n(sold)}</span>
        {on_order > 0 && <span className="text-amber-600 ml-1.5" title="on order, not yet arrived">+{n(on_order)}</span>}
      </div>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <span className="text-lg text-gray-300 font-bold">{children}</span>;
}

function Fig({ label, value, tone, strong }: {
  label: string; value: string; tone?: "good" | "sold" | "pending" | "adjust"; strong?: boolean;
}) {
  const color = tone === "good" ? "text-green-700" : tone === "sold" ? "text-blue-700"
    : tone === "pending" ? "text-amber-700" : tone === "adjust" ? "text-violet-700" : "text-gray-900";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`${strong ? "text-2xl" : "text-xl"} font-bold ${color}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

/** Where this variant stands, in words.
 *
 * A number alone makes a reader do the work: 0 and 3 and 400 all look the same
 * at a glance down a column of figures. Negative in hand is not a shortage of
 * nothing — it is stock already promised to somebody, which is a different
 * problem and reads as one.
 */
function Status({ closing, on_order }: { closing: number; on_order: number }) {
  const pill = "inline-block rounded px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";

  if (closing < 0) {
    return (
      <span className={`${pill} bg-red-100 text-red-800`}>
        Owed {n(Math.abs(closing))}
      </span>
    );
  }
  if (closing === 0) {
    return (
      <span className={`${pill} ${on_order > 0 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
        {on_order > 0 ? "Out of stock — on order" : "Out of stock"}
      </span>
    );
  }
  if (closing <= 10) {
    return <span className={`${pill} bg-amber-100 text-amber-800`}>Low — {n(closing)} left</span>;
  }
  return <span className={`${pill} bg-green-100 text-green-800`}>In stock</span>;
}

function Num({ v, tone, strong, signed, plus }: {
  v: number; tone?: string; strong?: boolean; signed?: boolean; plus?: boolean;
}) {
  const text = v === 0 ? "—" : signed ? `${v > 0 ? "+" : "−"}${n(Math.abs(v))}` : plus ? `+${n(v)}` : n(v);
  return (
    <td className={`px-3 py-3 text-right ${strong ? "font-bold" : "font-medium"}`}
      style={{ fontVariantNumeric: "tabular-nums", color: v === 0 ? "#d1d5db" : strong ? "#111827" : tone ?? "#374151" }}>
      {text}
    </td>
  );
}
