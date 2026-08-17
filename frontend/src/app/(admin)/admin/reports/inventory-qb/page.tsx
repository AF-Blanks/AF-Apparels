"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

type State = "ok" | "mismatch" | "negative_in_qb" | "not_in_qb" | "unknown";

interface Row {
  sku: string;
  product: string;
  color: string | null;
  size: string | null;
  app_stock: number;
  qb_qty: number | null;
  difference: number | null;
  qb_item_id: string | null;
  state: State;
}

interface Recon {
  qb_available: boolean;
  qb_error: string | null;
  summary: {
    variants: number;
    agreeing: number;
    mismatched: number;
    negative_in_qb: number;
    not_in_qb: number;
    app_units: number;
    qb_units: number;
    qb_short_by_units: number;
  };
  variants: Row[];
}

const num = (n: number) => n.toLocaleString();

const STATE: Record<State, { label: string; cls: string }> = {
  ok:             { label: "Agrees",        cls: "bg-green-50 text-green-700 border-green-200" },
  negative_in_qb: { label: "Negative in QB", cls: "bg-red-50 text-red-700 border-red-200" },
  mismatch:       { label: "Doesn't match",  cls: "bg-amber-50 text-amber-800 border-amber-200" },
  not_in_qb:      { label: "Not in QB",      cls: "bg-slate-100 text-slate-700 border-slate-300" },
  unknown:        { label: "Couldn't read",  cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

export default function InventoryQbReconciliation() {
  const [data, setData] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<Recon>(`/api/v1/admin/reports/inventory-qb-reconciliation?only_problems=${onlyProblems}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the comparison."))
      .finally(() => setLoading(false));
  }, [onlyProblems]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventory vs QuickBooks</h1>
        <p className="text-sm text-gray-500 mt-1">
          Where our stock and QuickBooks&rsquo; quantity on hand disagree, variant by variant.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center gap-4">
        <button onClick={load} disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Comparing…" : "Run comparison"}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
          Only show variants that disagree
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Reading QuickBooks…</div>
      ) : data && s ? (
        <>
          {!data.qb_available && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              QuickBooks couldn&rsquo;t be reached, so only our own stock is shown.
              {data.qb_error && <span className="block mt-1 font-mono text-xs">{data.qb_error}</span>}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label="Agrees" value={num(s.agreeing)} of={s.variants} tone="good" />
            <Tile label="Negative in QuickBooks" value={num(s.negative_in_qb)} of={s.variants} tone="bad" />
            <Tile label="Doesn't match" value={num(s.mismatched)} of={s.variants} tone="warn" />
            <Tile label="Never synced to QuickBooks" value={num(s.not_in_qb)} of={s.variants} tone="mute" />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 grid gap-4 sm:grid-cols-3 text-sm">
            <Fig label="Units in our system" value={num(s.app_units)} />
            <Fig label="Units in QuickBooks" value={num(s.qb_units)} />
            <Fig label="QuickBooks is short by" value={num(s.qb_short_by_units)} tone="bad"
              note="pieces missing across every variant QuickBooks knows about" />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900 flex items-center justify-between">
              <span>{onlyProblems ? "Variants that disagree" : "All variants"}</span>
              <span className="text-xs font-normal text-gray-500">{data.variants.length} shown</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-6 py-3 text-left">SKU</th>
                    <th className="px-6 py-3 text-right">Our Stock</th>
                    <th className="px-6 py-3 text-right">QuickBooks</th>
                    <th className="px-6 py-3 text-right">Difference</th>
                    <th className="px-6 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.variants.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Every variant agrees with QuickBooks.
                    </td></tr>
                  ) : data.variants.map(v => {
                    const st = STATE[v.state];
                    return (
                      <tr key={v.sku} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900">
                          {v.product}
                          <div className="text-[11px] text-gray-500">
                            {[v.color, v.size].filter(Boolean).join(" / ") || "—"}
                          </div>
                        </td>
                        <td className="px-6 py-3 font-mono text-[11px] text-gray-600">{v.sku}</td>
                        <td className="px-6 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {num(v.app_stock)}
                        </td>
                        <td className="px-6 py-3 text-right font-semibold"
                          style={{ fontVariantNumeric: "tabular-nums", color: (v.qb_qty ?? 0) < 0 ? "#dc2626" : undefined }}>
                          {v.qb_qty === null ? "—" : num(v.qb_qty)}
                        </td>
                        <td className="px-6 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {v.difference === null ? "—" : (
                            <span className={v.difference < 0 ? "text-red-600 font-semibold" : "text-gray-700"}>
                              {v.difference > 0 ? "+" : ""}{num(v.difference)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-2">Reading this</p>
            <p className="mb-2">
              <strong>Our Stock</strong> is what the website sells from and what the Inventory Value report uses.
              It is the figure to trust. <strong>QuickBooks</strong> is a copy, kept in step by the documents we
              send it, and a copy can fall behind.
            </p>
            <p className="mb-2">
              <strong>Negative in QuickBooks</strong> means goods were sold that QuickBooks was never told had
              arrived — a purchase whose bill couldn&rsquo;t carry its quantity. That path is now closed, so this
              list should stop growing.
            </p>
            <p>
              <strong>Never synced</strong> means the variant has no QuickBooks item at all, so its sales land on
              a generic line rather than against the product. Those don&rsquo;t go negative; they&rsquo;re simply absent.
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the comparison.</div>
      )}
    </div>
  );
}

function Tile({ label, value, of, tone }: { label: string; value: string; of: number; tone: "good" | "bad" | "warn" | "mute" }) {
  const color = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-slate-600";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">of {of.toLocaleString()} variants</p>
    </div>
  );
}

function Fig({ label, value, tone, note }: { label: string; value: string; tone?: "bad"; note?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === "bad" ? "text-red-600" : "text-gray-900"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </div>
  );
}
