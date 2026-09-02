"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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

/** A product with its variants, and its own arithmetic.
 *
 * Seven hundred rows in one list is a list nobody reads, and the question is not
 * asked that way round: it is asked of a product, and only then — of whichever
 * one looks wrong — of its colours and sizes.
 */
interface Group {
  product: string;
  rows: Row[];
  opening: number; received: number; sold: number;
  other: number; closing: number; on_order: number;
  out_of_stock: number; owed: number;
}

function groupRows(rows: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    let g = map.get(r.product_name);
    if (!g) {
      g = {
        product: r.product_name, rows: [],
        opening: 0, received: 0, sold: 0, other: 0, closing: 0, on_order: 0,
        out_of_stock: 0, owed: 0,
      };
      map.set(r.product_name, g);
    }
    g.rows.push(r);
    g.opening += r.opening;
    g.received += r.received;
    g.sold += r.sold;
    g.other += r.other;
    g.closing += r.closing;
    g.on_order += r.on_order;
    if (r.closing < 0) g.owed += 1;
    else if (r.closing === 0) g.out_of_stock += 1;
  }
  // Busiest first, as the flat list was — but by product, so what actually
  // moved comes to the top rather than its loudest single size.
  return [...map.values()].sort(
    (a, b) => (b.sold + b.received) - (a.sold + a.received)
  );
}

export default function StockMovementPage() {
  const [data, setData] = useState<Movement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
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
  const productGroups = useMemo(
    () => groupRows(data?.rows ?? []),
    [data],
  );

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


          {/* Sizes across, colours down, and under each colour the three
              figures anyone actually comes here for. A column of 754 rows made
              the reader hold a product in their head while scrolling; laid out
              this way a whole product is one glance, and the three lines are
              named rather than left as numbers stacked in a box. */}
          {productGroups.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg py-10 text-center text-gray-400">
              Nothing moved in {data.period.label} for this search.
            </div>
          ) : productGroups.map(g => {
            const isOpen = open.has(g.product);
            const grid = grids.find(x => x.product === g.product);
            return (
              <div key={g.product} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => {
                    const next = new Set(open);
                    if (isOpen) next.delete(g.product); else next.add(g.product);
                    setOpen(next);
                  }}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-gray-50"
                >
                  <span className="font-semibold text-gray-900">
                    <span className="inline-block w-4 text-gray-400">{isOpen ? "▾" : "▸"}</span>
                    {g.product}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {grid ? `${grid.colours.length} colour${grid.colours.length === 1 ? "" : "s"} × ${grid.sizes.length} size${grid.sizes.length === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-4 text-sm whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span className="text-gray-500">sold <strong className="text-blue-700">{n(g.sold)}</strong></span>
                    <span className="text-gray-500">in hand <strong className="text-gray-900">{n(g.closing)}</strong></span>
                    {g.owed > 0 && (
                      <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-800">
                        {g.owed} owed
                      </span>
                    )}
                    {g.out_of_stock > 0 && (
                      <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800">
                        {g.out_of_stock} out of stock
                      </span>
                    )}
                    {g.owed === 0 && g.out_of_stock === 0 && (
                      <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-green-100 text-green-800">
                        All in stock
                      </span>
                    )}
                  </span>
                </button>

                {isOpen && grid && (
                  <div className="overflow-x-auto border-t border-gray-100">
                    <table className="text-sm" style={{ minWidth: `${230 + grid.sizes.length * 78}px` }}>
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-5 py-2.5 text-left sticky left-0 bg-gray-50 z-10">Colour</th>
                          {grid.sizes.map(sz => (
                            <th key={sz} className="px-3 py-2.5 text-center">{sz}</th>
                          ))}
                          <th className="px-4 py-2.5 text-center border-l border-gray-200">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grid.colours.map(c => {
                          const cells = grid.sizes.map(sz => grid.cell.get(`${c}|${sz}`));
                          const sum = (pick: (r: Row) => number) =>
                            cells.reduce((t, r) => t + (r ? pick(r) : 0), 0);
                          // The three figures, each on its own named line, so a
                          // number is never left to be guessed at from position.
                          const LINES: Array<{ key: string; label: string; pick: (r: Row) => number; cls: string }> = [
                            { key: "hand", label: "In hand",  pick: r => r.closing,  cls: "font-bold text-gray-900" },
                            { key: "sold", label: "Sold",     pick: r => r.sold,     cls: "text-blue-700 font-semibold" },
                            { key: "ord",  label: "On order", pick: r => r.on_order, cls: "text-amber-700 font-semibold" },
                          ];
                          return (
                            <Fragment key={c}>
                              {LINES.map((line, li) => (
                                <tr
                                  key={line.key}
                                  className={li === 0 ? "border-t-2 border-gray-200" : "border-t border-gray-50"}
                                >
                                  <td className="px-5 py-1.5 sticky left-0 bg-white z-10 whitespace-nowrap">
                                    {li === 0 ? (
                                      <span className="font-medium text-gray-900">{c}</span>
                                    ) : (
                                      <span className="inline-block w-3" />
                                    )}
                                    <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-400">
                                      {line.label}
                                    </span>
                                  </td>
                                  {cells.map((r, i) => {
                                    const v = r ? line.pick(r) : null;
                                    // A colour that was never made in a size is
                                    // not a zero of anything.
                                    if (!r) return <td key={i} className="px-3 py-1.5 text-center text-gray-200">·</td>;
                                    const outOfStock = line.key === "hand" && v === 0;
                                    const owed = line.key === "hand" && (v ?? 0) < 0;
                                    return (
                                      <td
                                        key={i}
                                        className={`px-3 py-1.5 text-center ${owed ? "text-red-700 font-bold" : outOfStock ? "text-red-500 font-semibold" : v === 0 ? "text-gray-300" : line.cls}`}
                                        style={{ fontVariantNumeric: "tabular-nums" }}
                                        title={owed ? `${Math.abs(v ?? 0)} already sold and owed` : outOfStock ? "Out of stock" : undefined}
                                      >
                                        {v === 0 && line.key !== "hand" ? "—" : n(v ?? 0)}
                                      </td>
                                    );
                                  })}
                                  <td
                                    className={`px-4 py-1.5 text-center border-l border-gray-200 bg-gray-50/60 ${line.cls}`}
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                  >
                                    {n(sum(line.pick))}
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}



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
              anything is sellable again. <strong>Opening</strong>,
              <strong> Received</strong> and <strong> Adjustments</strong> are in the
              summary above; the grids carry the three figures a buyer reaches for.
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


