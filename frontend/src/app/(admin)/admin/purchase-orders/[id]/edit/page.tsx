"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";

// ── Types ───────────────────────────────────────────────────────────────────
interface Manufacturer { id: string; name: string; }
interface SearchProduct { id: string; name: string; slug: string; }
interface FullVariant { id: string; sku: string; color: string | null; size: string | null; stock_quantity: number; cost_per_item: string | null; }

interface POLineItem {
  product_variant_id: string | null;
  product_name: string | null;
  variant_color: string | null;
  variant_size: string | null;
  new_product_name: string | null;
  new_product_color: string | null;
  new_product_size: string | null;
  qty_ordered: number;
  unit_cost_expected: number;
}
interface PODetail {
  id: string;
  po_number: string;
  manufacturer_id: string | null;
  status: string;
  expected_delivery: string | null;
  notes: string | null;
  total_received: number;
  qb_synced: boolean;
  line_items: POLineItem[];
}

// A flat, editable row.
interface EditItem {
  key: string;
  product_variant_id: string | null;
  product_name: string;
  color: string;
  size: string;
  qty_ordered: number;
  unit_cost_expected: number;
}

const INPUT: React.CSSProperties = { padding: "7px 9px", border: "1px solid #D1D5DB", borderRadius: "6px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "#fff" };
let _k = 0;
const nextKey = () => `r${++_k}-${Date.now()}`;

export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [po, setPo] = useState<PODetail | null>(null);
  const [locked, setLocked] = useState(false);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // product search (to add existing products)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [poData, mfrs] = await Promise.all([
          apiClient.get<PODetail>(`/api/v1/admin/purchase-orders/${id}`),
          apiClient.get<Manufacturer[]>("/api/v1/admin/purchase-orders/manufacturers"),
        ]);
        setManufacturers(Array.isArray(mfrs) ? mfrs : []);
        setPo(poData);
        setManufacturerId(poData.manufacturer_id ?? "");
        setExpectedDelivery(poData.expected_delivery ? poData.expected_delivery.slice(0, 10) : "");
        setNotes(poData.notes ?? "");
        // A PO that's been received or synced can't be edited (server enforces this too).
        if (poData.qb_synced || (poData.total_received ?? 0) > 0 || ["received", "partial", "closed", "cancelled"].includes(poData.status)) {
          setLocked(true);
        }
        setItems((poData.line_items ?? []).map(li => ({
          key: nextKey(),
          product_variant_id: li.product_variant_id,
          product_name: li.product_name || li.new_product_name || "—",
          color: li.variant_color ?? li.new_product_color ?? "",
          size: li.variant_size ?? li.new_product_size ?? "",
          qty_ordered: li.qty_ordered,
          unit_cost_expected: li.unit_cost_expected,
        })));
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load purchase order");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Item helpers ──────────────────────────────────────────────────────────
  function patchItem(key: string, patch: Partial<EditItem>) {
    setItems(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it));
  }
  function removeItem(key: string) {
    setItems(prev => prev.filter(it => it.key !== key));
  }
  function addCustomItem() {
    setItems(prev => [...prev, { key: nextKey(), product_variant_id: null, product_name: "", color: "", size: "", qty_ordered: 0, unit_cost_expected: 0 }]);
  }

  // ── Product search (add existing product's variants) ───────────────────────
  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await apiClient.get<SearchProduct[]>(`/api/v1/admin/products?q=${encodeURIComponent(q)}&page_size=10`);
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
    }, 300);
  }, []);

  async function addProduct(product: SearchProduct) {
    setQuery("");
    setResults([]);
    setLoadingVariants(true);
    try {
      const detail = await apiClient.get<{ variants: FullVariant[] }>(`/api/v1/admin/products/${product.slug}`);
      const existingIds = new Set(items.map(i => i.product_variant_id).filter(Boolean));
      const newRows: EditItem[] = (detail.variants ?? [])
        .filter(v => !existingIds.has(v.id))   // don't duplicate a variant already on the PO
        .map(v => ({
          key: nextKey(),
          product_variant_id: v.id,
          product_name: product.name,
          color: v.color ?? "",
          size: v.size ?? "",
          qty_ordered: 0,
          unit_cost_expected: parseFloat(v.cost_per_item ?? "0") || 0,
        }));
      if (newRows.length === 0) {
        setError("All of that product's variants are already on this PO.");
        setTimeout(() => setError(null), 3000);
      } else {
        setItems(prev => [...prev, ...newRows]);
      }
    } catch {
      setError("Couldn't load that product's variants.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoadingVariants(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const total = items.reduce((s, i) => s + (i.qty_ordered || 0) * (i.unit_cost_expected || 0), 0);

  async function save() {
    if (!manufacturerId) { setError("Please choose a manufacturer."); return; }
    const lineItems = items
      .filter(i => (i.qty_ordered || 0) > 0)
      .map(i => i.product_variant_id
        ? { product_variant_id: i.product_variant_id, qty_ordered: i.qty_ordered, unit_cost_expected: i.unit_cost_expected }
        : { new_product_name: i.product_name || "Item", new_product_color: i.color || null, new_product_size: i.size || null, qty_ordered: i.qty_ordered, unit_cost_expected: i.unit_cost_expected });
    if (lineItems.length === 0) { setError("Add at least one item with a quantity greater than 0."); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient.put(`/api/v1/admin/purchase-orders/${id}`, {
        manufacturer_id: manufacturerId,
        expected_delivery: expectedDelivery || null,
        notes: notes || null,
        line_items: lineItems,
      });
      router.push(`/admin/purchase-orders/${id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save changes");
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: "40px", color: "#6B7280" }}>Loading…</div>;
  if (!po) return <div style={{ padding: "40px", color: "#EF4444" }}>{error || "Purchase order not found."}</div>;

  if (locked) {
    return (
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px 16px" }}>
        <button onClick={() => router.push(`/admin/purchase-orders/${id}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: "13px", marginBottom: "12px" }}>← Back to PO</button>
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "10px", padding: "18px 20px", fontSize: "14px", lineHeight: 1.6 }}>
          <strong>This purchase order can’t be edited.</strong><br />
          Items have already been received or it’s been synced to QuickBooks, so its
          line items are locked to keep stock and accounting figures accurate.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "24px 16px" }}>
      <button onClick={() => router.push(`/admin/purchase-orders/${id}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: "13px", marginBottom: "8px" }}>← Back to PO</button>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C", marginBottom: "4px" }}>Edit {po.po_number}</h1>
      <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px" }}>Add, remove, or adjust items and save. You can build a draft up over several sittings.</p>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {/* Header fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>Manufacturer</label>
          <select value={manufacturerId} onChange={e => setManufacturerId(e.target.value)} style={{ ...INPUT, width: "100%" }}>
            <option value="">Select manufacturer…</option>
            {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>Expected Delivery</label>
          <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} style={{ ...INPUT, width: "100%" }} />
        </div>
      </div>
      <div style={{ marginBottom: "22px" }}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...INPUT, width: "100%", resize: "vertical" }} />
      </div>

      {/* Add existing product */}
      <div style={{ position: "relative", marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>Add a product</label>
        <input
          value={query}
          onChange={e => runSearch(e.target.value)}
          placeholder="Search products by name or code…"
          style={{ ...INPUT, width: "100%" }} />
        {loadingVariants && <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>Loading variants…</div>}
        {results.length > 0 && (
          <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", marginTop: "4px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: "240px", overflowY: "auto" }}>
            {results.map(p => (
              <button key={p.id} onClick={() => addProduct(p)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #F3F4F6", cursor: "pointer", fontSize: "13px", color: "#111827" }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items table */}
      <div style={{ border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["PRODUCT", "COLOR", "SIZE", "QTY", "UNIT COST ($)", "TOTAL", ""].map((h, i) => (
                  <th key={i} style={{ padding: "9px 12px", textAlign: i >= 3 && i <= 5 ? "right" : "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No items yet. Search a product above or add a custom item.</td></tr>
              ) : items.map(it => {
                const isCustom = !it.product_variant_id;
                return (
                  <tr key={it.key} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontSize: "13px" }}>
                      {isCustom
                        ? <input value={it.product_name} onChange={e => patchItem(it.key, { product_name: e.target.value })} placeholder="Item name" style={{ ...INPUT, width: "160px" }} />
                        : <span style={{ fontWeight: 600, color: "#111827" }}>{it.product_name}</span>}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: "13px" }}>
                      {isCustom
                        ? <input value={it.color} onChange={e => patchItem(it.key, { color: e.target.value })} placeholder="Color" style={{ ...INPUT, width: "90px" }} />
                        : <span style={{ color: "#374151" }}>{it.color || "—"}</span>}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: "13px" }}>
                      {isCustom
                        ? <input value={it.size} onChange={e => patchItem(it.key, { size: e.target.value })} placeholder="Size" style={{ ...INPUT, width: "70px" }} />
                        : <span style={{ color: "#374151" }}>{it.size || "—"}</span>}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <input type="number" min={0} value={it.qty_ordered || ""} onChange={e => patchItem(it.key, { qty_ordered: parseInt(e.target.value) || 0 })} style={{ ...INPUT, width: "70px", textAlign: "right" }} />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <input type="number" min={0} step="0.01" value={it.unit_cost_expected || ""} onChange={e => patchItem(it.key, { unit_cost_expected: parseFloat(e.target.value) || 0 })} style={{ ...INPUT, width: "90px", textAlign: "right" }} />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontSize: "13px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>
                      ${((it.qty_ordered || 0) * (it.unit_cost_expected || 0)).toFixed(2)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <button onClick={() => removeItem(it.key)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: "16px", lineHeight: 1 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB" }}>
          <button onClick={addCustomItem} style={{ background: "none", border: "1px dashed #9CA3AF", borderRadius: "7px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, color: "#374151", cursor: "pointer" }}>+ Add custom item</button>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1B3A5C" }}>Total: ${total.toFixed(2)}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button onClick={() => router.push(`/admin/purchase-orders/${id}`)} disabled={saving} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #D1D5DB", background: "#fff", fontSize: "13px", fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ padding: "10px 24px", borderRadius: "8px", background: saving ? "#9CA3AF" : "#1B3A5C", color: "#fff", border: "none", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
