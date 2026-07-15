"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

interface RMAItem {
  id: string;
  quantity: number;
  reason: string | null;
  product_name: string | null;
  sku: string | null;
  color: string | null;
  size: string | null;
  unit_price: number | null;
}

interface RMA {
  id: string;
  rma_number: string;
  order_id: string;
  status: string;
  reason: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  refund_status: string | null;
  refund_amount: number | null;
  restock_status: string | null;
  processing_error: string | null;
  items: RMAItem[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
};

function estimatedRefund(rma: RMA): number {
  return rma.items.reduce((sum, item) => sum + (item.unit_price ?? 0) * item.quantity, 0);
}

export default function AdminReturnsPage() {
  const [rmas, setRmas] = useState<RMA[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionTarget, setActionTarget] = useState<RMA | null>(null);
  const [actionStatus, setActionStatus] = useState<"approved" | "rejected">("approved");
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  function load() {
    adminService.listRmas(statusFilter || undefined).then((d) => {
      const data = d as RMA[];
      setRmas(Array.isArray(data) ? data : []);
    });
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    if (!actionTarget) return;
    setIsUpdating(true);
    setResultMessage(null);
    try {
      const res = (await adminService.updateRma(actionTarget.id, {
        status: actionStatus,
        admin_notes: adminNotes || undefined,
      })) as {
        message: string;
        refund_status: string | null;
        refund_amount: number | null;
        restock_status: string | null;
        processing_error: string | null;
      };

      if (res.processing_error) {
        setResultMessage(
          `Refund/restock had an issue: ${res.processing_error} — RMA left as "${res.refund_status === "failed" ? "pending" : actionStatus}" so you can retry.`
        );
      } else if (actionStatus === "approved") {
        setResultMessage(
          `Approved. Refund: ${res.refund_status === "refunded" ? `$${res.refund_amount?.toFixed(2)} refunded via QuickBooks` : res.refund_status === "not_applicable" ? "no card charge to refund" : res.refund_status}. Restock: ${res.restock_status === "done" ? "stock returned to inventory" : res.restock_status}.`
        );
      }

      setAdminNotes("");
      setActionTarget(null);
      load();
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Returns (RMA)</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {resultMessage && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {resultMessage}
          <button onClick={() => setResultMessage(null)} className="ml-3 text-blue-500 hover:text-blue-700">Dismiss</button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">RMA #</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Reason</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Items</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Refund</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rmas.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No RMAs</td></tr>
            ) : rmas.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">{r.rma_number}</td>
                <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{r.reason}</td>
                <td className="px-4 py-3 text-gray-600">{r.items.reduce((n, i) => n + i.quantity, 0)} unit(s)</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {r.refund_status === "refunded" && r.refund_amount != null
                    ? `$${r.refund_amount.toFixed(2)} refunded`
                    : r.refund_status === "failed"
                      ? <span className="text-red-600">refund failed</span>
                      : r.refund_status === "not_applicable"
                        ? "no charge to refund"
                        : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {(r.status === "pending" || r.refund_status === "failed") && (
                    <button onClick={() => { setActionTarget(r); setActionStatus("approved"); setResultMessage(null); }} className="text-xs text-brand-600 hover:text-brand-800">
                      {r.refund_status === "failed" ? "Retry" : "Review"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Review RMA</h2>
            <p className="text-sm text-gray-500 mb-4">{actionTarget.rma_number}</p>

            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Return reason</p>
              <p className="text-sm text-gray-800 mb-3">{actionTarget.reason}</p>
              <p className="text-xs font-medium text-gray-500 mb-2">Items being returned</p>
              <ul className="space-y-1 mb-3">
                {actionTarget.items.map((item) => (
                  <li key={item.id} className="text-sm text-gray-700 flex justify-between">
                    <span>{item.product_name ?? "Item"} {item.color && `/ ${item.color}`} {item.size && `/ ${item.size}`} × {item.quantity}{item.reason ? ` — ${item.reason}` : ""}</span>
                    <span className="text-gray-500">${((item.unit_price ?? 0) * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm font-semibold text-gray-900 border-t border-gray-200 pt-2">
                <span>Estimated refund if approved</span>
                <span>${estimatedRefund(actionTarget).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleAction} className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setActionStatus("approved")}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border ${actionStatus === "approved" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-700"}`}>
                  Approve (refund + restock)
                </button>
                <button type="button" onClick={() => setActionStatus("rejected")}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border ${actionStatus === "rejected" ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-700"}`}>
                  Reject
                </button>
              </div>
              <textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Admin notes (optional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button type="button" onClick={() => { setActionTarget(null); setAdminNotes(""); }} className="flex-1 border border-gray-300 rounded-md py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isUpdating} className="flex-1 bg-brand-600 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                  {isUpdating ? "Processing…" : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
