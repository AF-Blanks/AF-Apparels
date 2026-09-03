"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";

interface CommissionOrder {
  order_id: string;
  order_number: string;
  date: string | null;
  units: number;
  special_base: number;
  special_commission: number;
  other_base: number;
  other_commission: number;
  total_commission: number;
  payment_status?: string;
  paid?: boolean;
  order_total?: number;
}

interface CommissionCustomer {
  company_id: string;
  company_name: string;
  tier: string;
  order_count: number;
  special_base: number;
  special_commission: number;
  other_base: number;
  other_commission: number;
  total_commission: number;
  unpaid_commission?: number;
  order_total?: number;
  orders: CommissionOrder[];
}

interface CommissionReport {
  period: { from: string; to: string };
  rules: {
    tiers: string[];
    special_codes: string[];
    special_percent: number;
    default_percent: number;
  };
  totals: {
    customers: number;
    special_base: number;
    special_commission: number;
    other_base: number;
    other_commission: number;
    total_commission: number;
    unpaid_commission?: number;
    order_total?: number;
  };
  customers: CommissionCustomer[];
  warning?: string;
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/** First and last day of a month, as the input[type=date] wants them. */
function monthBounds(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

export default function CommissionReportPage() {
  const init = monthBounds();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<CommissionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await adminService.exportCommissionCsv(from, to);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't export the report.");
    } finally {
      setExporting(false);
    }
  }

  const load = useCallback((f: string, t: string) => {
    setLoading(true);
    setError(null);
    apiClient
      .get<CommissionReport>(`/api/v1/admin/reports/commission?date_from=${f}&date_to=${t}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the report."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(from, to); }, [load, from, to]);

  const r = data?.rules;
  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission</h1>
          <p className="text-sm text-gray-500 mt-1">
            What tiered customers have earned on what they bought.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !data?.customers.length}
          className="shrink-0 border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>

      {data?.warning && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-5 py-4 text-sm text-amber-900">
          {data.warning}
        </div>
      )}

      {/* The arrangement itself, stated on the page — a total is only checkable
          against the rule it came from. */}
      {r && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 text-sm text-blue-900">
          <span className="font-semibold">How this is worked out — </span>
          {r.tiers.join(" and ")} customers earn{" "}
          <strong>{r.special_percent}%</strong> on products{" "}
          <strong>{r.special_codes.join(" and ")}</strong>, and{" "}
          <strong>{r.default_percent}%</strong> on everything else. Worked out on the
          goods only — shipping, tax and fees earn nothing. Orders still on terms
          are counted and marked, so a total can be read as earned or as not yet
          collected.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <button onClick={() => { const m = monthBounds(); setFrom(m.from); setTo(m.to); }}
          className="px-3 py-2 text-sm font-semibold text-blue-700 hover:underline">
          This month
        </button>
        <button onClick={() => { const m = monthBounds(-1); setFrom(m.from); setTo(m.to); }}
          className="px-3 py-2 text-sm font-semibold text-blue-700 hover:underline">
          Last month
        </button>
        <button onClick={() => load(from, to)} disabled={loading}
          className="ml-auto px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : data && t ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label={`Products ${r?.special_codes.join(" & ")}`}
              value={money(t.special_commission)}
              sub={`${money(t.special_base)} of goods at ${r?.special_percent}%`} />
            <Tile label="All other products"
              value={money(t.other_commission)}
              sub={`${money(t.other_base)} of goods at ${r?.default_percent}%`} />
            <Tile label="Total commission" value={money(t.total_commission)}
              sub="for the dates shown" tone="good" />
            <Tile label="Customers" value={String(t.customers)} sub="earned something" />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900 flex items-center justify-between flex-wrap gap-2">
              <span>By customer</span>
              <span className="text-xs font-normal text-gray-500">
                click a row to see the orders behind it
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Tier</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Order total</th>
                    <th className="px-4 py-3 text-right">{r?.special_codes.join("/")} goods</th>
                    <th className="px-4 py-3 text-right">@ {r?.special_percent}%</th>
                    <th className="px-4 py-3 text-right">Other goods</th>
                    <th className="px-4 py-3 text-right">@ {r?.default_percent}%</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.customers.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                      No commission earned in these dates.
                    </td></tr>
                  ) : data.customers.map(c => (
                    <CustomerRows key={c.company_id} c={c}
                      open={openId === c.company_id}
                      onToggle={() => setOpenId(openId === c.company_id ? null : c.company_id)} />
                  ))}
                </tbody>
                {data.customers.length > 0 && (
                  <tfoot className="bg-gray-50 font-bold text-gray-900">
                    <tr style={{ fontVariantNumeric: "tabular-nums" }}>
                      <td className="px-6 py-3" colSpan={3}>Total</td>
                      <td className="px-4 py-3 text-right">{money(t.special_base)}</td>
                      <td className="px-4 py-3 text-right">{money(t.special_commission)}</td>
                      <td className="px-4 py-3 text-right">{money(t.other_base)}</td>
                      <td className="px-4 py-3 text-right">{money(t.other_commission)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{money(t.total_commission)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">Couldn&rsquo;t load the report.</div>
      )}
    </div>
  );
}

function CustomerRows({ c, open, onToggle }: {
  c: CommissionCustomer; open: boolean; onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} className="hover:bg-gray-50 cursor-pointer"
        style={{ fontVariantNumeric: "tabular-nums" }}>
        <td className="px-6 py-3 font-semibold text-gray-900">
          <span className="text-gray-400 mr-2">{open ? "▾" : "▸"}</span>
          {c.company_name}
        </td>
        <td className="px-4 py-3 text-gray-600">{c.tier}</td>
        <td className="px-4 py-3 text-right text-gray-600">{c.order_count}</td>
        <td className="px-4 py-3 text-right font-semibold text-gray-900">{money(c.order_total ?? 0)}</td>
        <td className="px-4 py-3 text-right text-gray-600">{money(c.special_base)}</td>
        <td className="px-4 py-3 text-right text-gray-900">{money(c.special_commission)}</td>
        <td className="px-4 py-3 text-right text-gray-600">{money(c.other_base)}</td>
        <td className="px-4 py-3 text-right text-gray-900">{money(c.other_commission)}</td>
        <td className="px-4 py-3 text-right font-bold text-green-700">{money(c.total_commission)}</td>
      </tr>
      {open && c.orders.map(o => (
        <tr key={o.order_id} className="bg-gray-50/60 text-[13px]"
          style={{ fontVariantNumeric: "tabular-nums" }}>
          <td className="px-6 py-2 pl-12 text-gray-700">
            {o.order_number}
            <span className="text-gray-400"> · {shortDate(o.date)}</span>
            {/* An order still on terms earns the same, but the money has not
                arrived — worth seeing beside the figure, not buried in a total. */}
            {o.paid === false && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800">
                not paid
              </span>
            )}
          </td>
          <td className="px-4 py-2 text-gray-400">{o.units} pcs</td>
          <td className="px-4 py-2 text-right font-medium text-gray-700">{money(o.order_total ?? 0)}</td>
          <td className="px-4 py-2 text-right text-gray-500">{money(o.special_base)}</td>
          <td className="px-4 py-2 text-right text-gray-700">{money(o.special_commission)}</td>
          <td className="px-4 py-2 text-right text-gray-500">{money(o.other_base)}</td>
          <td className="px-4 py-2 text-right text-gray-700">{money(o.other_commission)}</td>
          <td className="px-4 py-2 text-right font-semibold text-gray-900">{money(o.total_commission)}</td>
        </tr>
      ))}
    </>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: "good";
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${tone === "good" ? "text-green-700" : "text-gray-900"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
