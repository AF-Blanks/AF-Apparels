"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import PaymentReminderDialog from "@/components/admin/PaymentReminderDialog";

interface Aging { current: number; d30: number; d60: number; d90: number }

/** One order still carrying a balance — what a reminder is actually about. */
interface OpenOrder {
  order_id: string;
  order_number: string;
  date: string | null;
  days: number | null;
  total: number;
  paid: number;
  due: number;
  payment_status: string;
  payment_terms: string | null;
  /** What the customer sees on their invoice — the order number. */
  invoice_number: string;
  /** QuickBooks' own reference for that invoice, once it has been raised. */
  qb_invoice_id: string | null;
  invoice_sent_at: string | null;
}

import type { ReminderDraft } from "@/components/admin/PaymentReminderDialog";

interface Row {
  company_id: string;
  company_name: string;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  order_count: number;
  unpaid_orders: number;
  total_purchased: number;
  total_paid: number;
  outstanding: number;
  oldest_unpaid_date: string | null;
  days_outstanding: number | null;
  aging: Aging;
  orders: OpenOrder[];
}

interface OutstandingReport {
  customers_owing: number;
  total_outstanding: number;
  total_aging: Aging;
  items: Row[];
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type SortKey = "outstanding" | "company_name" | "days_outstanding" | "total_purchased";

/** Colour the age so the worst debt reads at a glance. */
function ageStyle(days: number | null): { bg: string; color: string; label: string } {
  if (days == null) return { bg: "#F3F4F6", color: "#6B7280", label: "—" };
  if (days > 90) return { bg: "rgba(232,36,42,.12)", color: "#B91C1C", label: `${days}d` };
  if (days > 60) return { bg: "rgba(234,88,12,.12)", color: "#C2410C", label: `${days}d` };
  if (days > 30) return { bg: "rgba(234,179,8,.15)", color: "#A16207", label: `${days}d` };
  return { bg: "rgba(5,150,105,.12)", color: "#047857", label: `${days}d` };
}

export default function OutstandingReportPage() {
  const [data, setData] = useState<OutstandingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeSettled, setIncludeSettled] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<(ReminderDraft & { orderId: string; orderNumber: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get(`/api/v1/admin/reports/outstanding?include_settled=${includeSettled}`)
      .then((r: any) => setData(r))
      .finally(() => setLoading(false));
  }, [includeSettled]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? data.items.filter(
          (r) =>
            r.company_name.toLowerCase().includes(q) ||
            (r.email ?? "").toLowerCase().includes(q)
        )
      : data.items;
    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortKey === "company_name") cmp = a.company_name.localeCompare(b.company_name);
      else if (sortKey === "days_outstanding") cmp = (a.days_outstanding ?? -1) - (b.days_outstanding ?? -1);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDesc ? -cmp : cmp;
    });
    return sorted;
  }, [data, search, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDesc ? " ↓" : " ↑") : "");

  function exportCsv() {
    if (!rows.length) return;
    const head = ["Customer", "Email", "Phone", "Terms", "Unpaid Orders", "Total Purchased", "Paid", "Outstanding", "Oldest Unpaid", "Days"];
    const body = rows.map((r) => [
      r.company_name, r.email ?? "", r.phone ?? "", r.payment_terms ?? "",
      r.unpaid_orders, r.total_purchased.toFixed(2), r.total_paid.toFixed(2),
      r.outstanding.toFixed(2), r.oldest_unpaid_date ?? "", r.days_outstanding ?? "",
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "outstanding-balances.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Fetch the reminder the server would send, and hand it over to be edited. */
  async function openDraft(o: OpenOrder) {
    setBusy(true); setNote(null);
    try {
      const d = await apiClient.get<ReminderDraft>(
        `/api/v1/admin/orders/${o.order_id}/payment-reminder`);
      setDraft({ ...d, orderId: o.order_id, orderNumber: o.order_number });
    } catch (err: unknown) {
      setNote({ text: err instanceof Error ? err.message : "Couldn't prepare the reminder.", ok: false });
    } finally { setBusy(false); }
  }

  async function sendDraft() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await apiClient.post<{ message: string }>(
        `/api/v1/admin/orders/${draft.orderId}/payment-reminder`,
        { to_email: draft.to_email, subject: draft.subject, message: draft.message });
      setDraft(null);
      setNote({ text: r.message || "Reminder sent.", ok: true });
    } catch (err: unknown) {
      setNote({ text: err instanceof Error ? err.message : "The reminder could not be sent.", ok: false });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {draft && (
        <PaymentReminderDialog
          draft={draft}
          orderNumber={draft.orderNumber}
          busy={busy}
          onChange={d => setDraft({ ...draft, ...d })}
          onCancel={() => setDraft(null)}
          onSend={sendDraft}
        />
      )}
      {note && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${note.ok
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-700"}`}>
          {note.text}
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outstanding Balances</h1>
          <p className="text-sm text-gray-500 mt-1">
            Who owes money, how much, and how long it&rsquo;s been outstanding.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white border rounded-lg p-5" style={{ borderColor: "rgba(232,36,42,.3)", background: "rgba(232,36,42,.04)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#E8242A" }}>Total Outstanding</p>
              <p className="text-3xl font-bold mt-1" style={{ color: "#E8242A", fontVariantNumeric: "tabular-nums" }}>
                {money(data.total_outstanding)}
              </p>
              <p className="text-xs text-gray-500 mt-1">owed across all customers</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customers Owing</p>
              <p className="text-3xl font-bold text-gray-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {data.customers_owing}
              </p>
              <p className="text-xs text-gray-500 mt-1">with a balance due</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Age of Debt</p>
              <div className="space-y-1 text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                <div className="flex justify-between"><span className="text-gray-600">0–30 days</span><span className="font-semibold text-green-700">{money(data.total_aging.current)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">31–60 days</span><span className="font-semibold text-yellow-700">{money(data.total_aging.d30)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">61–90 days</span><span className="font-semibold text-orange-700">{money(data.total_aging.d60)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">90+ days</span><span className="font-semibold text-red-700">{money(data.total_aging.d90)}</span></div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or email…"
              className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 min-w-[220px]"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
              <input type="checkbox" checked={includeSettled} onChange={(e) => setIncludeSettled(e.target.checked)} />
              Include customers who owe nothing
            </label>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort("company_name")}>Customer{arrow("company_name")}</th>
                    <th className="px-5 py-3 text-left">Terms</th>
                    <th className="px-5 py-3 text-right">Unpaid</th>
                    <th className="px-5 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("total_purchased")}>Purchased{arrow("total_purchased")}</th>
                    <th className="px-5 py-3 text-right">Paid</th>
                    <th className="px-5 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort("outstanding")}>Outstanding{arrow("outstanding")}</th>
                    <th className="px-5 py-3 text-center cursor-pointer select-none" onClick={() => toggleSort("days_outstanding")}>Age{arrow("days_outstanding")}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                      {search ? "No customers match that search." : "Nothing outstanding — everyone is paid up. 🎉"}
                    </td></tr>
                  ) : rows.map((r) => {
                    const age = ageStyle(r.days_outstanding);
                    return (
                        <Fragment key={r.company_id}>
                        <tr onClick={() => setOpenId(openId === r.company_id ? null : r.company_id)}
                          className="hover:bg-gray-50 cursor-pointer">
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900">
                              <span className="text-gray-400 mr-2">
                                {openId === r.company_id ? "▾" : "▸"}
                              </span>
                              {r.company_name}
                            </div>
                          {r.email && <div className="text-xs text-gray-500">{r.email}</div>}
                        </td>
                        <td className="px-5 py-3">
                          {r.payment_terms
                            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{r.payment_terms}</span>
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{r.unpaid_orders}</td>
                        <td className="px-5 py-3 text-right text-gray-700" style={{ fontVariantNumeric: "tabular-nums" }}>{money(r.total_purchased)}</td>
                        <td className="px-5 py-3 text-right text-green-700" style={{ fontVariantNumeric: "tabular-nums" }}>{money(r.total_paid)}</td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: r.outstanding > 0.005 ? "#E8242A" : "#059669", fontVariantNumeric: "tabular-nums" }}>
                          {money(r.outstanding)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: age.bg, color: age.color }}>
                            {age.label}
                          </span>
                          {r.oldest_unpaid_date && (
                            <div className="text-[11px] text-gray-400 mt-0.5">since {r.oldest_unpaid_date}</div>
                          )}
                        </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <Link href={`/admin/customers/${r.company_id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-blue-600 text-xs font-semibold hover:underline">
                              View →
                            </Link>
                          </td>
                        </tr>
                        {/* The orders the balance is made of. A customer total
                            cannot be chased; an order can. */}
                        {openId === r.company_id && (r.orders ?? []).map(o => (
                          <tr key={o.order_id} className="bg-gray-50/60 text-[13px]">
                            <td className="px-5 py-2 pl-12">
                              <Link href={`/admin/orders/${o.order_id}`}
                                className="font-semibold text-blue-700 hover:underline">
                                Invoice {o.invoice_number}
                              </Link>
                              <span className="text-gray-400"> · {o.date ?? "—"}</span>
                              <div className="text-[11px] text-gray-400">
                                {o.qb_invoice_id
                                  ? `QuickBooks #${o.qb_invoice_id}`
                                  : "not in QuickBooks yet"}
                                {o.invoice_sent_at
                                  ? ` · emailed ${new Date(o.invoice_sent_at).toLocaleDateString()}`
                                  : " · not emailed yet"}
                              </div>
                            </td>
                            <td className="px-5 py-2 text-gray-500">
                              {o.payment_terms ?? "—"}
                            </td>
                            <td className="px-5 py-2 text-right text-gray-400"
                              style={{ fontVariantNumeric: "tabular-nums" }}>
                              {o.days != null ? `${o.days}d` : "—"}
                            </td>
                            <td className="px-5 py-2 text-right text-gray-600"
                              style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.total)}</td>
                            <td className="px-5 py-2 text-right text-green-700"
                              style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.paid)}</td>
                            <td className="px-5 py-2 text-right font-bold text-red-600"
                              style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.due)}</td>
                            <td className="px-5 py-2"></td>
                            <td className="px-5 py-2 text-right whitespace-nowrap">
                              <button onClick={() => openDraft(o)} disabled={busy}
                                className="text-xs font-semibold px-2.5 py-1 rounded border border-amber-600 text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                                ⏰ Remind
                              </button>
                            </td>
                          </tr>
                        ))}
                        {openId === r.company_id && (r.orders ?? []).length === 0 && (
                          <tr className="bg-gray-50/60">
                            <td colSpan={8} className="px-5 py-3 pl-12 text-xs text-gray-400">
                              No individual open orders — this balance may predate the current records.
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-5 py-3 font-bold text-gray-900" colSpan={5}>Total ({rows.length} customer{rows.length !== 1 ? "s" : ""})</td>
                      <td className="px-5 py-3 text-right font-bold" style={{ color: "#E8242A", fontVariantNumeric: "tabular-nums" }}>
                        {money(rows.reduce((s, r) => s + r.outstanding, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Figures come from this app&rsquo;s order records. To cross-check one customer against QuickBooks, open their profile and use “Refresh from QuickBooks”.
          </p>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load outstanding balances.</div>
      )}
    </div>
  );
}
