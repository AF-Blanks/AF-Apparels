"use client";

/**
 * Markdown — moving a price up or down without losing the old one.
 *
 * A marked price stands in for the list price everywhere it would have been
 * used. It does not reach past a price a customer has been given of their own:
 * anyone on an agreed rate through Individual Variant Pricing keeps that rate,
 * sale or no sale. Clearing a mark brings the list price straight back, so
 * nothing has to be typed in again from memory.
 *
 * Marks are stored per variant, but they are decided by colour or by size — so
 * those are the handles this page offers, with a box per variant underneath for
 * when it really is one shirt.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Variant {
  variant_id: string;
  sku: string;
  color: string | null;
  size: string | null;
  retail_price: number;
  markdown_price: number | null;
}

interface ProductRow {
  product_id: string;
  product_name: string;
  slug: string;
  variant_count: number;
  marked_count: number;
  variants: Variant[];
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function MarkdownPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (onlyMarked) params.set("only_marked", "true");
      const qs = params.toString();
      const d = await apiClient.get<ProductRow[]>(
        `/api/v1/admin/products/markdown${qs ? `?${qs}` : ""}`
      );
      setRows(d || []);
    } catch (err: unknown) {
      setNote({ text: err instanceof Error ? err.message : "Could not load products.", ok: false });
    } finally {
      setLoading(false);
    }
  }, [q, onlyMarked]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  /** What is in a variant's box right now: the edit if there is one, else what is saved. */
  const shown = (v: Variant) =>
    edits[v.variant_id] ?? (v.markdown_price != null ? String(v.markdown_price) : "");

  const dirty = useMemo(() => Object.keys(edits).length > 0, [edits]);

  function setOne(variantId: string, value: string) {
    setEdits(p => ({ ...p, [variantId]: value }));
  }

  /** Put one figure across a whole colour, a whole size, or the whole product. */
  function applyMany(p: ProductRow, value: string, match: (v: Variant) => boolean) {
    setEdits(prev => {
      const next = { ...prev };
      p.variants.filter(match).forEach(v => { next[v.variant_id] = value; });
      return next;
    });
  }

  async function save() {
    const items = Object.entries(edits).map(([variant_id, raw]) => {
      const t = raw.trim();
      return { variant_id, price: t === "" ? null : Number(t) };
    });
    const bad = items.find(i => i.price !== null && (!Number.isFinite(i.price) || i.price <= 0));
    if (bad) {
      setNote({
        text: "A marked price has to be a number above zero. Leave a box empty to clear its mark.",
        ok: false,
      });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const r = await apiClient.post<{ updated: number; cleared: number }>(
        "/api/v1/admin/products/markdown", { items });
      setEdits({});
      await load();
      setNote({
        text: `${r.updated} price${r.updated !== 1 ? "s" : ""} marked`
          + (r.cleared ? `, ${r.cleared} cleared` : "") + ".",
        ok: true,
      });
    } catch (err: unknown) {
      setNote({ text: err instanceof Error ? err.message : "Could not save.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const colorsOf = (p: ProductRow) =>
    Array.from(new Set(p.variants.map(v => v.color).filter(Boolean))) as string[];
  const sizesOf = (p: ProductRow) =>
    Array.from(new Set(p.variants.map(v => v.size).filter(Boolean))) as string[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Markdown</h1>
        <p className="text-sm text-gray-500 mt-1">
          Move a price up or down for a product, a colour, a size, or one variant.
          The original is kept — clear a mark and it comes straight back. Customers
          on their own agreed price are not affected.
        </p>
      </div>

      {note && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${note.ok
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-800"}`}>
          {note.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search a product…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={onlyMarked} onChange={e => setOnlyMarked(e.target.checked)} />
          Only marked
        </label>
        {dirty && (
          <>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-md bg-[#1B3A5C] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Saving…" : `Save ${Object.keys(edits).length} change${Object.keys(edits).length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => setEdits({})}
              disabled={busy}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
              Discard
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center">No products found.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y">
          {rows.map(p => {
            const isOpen = open === p.product_id;
            return (
              <div key={p.product_id}>
                <button
                  onClick={() => setOpen(isOpen ? null : p.product_id)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50">
                  <span className="font-semibold text-gray-900">
                    {p.product_name}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {p.variant_count} variants
                    </span>
                    {p.marked_count > 0 && (
                      <span className="ml-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        {p.marked_count} marked
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 bg-gray-50/60">
                    {/* The handles people actually reach for: a colour, a size, or
                        the lot. Typed here, spread across every variant it covers —
                        and still only written when Save is pressed. */}
                    <div className="flex flex-wrap items-end gap-4 py-4">
                      <BulkBox label="Whole product"
                        onApply={v => applyMany(p, v, () => true)} />
                      <BulkBox label="One colour" options={colorsOf(p)}
                        onApply={(v, pick) => applyMany(p, v, x => x.color === pick)} />
                      <BulkBox label="One size" options={sizesOf(p)}
                        onApply={(v, pick) => applyMany(p, v, x => x.size === pick)} />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b">
                            <th className="py-2 pr-3">Colour</th>
                            <th className="py-2 pr-3">Size</th>
                            <th className="py-2 pr-3">SKU</th>
                            <th className="py-2 pr-3 text-right">List price</th>
                            <th className="py-2 pr-3 text-right">Marked price</th>
                            <th className="py-2 text-right">Sells at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.variants.map(v => {
                            const typed = shown(v);
                            const n = typed.trim() === "" ? null : Number(typed);
                            const sells = n != null && Number.isFinite(n) && n > 0 ? n : v.retail_price;
                            const changed = v.variant_id in edits;
                            return (
                              <tr key={v.variant_id}
                                  className={`border-b last:border-0 ${changed ? "bg-amber-50/60" : ""}`}>
                                <td className="py-2 pr-3">{v.color || "—"}</td>
                                <td className="py-2 pr-3">{v.size || "—"}</td>
                                <td className="py-2 pr-3 text-xs text-gray-500">{v.sku}</td>
                                <td className="py-2 pr-3 text-right text-gray-500"
                                    style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {money(v.retail_price)}
                                </td>
                                <td className="py-2 pr-3 text-right">
                                  <input
                                    value={typed}
                                    onChange={e => setOne(v.variant_id, e.target.value.replace(/[^0-9.]/g, ""))}
                                    placeholder="—"
                                    inputMode="decimal"
                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                                  />
                                </td>
                                <td className="py-2 text-right font-semibold"
                                    style={{
                                      fontVariantNumeric: "tabular-nums",
                                      color: sells < v.retail_price ? "#B45309"
                                        : sells > v.retail_price ? "#15803D" : "#111827",
                                    }}>
                                  {money(sells)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                      Leave a box empty to clear its mark — the list price returns.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A price, and where it applies to a group, which group. */
function BulkBox({
  label, options, onApply,
}: {
  label: string;
  options?: string[];
  onApply: (value: string, pick: string) => void;
}) {
  const [value, setValue] = useState("");
  const [pick, setPick] = useState("");
  const ready = (options ? pick !== "" : true) && value.trim() !== "";

  return (
    <div>
      <div className="text-xs font-bold text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        {options && (
          <select
            value={pick}
            onChange={e => setPick(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm">
            <option value="">Choose…</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <input
          value={value}
          onChange={e => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Price"
          inputMode="decimal"
          className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm text-right"
        />
        <button
          type="button"
          disabled={!ready}
          onClick={() => { onApply(value, pick); setValue(""); }}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Apply
        </button>
      </div>
    </div>
  );
}
