"use client";

import { useEffect, useMemo, useState } from "react";
import { adminService } from "@/services/admin.service";
import { StockAdjustmentModal } from "@/components/admin/StockAdjustmentModal";

interface InventoryRow {
  variant_id: string;
  sku: string;
  color?: string;
  size?: string;
  product_name: string;
  product_code?: string | null;
  warehouse_id: string | null;
  warehouse_name: string;
  quantity: number;
  low_stock_threshold: number;
}

const SIZE_ORDER = ["XS", "S", "S/M", "M", "M/L", "L", "XL", "2XL", "3XL", "4XL", "5XL", "One Size"];

function ThresholdInput({ row, onSaved }: { row: InventoryRow; onSaved: (val: number) => void }) {
  const [val, setVal] = useState(String(row.low_stock_threshold));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setVal(String(row.low_stock_threshold)); }, [row.low_stock_threshold]);

  async function save() {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0 || num === row.low_stock_threshold) return;
    setSaving(true);
    try {
      await adminService.updateStockThreshold({
        variant_id: row.variant_id,
        warehouse_id: row.warehouse_id!,
        threshold: num,
      });
      onSaved(num);
    } catch {
      setVal(String(row.low_stock_threshold));
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="number"
      min={0}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      disabled={saving}
      title="Alert when stock drops below this number"
      style={{ width: "44px", textAlign: "center", border: "1px solid #E5E7EB", borderRadius: "4px", fontSize: "10px", padding: "1px 2px", outline: "none" }}
    />
  );
}

