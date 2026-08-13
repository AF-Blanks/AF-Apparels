"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface ReconOrder {
  order_number: string;
  date: string | null;
  company: string | null;
  status: string;
  payment_status: string | null;
  app_total: number;
  sales_tax: number;
  shipping: number;
  counts_as_income: number;
  qb_invoice_id: string | null;
  qb_doc_number: string | null;
  qb_total: number | null;
  qb_txn_date: string | null;
  state: "ok" | "missing_from_qb" | "dated_outside_range" | "amount_mismatch";
}

interface Recon {
  period: { from: string; to: string };
  qb_available: boolean;
  qb_error: string | null;
  summary: {
    orders: number;
    dashboard_sales: number;
    sales_tax_excluded: number;
    expected_qb_income: number;
    qb_invoice_total_in_window: number;
    missing_from_qb_count: number;
    missing_from_qb_income: number;
    dated_outside_range_count: number;
    dated_outside_range_income: number;
    amount_mismatch_count: number;
    amount_mismatch_delta: number;
    extra_in_qb_count: number;
    extra_in_qb_total: number;
  };
  orders: ReconOrder[];
  extra_invoices: { qb_invoice_id: string; qb_doc_number: string | null; qb_txn_date: string | null; qb_total: number }[];
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATE_STYLE: Record<ReconOrder["state"], { label: string; cls: string }> = {
  ok: { label: "Matches QB", cls: "bg-green-50 text-green-700 border-green-200" },
  missing_from_qb: { label: "Not in QB", cls: "bg-red-50 text-red-700 border-red-200" },
  dated_outside_range: { label: "Dated outside range", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  amount_mismatch: { label: "Amount differs", cls: "bg-orange-50 text-orange-700 border-orange-200" },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function QbReconciliationPage() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<Recon>(`/api/v1/admin/reports/qb-reconciliation?date_from=${from}&date_to=${to}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the reconciliation."))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  // Only the rows that need attention are worth reading first, so surface them.
  const problems = (data?.orders ?? []).filter(o => o.state !== "ok");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QuickBooks Reconciliation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Why the dashboard&rsquo;s sales figure and a QuickBooks P&amp;L don&rsquo;t match — traced order by order.
        </p>
      </div>

      {/* Range */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </label>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Checking…" : "Run reconciliation"}
        </button>
        <p className="text-xs text-gray-500 basis-full">
          Compare against QuickBooks → Reports → <strong>Profit and Loss</strong> for the same dates.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && s ? (
        <>
          {!data.qb_available && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              QuickBooks couldn&rsquo;t be reached, so only our own figures are shown below.
              {data.qb_error && <span className="block mt-1 font-mono text-xs">{data.qb_error}</span>}
            </div>
          )}

          {/* The walk from one number to the other */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Dashboard sales → QuickBooks income
            </div>
            <div className="divide-y divide-gray-100 text-sm">
              <Row label="Dashboard “Total Sales”" hint={`${s.orders} orders — what we billed, tax and shipping included`}
                value={money(s.dashboard_sales)} bold />
              <Row label="− Sales tax collected"
                hint="QuickBooks books this to Sales Tax Payable (a liability), never to income — so a P&L will never show it"
                value={`− ${money(s.sales_tax_excluded)}`} />
              <Row label="= Should appear as QuickBooks income" value={money(s.expected_qb_income)} bold accent />
              {s.missing_from_qb_count > 0 && (
                <Row label={`− Orders with no QuickBooks invoice (${s.missing_from_qb_count})`}
                  hint="These were never synced, so their income is missing from the P&L"
                  value={`− ${money(s.missing_from_qb_income)}`} danger />
              )}
              {s.dated_outside_range_count > 0 && (
                <Row label={`− Invoices dated outside this range (${s.dated_outside_range_count})`}
                  hint="The invoice exists but carries a different TxnDate, so it lands in another month's P&L"
                  value={`− ${money(s.dated_outside_range_income)}`} danger />
              )}
              {s.amount_mismatch_count > 0 && (
                <Row label={`± Invoice amount differs (${s.amount_mismatch_count})`}
                  hint="The QB invoice total doesn't equal the order total"
                  value={money(s.amount_mismatch_delta)} danger />
              )}
              {s.extra_in_qb_count > 0 && (
                <Row label={`+ Invoices in QuickBooks with no matching order (${s.extra_in_qb_count})`}
                  hint="Entered directly in QuickBooks, or belonging to an order outside this range"
                  value={money(s.extra_in_qb_total)} danger />
              )}
              <Row label="QuickBooks invoice total for this range"
                hint="Sum of the matched invoices — tax included, so subtract tax to compare with the P&L income line"
                value={money(s.qb_invoice_total_in_window)} bold />
            </div>
          </div>

          {/* Problems first */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900 flex items-center justify-between">
              <span>Orders needing attention</span>
              <span className="text-xs font-normal text-gray-500">{problems.length} of {data.orders.length}</span>
            </div>
            <OrderTable rows={problems} emptyText="Every order in this range matches its QuickBooks invoice." />
          </div>

          {/* Everything */}
          <details className="bg-white border border-gray-200 rounded-lg">
            <summary className="px-6 py-4 font-semibold text-gray-900 cursor-pointer">
              All {data.orders.length} orders in this range
            </summary>
            <OrderTable rows={data.orders} emptyText="No orders in this range." />
          </details>

          {data.extra_invoices.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
                In QuickBooks but not in our orders
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">QB Doc #</th>
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-6 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.extra_invoices.map(inv => (
                      <tr key={inv.qb_invoice_id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{inv.qb_doc_number ?? inv.qb_invoice_id}</td>
                        <td className="px-6 py-3 text-gray-500">{inv.qb_txn_date ?? "—"}</td>
                        <td className="px-6 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {money(inv.qb_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the reconciliation.</div>
      )}
    </div>
  );
}

function Row({ label, hint, value, bold, accent, danger }: {
  label: string; hint?: string; value: string;
  bold?: boolean; accent?: boolean; danger?: boolean;
}) {
  return (
    <div className="px-6 py-3 flex items-start justify-between gap-6">
      <div>
        <div className={`${bold ? "font-bold" : "font-medium"} ${accent ? "text-blue-700" : "text-gray-900"}`}>{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5 max-w-xl">{hint}</div>}
      </div>
      <div
        className={`shrink-0 ${bold ? "font-bold text-base" : "font-semibold"} ${
          danger ? "text-red-600" : accent ? "text-blue-700" : "text-gray-900"
        }`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}

function OrderTable({ rows, emptyText }: { rows: ReconOrder[]; emptyText: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-6 py-3 text-left">Order #</th>
            <th className="px-6 py-3 text-left">Company</th>
            <th className="px-6 py-3 text-left">Date</th>
            <th className="px-6 py-3 text-right">Order Total</th>
            <th className="px-6 py-3 text-right">Sales Tax</th>
            <th className="px-6 py-3 text-right">Counts as Income</th>
            <th className="px-6 py-3 text-right">QB Invoice</th>
            <th className="px-6 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">{emptyText}</td></tr>
          ) : rows.map(o => {
            const st = STATE_STYLE[o.state];
            return (
              <tr key={o.order_number} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{o.order_number}</td>
                <td className="px-6 py-3 text-gray-700">{o.company ?? "—"}</td>
                <td className="px-6 py-3 text-gray-500">{o.date ? o.date.slice(0, 10) : "—"}</td>
                <td className="px-6 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.app_total)}</td>
                <td className="px-6 py-3 text-right text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {o.sales_tax ? money(o.sales_tax) : "—"}
                </td>
                <td className="px-6 py-3 text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {money(o.counts_as_income)}
                </td>
                <td className="px-6 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {o.qb_total !== null ? money(o.qb_total) : <span className="text-red-600">none</span>}
                  {o.qb_txn_date && <div className="text-[11px] text-gray-400">{o.qb_txn_date}</div>}
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
  );
}
