"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

interface BackorderLine {
  order_id: string;
  order_number: string;
  order_date: string | null;
  order_status: string;
  payment_status: string;
  company_name: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  quantity: number;
  stock_on_hand: number;
  shortfall: number;
  expected_restock_date: string | null;
  still_backorderable: boolean;
  ready: boolean;
}

interface Queue {
  summary: { lines: number; units: number; ready_lines: number; orders: number };
  items: BackorderLine[];
}

const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export default function BackordersPage() {
  const [data, setData] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyReady, setOnlyReady] = useState(false);

  const load = useCallback((ready: boolean) => {
    setLoading(true);
    setError(null);
    apiClient
      .get<Queue>(`/api/v1/admin/backorders?only_ready=${ready}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the backorder queue."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(onlyReady); }, [load, onlyReady]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backorders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Orders taken while stock was short — what is owed, and what can go out now.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center gap-4">
        <button onClick={() => load(onlyReady)} disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyReady} onChange={e => setOnlyReady(e.target.checked)} />
          Only show lines the stock has arrived for
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && s ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label="Ready to ship" value={s.ready_lines.toLocaleString()} sub="stock has arrived" tone="good" />
            <Tile label="Waiting" value={(s.lines - s.ready_lines).toLocaleString()} sub="goods not in yet" tone="warn" />
            <Tile label="Units owed" value={s.units.toLocaleString()} sub="across all lines" />
            <Tile label="Orders affected" value={s.orders.toLocaleString()} sub="customers waiting" />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900 flex items-center justify-between flex-wrap gap-2">
              <span>{onlyReady ? "Ready to ship" : "All open backorders"}</span>
              <span className="text-xs font-normal text-gray-500">oldest order first</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Order</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-right">Owed</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3 text-left">Due in</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                      {onlyReady ? "Nothing is ready to ship yet." : "No open backorders — everything sold is in stock."}
                    </td></tr>
                  ) : data.items.map((l, i) => (
                    <tr key={`${l.order_number}-${l.sku}-${i}`} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/admin/orders/${l.order_id}`} className="font-semibold text-blue-700 hover:underline">
                          {l.order_number}
                        </Link>
                        <div className="text-[11px] text-gray-500">
                          {fmtDate(l.order_date) ?? "—"} · {l.payment_status}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{l.company_name}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {l.product_name}
                        <div className="text-[11px] text-gray-500">
                          {[l.color, l.size].filter(Boolean).join(" / ") || "—"} · <span className="font-mono">{l.sku}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {l.quantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        <span className={l.stock_on_hand < 0 ? "text-red-600 font-semibold" : "text-gray-700"}>
                          {l.stock_on_hand.toLocaleString()}
                        </span>
                        {l.shortfall > 0 && (
                          <div className="text-[11px] text-red-500">{l.shortfall.toLocaleString()} short overall</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {fmtDate(l.expected_restock_date) ?? <span className="text-gray-400">no PO dated</span>}
                      </td>
                      <td className="px-4 py-3">
                        {l.ready ? (
                          <span className="inline-block px-2 py-0.5 rounded border text-[11px] font-semibold bg-green-50 text-green-700 border-green-200">
                            Ready to ship
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
                            Waiting on stock
                          </span>
                        )}
                        {!l.still_backorderable && (
                          <div className="text-[11px] text-gray-400 mt-1">backorder since turned off</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-2">Reading this</p>
            <p className="mb-2">
              A line appears from the moment it is sold short until its order ships. <strong>On hand</strong> is the
              variant&rsquo;s current stock — negative means it is owed across every order waiting on it, not just this one.
            </p>
            <p className="mb-2">
              <strong>Ready to ship</strong> is worked out oldest order first, spending the shelf down as it goes. Stock is
              a shared pool, so two orders waiting on the same variant can&rsquo;t both be filled from one delivery — fill
              them in the order shown.
            </p>
            <p>
              When goods are received against a purchase order, the warehouse is emailed about the lines that delivery
              covers, so nothing sits waiting once it could have gone out.
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the backorder queue.</div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