function exportInventoryToCsv(rows: InventoryRow[]) {
  const header = ["Product", "Product Code", "SKU", "Color", "Size", "Warehouse", "Quantity", "Low Stock Threshold"];
  const lines = rows.map(r => [
    r.product_name, r.product_code ?? "", r.sku, r.color ?? "", r.size ?? "", r.warehouse_name, r.quantity, r.low_stock_threshold,
  ]);
  const csv = [header, ...lines].map(row => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "inventory.csv"; a.click();
  URL.revokeObjectURL(url);
}

type ProductGroup = {
  product_name: string;
  product_code: string | null;
  gridSizes: string[];
  gridColors: string[];
  byColor: Map<string, InventoryRow[]>;
};

function BulkRestockModal({ group, warehouseId, warehouseName, onClose, onSaved }: {
  group: ProductGroup;
  warehouseId: string;
  warehouseName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allRows: InventoryRow[] = [];
  for (const rows of group.byColor.values()) for (const r of rows) allRows.push(r);

  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of allRows) m[r.variant_id] = String(r.quantity);
    return m;
  });
  const [fillAll, setFillAll] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function applyFill() {
    if (fillAll.trim() === "") return;
    setQtys(() => {
      const m: Record<string, string> = {};
      for (const r of allRows) m[r.variant_id] = fillAll;
      return m;
    });
  }

  const cell = (color: string, size: string) =>
    (group.byColor.get(color) ?? []).find(r => (r.size ?? "").toUpperCase() === size.toUpperCase());

  async function save() {
    setSaving(true); setErr(null);
    try {
      const items = allRows
        .map(r => ({ variant_id: r.variant_id, quantity: parseInt(qtys[r.variant_id] ?? "", 10) }))
        .filter(i => !isNaN(i.quantity) && i.quantity >= 0);
      await adminService.bulkAdjustInventory({ warehouse_id: warehouseId, mode: "set", items });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "760px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#111827" }}>Bulk Restock — {group.product_name}</div>
            <div style={{ fontSize: "12px", color: "#6B7280" }}>{warehouseName} · sets stock to the values you enter, then syncs to QuickBooks</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6B7280", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#6B7280" }}>Set all to</span>
          <input type="number" min="0" value={fillAll} onChange={e => setFillAll(e.target.value)} placeholder="qty" style={{ width: "80px", padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "13px" }} />
          <button onClick={applyFill} style={{ padding: "6px 12px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Apply to all</button>
        </div>
        <div style={{ padding: "12px 20px", overflow: "auto", flex: 1 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "11px", color: "#6B7280", fontWeight: 700 }}>COLOR</th>
                {group.gridSizes.map(s => <th key={s} style={{ padding: "8px 6px", textAlign: "center", fontSize: "11px", color: "#6B7280", fontWeight: 700 }}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {group.gridColors.map(color => (
                <tr key={color} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "6px 10px", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap" }}>{color}</td>
                  {group.gridSizes.map(size => {
                    const v = cell(color, size);
                    if (!v) return <td key={size} style={{ padding: "6px", textAlign: "center", color: "#D1D5DB" }}>—</td>;
                    return (
                      <td key={size} style={{ padding: "6px", textAlign: "center" }}>
                        <input type="number" min="0" value={qtys[v.variant_id] ?? ""} onChange={e => setQtys(prev => ({ ...prev, [v.variant_id]: e.target.value }))} style={{ width: "52px", padding: "5px 4px", border: "1px solid #E5E7EB", borderRadius: "5px", fontSize: "13px", textAlign: "center" }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {err && <div style={{ color: "#DC2626", fontSize: "12px", marginTop: "10px" }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #E5E7EB", borderRadius: "7px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 18px", border: "none", borderRadius: "7px", background: "#1A5CFF", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save & Sync to QuickBooks"}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null);
  const [bulkTarget, setBulkTarget] = useState<ProductGroup | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");

  async function load() {
    setIsLoading(true);
    try {
      const data = await adminService.listInventory({ low_stock_only: lowStockOnly }) as InventoryRow[];
      setRows(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [lowStockOnly]);

  // Distinct real warehouses seen in the data — defaults the filter to the first
  // one so the matrix always has an unambiguous, editable single-warehouse context.
  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.warehouse_id) map.set(r.warehouse_id, r.warehouse_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(warehouses[0]!.id);
  }, [warehouses, warehouseId]);

  const isAllWarehouses = warehouseId === "__all__";

  const filtered = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.product_name.toLowerCase().includes(q) ||
        (r.product_code ?? "").toLowerCase().includes(q) ||
        (r.color ?? "").toLowerCase().includes(q) ||
        (r.size ?? "").toLowerCase().includes(q)
      );
    }
    if (!isAllWarehouses && warehouseId) {
      list = list.filter(r => r.warehouse_id === warehouseId);
    }
    return list;
  }, [rows, search, warehouseId, isAllWarehouses]);

  const lowCount = filtered.filter(r => r.quantity <= r.low_stock_threshold).length;

  // Group into product blocks, each with a color x size matrix (mirrors the
  // Purchase Order "block" layout so this page isn't a 1600-row wall of text).
  const productGroups = useMemo(() => {
    const order: string[] = [];
    const byProduct = new Map<string, InventoryRow[]>();
    for (const r of filtered) {
      const key = `${r.product_name}::${r.product_code ?? ""}`;
      if (!byProduct.has(key)) { byProduct.set(key, []); order.push(key); }
      byProduct.get(key)!.push(r);
    }
    return order.map(key => {
      const productRows = byProduct.get(key)!;
      const [product_name = "", product_code = ""] = key.split("::");

      const gridSizes: string[] = [];
      for (const s of SIZE_ORDER) {
        if (productRows.some(r => (r.size ?? "").toUpperCase() === s.toUpperCase())) gridSizes.push(s);
      }
      for (const r of productRows) {
        const s = r.size ?? "";
        if (s && !gridSizes.some(g => g.toUpperCase() === s.toUpperCase())) gridSizes.push(s);
      }

      const gridColors: string[] = [];
      const byColor = new Map<string, InventoryRow[]>();
      for (const r of productRows) {
        const c = r.color || "—";
        if (!byColor.has(c)) { byColor.set(c, []); gridColors.push(c); }
        byColor.get(c)!.push(r);
      }

      return { product_name, product_code: product_code || null, gridSizes, gridColors, byColor };
    });
  }, [filtered]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} records{lowCount > 0 ? ` · ${lowCount} low stock` : ""}
          </p>
        </div>
        <button
          onClick={() => exportInventoryToCsv(filtered)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by product, code, color, size…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-64"
        />
        <select
          value={warehouseId}
          onChange={e => setWarehouseId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          <option value="__all__">All Warehouses (view only)</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded"
          />
          Low stock only
        </label>
        {(search) && (
          <button
            onClick={() => setSearch("")}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Clear
          </button>
        )}
      </div>

      {isAllWarehouses && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Showing combined quantity across all warehouses — pick a specific warehouse above to adjust stock or edit alert thresholds.
        </div>
      )}

      {isLoading && filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
      ) : productGroups.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-gray-400 text-sm">No inventory records</div>
      ) : (
        productGroups.map(group => (
          <div key={`${group.product_name}::${group.product_code}`} className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-sm font-bold text-gray-900">{group.product_name}</span>
              {group.product_code && (
                <span className="text-xs text-gray-400 font-mono">{group.product_code}</span>
              )}
              {warehouseId !== "__all__" && (
                <button
                  onClick={() => setBulkTarget(group)}
                  style={{ marginLeft: "auto", padding: "5px 12px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Bulk Restock
                </button>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                    <th style={{ padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".06em", whiteSpace: "nowrap" }}>COLOR</th>
                    {group.gridSizes.map(s => (
                      <th key={s} style={{ padding: "9px 8px", textAlign: "center", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".06em", width: "62px" }}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.gridColors.map(color => {
                    const colorRows = group.byColor.get(color)!;
                    return (
                      <tr key={color} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "8px 12px", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap" }}>{color}</td>
                        {group.gridSizes.map(size => {
                          const sizeRows = colorRows.filter(r => (r.size ?? "").toUpperCase() === size.toUpperCase());
                          if (sizeRows.length === 0) {
                            return <td key={size} style={{ padding: "8px", textAlign: "center", color: "#D1D5DB", fontSize: "13px" }}>—</td>;
                          }
                          if (isAllWarehouses) {
                            const totalQty = sizeRows.reduce((sum, r) => sum + r.quantity, 0);
                            const totalThreshold = sizeRows.reduce((sum, r) => sum + r.low_stock_threshold, 0);
                            const low = totalQty <= totalThreshold;
                            return (
                              <td key={size} style={{ padding: "6px", textAlign: "center" }}>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: low ? "#DC2626" : "#111827" }}>{totalQty}</div>
                                <div style={{ fontSize: "9px", color: "#9CA3AF", marginTop: "2px" }}>{sizeRows.length} wh</div>
                              </td>
                            );
                          }
                          const row = sizeRows[0]!;
                          const low = row.quantity <= row.low_stock_threshold;
                          return (
                            <td key={size} style={{ padding: "6px", textAlign: "center" }}>
                              <button
                                onClick={() => setAdjustTarget(row)}
                                title="Click to adjust stock"
                                style={{
                                  width: "44px", padding: "5px 4px", borderRadius: "6px", cursor: "pointer",
                                  border: `1px solid ${low ? "#FCA5A5" : "#E5E7EB"}`,
                                  background: low ? "#FEF2F2" : "#fff",
                                  color: low ? "#DC2626" : "#111827",
                                  fontSize: "13px", fontWeight: 700,
                                }}
                              >
                                {row.quantity}
                              </button>
                              <div style={{ marginTop: "3px" }}>
                                <ThresholdInput
                                  row={row}
                                  onSaved={(val) => setRows(prev => prev.map(r => r.variant_id === row.variant_id && r.warehouse_id === row.warehouse_id ? { ...r, low_stock_threshold: val } : r))}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {adjustTarget && (
        <StockAdjustmentModal
          sku={adjustTarget.sku}
          currentQty={adjustTarget.quantity}
          variantId={adjustTarget.variant_id}
          warehouseId={adjustTarget.warehouse_id!}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => { setAdjustTarget(null); load(); }}
        />
      )}

      {bulkTarget && warehouseId !== "__all__" && (
        <BulkRestockModal
          group={bulkTarget}
          warehouseId={warehouseId}
          warehouseName={warehouses.find(w => w.id === warehouseId)?.name ?? "Warehouse"}
          onClose={() => setBulkTarget(null)}
          onSaved={() => { setBulkTarget(null); load(); }}
        />
      )}
    </div>
  );
}
