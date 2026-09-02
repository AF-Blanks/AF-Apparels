"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient, ApiClientError } from "@/lib/api-client";

interface LineItem {
  id: string;
  new_product_name: string | null;
  new_product_sku: string | null;
  new_product_color: string | null;
  new_product_size: string | null;
  variant_sku: string | null;
  variant_color: string | null;
  variant_size: string | null;
  qty_ordered: number;
  unit_cost_expected: number;
}

interface Receiving {
  items: { po_line_item_id: string; qty_received: number; }[];
}

interface PO {
  id: string;
  po_number: string;
  line_items: LineItem[];
  receivings: Receiving[];
}

interface ReceiveRow {
  po_line_item_id: string;
  qty_receiving: number;
  unit_cost_actual: number;
}

function alreadyReceived(po: PO, lineItemId: string): number {
  return po.receivings.reduce((sum, r) => {
    const match = r.items.find(i => i.po_line_item_id === lineItemId);
    return sum + (match?.qty_received || 0);
  }, 0);
}

interface AwaitingCustomer {
  order_id: string;
  order_number: string;
  customer: string;
  email: string | null;
  balance: number;
  payment_status: string;
  can_email: boolean;
  lines: Array<{ description: string; quantity: number }>;
}

interface Awaiting {
  receiving_id: string;
  customers: AwaitingCustomer[];
  count: number;
  unpaid_count: number;
  unreachable: string[];
}

export default function ReceiveItemsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ReceiveRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<PO>(`/api/v1/admin/purchase-orders/${id}`)
      .then((data: PO) => {
        setPo(data);
        setRows(data.line_items.map(li => ({
          po_line_item_id: li.id,
          qty_receiving: 0,
          unit_cost_actual: li.unit_cost_expected,
        })));
        setLoading(false);
      });
  }, [id]);

  function updateRow(lineItemId: string, field: "qty_receiving" | "unit_cost_actual", value: number) {
    setRows(r => r.map(row => row.po_line_item_id === lineItemId ? { ...row, [field]: value } : row));
  }

  // Who is waiting on what just arrived. Held here rather than emailed on the
  // spot: a receiving entered against the wrong line is a normal mistake and an
  // easy one to correct, and an email that has gone to a customer is neither.
  const [waiting, setWaiting] = useState<Awaiting | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notifying, setNotifying] = useState(false);
  const [notified, setNotified] = useState<number | null>(null);

  async function submit() {
    const activeRows = rows.filter(r => r.qty_receiving > 0);
    if (activeRows.length === 0) { alert("Enter at least 1 qty to receive"); return; }
    setSaving(true);
    try {
      const res = await apiClient.post<{ receiving_id: string }>(
        `/api/v1/admin/purchase-orders/${id}/receive`,
        {
          received_date: receivedDate,
          notes: notes || null,
          items: activeRows.map(row => ({
            po_line_item_id: row.po_line_item_id,
            qty_received: row.qty_receiving,
            unit_cost_actual: row.unit_cost_actual,
          })),
        }
      );

      // Anyone waiting on this delivery gets a say before they get an email.
      const who = await apiClient.get<Awaiting>(
        `/api/v1/admin/purchase-orders/receivings/${res.receiving_id}/awaiting-customers`
      );
      if (who.count > 0) {
        setWaiting(who);
        setPicked(new Set(who.customers.filter(c => c.can_email).map(c => c.order_id)));
        return;   // stay on the page; the panel takes it from here
      }
      router.push(`/admin/purchase-orders/${id}`);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to record receiving");
    } finally {
      setSaving(false);
    }
  }

  async function sendNotices() {
    if (!waiting) return;
    setNotifying(true);
    try {
      const res = await apiClient.post<{ sent: number }>(
        `/api/v1/admin/purchase-orders/receivings/${waiting.receiving_id}/notify-awaiting`,
        { order_ids: Array.from(picked) }
      );
      setNotified(res.sent);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Couldn't send the notices");
    } finally {
      setNotifying(false);
    }
  }

  if (loading) return <div style={{ padding: "32px", color: "#9CA3AF" }}>Loading…</div>;
  if (!po) return <div style={{ padding: "32px", color: "#EF4444" }}>PO not found.</div>;

  // The stock is booked in either way. What is still open is whether the people
  // who have been waiting for it are told, and that is a decision, not a step.
  if (waiting) {
    const chosen = waiting.customers.filter(c => picked.has(c.order_id));
    const owed = chosen.reduce((t, c) => t + (c.balance || 0), 0);
    return (
      <div style={{ padding: "32px", maxWidth: "860px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
          Stock received &mdash; {waiting.count} customer{waiting.count === 1 ? " is" : "s are"} waiting on it
        </h1>
        <p style={{ fontSize: "14px", color: "#6B7280", margin: "0 0 22px", lineHeight: 1.6 }}>
          These orders have backordered lines this delivery covers. Nothing has been
          sent yet &mdash; choose who to tell.
        </p>

        {notified !== null ? (
          <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "10px",
                        padding: "20px 22px", marginBottom: "20px" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#065F46" }}>
              {notified} notice{notified === 1 ? "" : "s"} sent.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#047857" }}>
              Each says what arrived, and shows the outstanding balance where there is one.
            </p>
          </div>
        ) : (
          <>
            <div style={{ border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden",
                          marginBottom: "18px" }}>
              {waiting.customers.map(c => (
                <label
                  key={c.order_id}
                  style={{
                    display: "flex", gap: "12px", alignItems: "flex-start",
                    padding: "14px 16px", borderBottom: "1px solid #F3F4F6",
                    background: c.can_email ? "#fff" : "#FAFAF9",
                    cursor: c.can_email ? "pointer" : "not-allowed",
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={!c.can_email}
                    checked={picked.has(c.order_id)}
                    onChange={e => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(c.order_id); else next.delete(c.order_id);
                      setPicked(next);
                    }}
                    style={{ marginTop: "3px" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: "14px" }}>
                      {c.customer}
                      <span style={{ color: "#9CA3AF", fontWeight: 400 }}> &middot; order {c.order_number}</span>
                    </div>
                    <div style={{ fontSize: "13px", color: "#4B5563", marginTop: "3px" }}>
                      {c.lines.map(l => `${l.quantity} × ${l.description}`).join(", ")}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "3px" }}>
                      {c.can_email ? c.email : "No email address on this order — cannot be told"}
                    </div>
                  </div>
                  {c.balance > 0 && (
                    <span style={{ background: "#FEF2F2", color: "#B91C1C", borderRadius: "6px",
                                   padding: "3px 9px", fontSize: "12px", fontWeight: 700,
                                   whiteSpace: "nowrap" }}>
                      ${c.balance.toFixed(2)} due
                    </span>
                  )}
                </label>
              ))}
            </div>

            <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 18px", lineHeight: 1.6 }}>
              {chosen.length} of {waiting.count} selected
              {owed > 0 && <> &middot; <strong>${owed.toFixed(2)}</strong> outstanding between them, which the email will show</>}.
              {waiting.unreachable.length > 0 && (
                <> Orders {waiting.unreachable.join(", ")} have no email address and will not be told.</>
              )}
            </p>
          </>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          {notified === null && (
            <button
              onClick={sendNotices}
              disabled={notifying || chosen.length === 0}
              style={{ padding: "11px 22px", borderRadius: "8px", border: "none",
                       background: chosen.length ? "#1B3A5C" : "#E5E7EB",
                       color: chosen.length ? "#fff" : "#9CA3AF",
                       fontWeight: 700, fontSize: "14px",
                       cursor: chosen.length ? "pointer" : "not-allowed" }}
            >
              {notifying ? "Sending…" : `Send ${chosen.length} notice${chosen.length === 1 ? "" : "s"}`}
            </button>
          )}
          <button
            onClick={() => router.push(`/admin/purchase-orders/${id}`)}
            style={{ padding: "11px 22px", borderRadius: "8px", border: "1px solid #D1D5DB",
                     background: "#fff", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}
          >
            {notified === null ? "Skip — don't tell anyone" : "Back to purchase order"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: "13px" }}>← Back</button>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1B3A5C" }}>RECEIVE ITEMS</h1>
          <div style={{ fontSize: "13px", color: "#6B7280" }}>{po.po_number}</div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "28px", marginBottom: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
          <div>
            <label style={LBL}>Received Date</label>
            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LBL}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" style={INPUT} />
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["PRODUCT", "QTY ORDERED", "ALREADY RECEIVED", "QTY RECEIVING NOW", "ACTUAL UNIT COST"].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B7280", letterSpacing: ".07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {po.line_items.map(li => {
              const row = rows.find(r => r.po_line_item_id === li.id)!;
              const received = alreadyReceived(po, li.id);
              const remaining = li.qty_ordered - received;
              const label = li.new_product_name
                ? `${li.new_product_name}${li.new_product_color ? ` — ${li.new_product_color}` : ""}${li.new_product_size ? ` / ${li.new_product_size}` : ""}`
                : `${li.variant_color || ""} / ${li.variant_size || ""} (${li.variant_sku || "no SKU"})`;

              return (
                <tr key={li.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "12px 14px", fontSize: "13px" }}>{label}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: "#6B7280" }}>{li.qty_ordered}</td>
                  <td style={{ padding: "12px 14px", fontSize: "13px", color: received > 0 ? "#059669" : "#9CA3AF" }}>{received}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <input
                      type="number" min={0} max={remaining}
                      value={row?.qty_receiving ?? 0}
                      onChange={e => updateRow(li.id, "qty_receiving", parseInt(e.target.value) || 0)}
                      style={{ ...INPUT, width: "80px" }}
                    />
                    {remaining > 0 && <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "6px" }}>of {remaining} remaining</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <input
                      type="number" min={0} step={0.01}
                      value={row?.unit_cost_actual ?? li.unit_cost_expected}
                      onChange={e => updateRow(li.id, "unit_cost_actual", parseFloat(e.target.value) || 0)}
                      style={{ ...INPUT, width: "100px" }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <button onClick={() => router.back()} style={{ padding: "10px 20px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={submit} disabled={saving} style={{ padding: "10px 24px", background: "#059669", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          {saving ? "Saving…" : "Receive & Update Inventory"}
        </button>
      </div>
    </div>
  );
}

const LBL: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" };
const INPUT: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: "7px", fontSize: "13px", boxSizing: "border-box", outline: "none" };
