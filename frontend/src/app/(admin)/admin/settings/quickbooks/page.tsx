"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface FailedSync {
  id: string;
  entity_type: string;
  entity_id: string;
  attempt_count: number;
  error_message: string | null;
  updated_at: string | null;
}

interface QBItem {
  id: string;
  name: string | null;
  type: string | null;
  active: boolean;
  account: string | null;
}

interface QBStatus {
  last_sync_at: string | null;
  synced_today: number;
  failed_syncs: FailedSync[];
  connected: boolean;
  connected_realm: string | null;
  company_name: string | null;
  ids_realm: string | null;
  needs_switch: boolean;
  orders_kept_with_previous_company: number;
  invoiced_orders_not_stamped: number;
}

export default function QuickBooksPage() {
  const [data, setData] = useState<QBStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [items, setItems] = useState<QBItem[] | null>(null);
  const [audit, setAudit] = useState<{
    checked: number;
    mismatches: Array<{ order_number: string; our_company: string; qb_customer: string | null; qb_invoice_id: string }>;
    errors: Array<{ order_number: string; error: string }>;
  } | null>(null);
  const [auditing, setAuditing] = useState(false);

  async function runAudit() {
    setAuditing(true);
    setMessage(null);
    try {
      const r = await apiClient.get<typeof audit>("/api/v1/admin/orders/audit-qb-customers");
      setAudit(r);
    } catch (e) {
      setMessage({
        type: "error",
        text: `Couldn't run the audit: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    } finally {
      setAuditing(false);
    }
  }
  const [loadingItems, setLoadingItems] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      // apiClient returns the parsed body itself. Reading .data off it gave
      // undefined every time, which is why this page has never shown a sync
      // status — and why the failure was invisible rather than loud.
      const r = await apiClient.get<QBStatus>("/api/v1/admin/quickbooks/status");
      setData(r);
    } catch (e) {
      setMessage({
        type: "error",
        text: `Couldn't read the QuickBooks status: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetch the items in the connected company.
   *
   * On demand rather than on page load: it is a live call to QuickBooks, and
   * this page is opened for plenty of reasons that have nothing to do with it.
   */
  async function loadItems() {
    setLoadingItems(true);
    setMessage(null);
    try {
      const r = await apiClient.get<{ items: QBItem[] }>(
        "/api/v1/admin/quickbooks/items"
      );
      setItems(r.items ?? []);
    } catch (e) {
      setMessage({
        type: "error",
        text: `Couldn't read the item list: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      });
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    load();
    // Check if just connected via OAuth callback
    if (window.location.search.includes("connected=true")) {
      setMessage({ type: "success", text: "QuickBooks connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleRetry(logId: string) {
    setRetrying(logId);
    setMessage(null);
    try {
      await apiClient.post(`/api/v1/admin/quickbooks/retry/${logId}`, {});
      setMessage({ type: "success", text: "Sync retry queued successfully." });
      await load();
    } catch {
      setMessage({ type: "error", text: "Failed to queue retry." });
    } finally {
      setRetrying(null);
    }
  }

  async function handlePurgeQueue() {
    if (!confirm("This will DELETE all pending and scheduled Celery tasks (QB syncs, emails, etc.) from the queue. Do this BEFORE connecting a new Intuit app. Continue?")) return;
    setPurging(true);
    setMessage(null);
    try {
      const r: any = await apiClient.post("/api/v1/admin/quickbooks/purge-queue", {});
      const d = r?.data ?? r ?? {};
      setMessage({
        type: "success",
        text: `Queue purged — ${d.total_deleted ?? 0} tasks deleted. Now safe to connect a new Intuit app.`,
      });
    } catch (e: any) {
      setMessage({ type: "error", text: `Purge failed: ${e?.response?.data?.detail ?? e?.message}` });
    } finally {
      setPurging(false);
    }
  }

  const [adopting, setAdopting] = useState(false);

  /**
   * Accept the company we are now connected to, and forget the previous one's
   * record numbers.
   *
   * A customer id means something only inside the company it was created in.
   * Syncing refuses to run while ours belong to a different one, and this is
   * the deliberate act that resolves it — so it asks first, in plain words.
   */
  async function handleAdopt() {
    const warning = [
      "Switch this system over to the QuickBooks company you are now connected to?",
      "",
      "Every customer's QuickBooks reference will be cleared, and customers will be created fresh in the new company as orders come in.",
      "",
      "Invoices and payments already raised are left exactly as they are.",
      "",
      "Only do this after connecting to the company you want.",
    ].join("\n");
    if (!confirm(warning)) return;
    setAdopting(true); setMessage(null);
    try {
      const d = await apiClient.post<{ message: string }>(
        "/api/v1/admin/quickbooks/adopt-company", { confirm: true });
      setMessage({ type: "success", text: d.message });
      load();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Couldn't switch company." });
    } finally { setAdopting(false); }
  }

  function handleConnect() {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/quickbooks/connect`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QuickBooks Sync</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor and manage QB sync status</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={handlePurgeQueue}
            disabled={purging}
            className="px-4 py-2 border border-orange-300 rounded-md text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
          >
            {purging ? "Purging..." : "Purge Queue"}
          </button>
          <button
            onClick={handleAdopt}
            disabled={adopting}
            title="Use after connecting to a different QuickBooks company"
            className="px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
          >
            {adopting ? "Switching…" : "Switch to Connected Company"}
          </button>
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-[#1B3A5C] text-white rounded-md text-sm font-medium hover:bg-[#162f4a]"
          >
            Connect QuickBooks
          </button>
        </div>
      </div>

      {/* Which company we are pointed at. Shown before anything else, because
          "Switch to Connected Company" clears every customer reference and is
          not a thing to press while guessing which books are on the other end. */}
      {data?.connected && (
        <div
          className={`rounded-lg border p-4 ${
            data.needs_switch
              ? "bg-amber-50 border-amber-300"
              : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Connected to
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {data.company_name || "QuickBooks"}
            <span className="ml-2 text-xs font-normal text-gray-500">
              company&nbsp;{data.connected_realm}
            </span>
          </p>
          {data.needs_switch ? (
            <p className="mt-2 text-sm text-amber-900">
              Syncing is paused.{" "}
              {data.ids_realm
                ? `The customer and item references we hold were made in company ${data.ids_realm}, and those numbers mean something different here.`
                : "Nothing has been synced to this company yet, and the references we hold were made somewhere else."}{" "}
              Check the name above is the company you want, then press{" "}
              <strong>Switch to Connected Company</strong>. Invoices already raised
              stay where they are and will not be touched again.
            </p>
          ) : (
            <p className="mt-2 text-sm text-emerald-900">
              Set up and syncing normally.
              {data.orders_kept_with_previous_company > 0 && (
                <>
                  {" "}
                  {data.orders_kept_with_previous_company} earlier{" "}
                  {data.orders_kept_with_previous_company === 1 ? "order is" : "orders are"}{" "}
                  pinned to the company they were invoiced in and will not be
                  synced here.
                </>
              )}
              {data.invoiced_orders_not_stamped > 0 && (
                <>
                  {" "}
                  <strong>
                    {data.invoiced_orders_not_stamped} invoiced{" "}
                    {data.invoiced_orders_not_stamped === 1 ? "order carries" : "orders carry"}{" "}
                    no company
                  </strong>{" "}
                  — those invoice numbers would be reused here if anything
                  re-synced them.
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* The four item ids an invoice is built from. They belong to one company
          and have to be looked up again after moving, so make looking them up
          a button rather than a hunt through QuickBooks for four URLs. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Item IDs for invoices</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Merchandise, Shipping, Sales Tax Collected and the Convenience Fee.
              These go in Railway as QB_MERCHANDISE_ITEM_ID, QB_SHIPPING_ITEM_ID,
              QB_TAX_ITEM_ID and QB_CONVENIENCE_FEE_ITEM_ID.
            </p>
          </div>
          <button
            onClick={loadItems}
            disabled={loadingItems}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingItems ? "Reading…" : "Show items"}
          </button>
        </div>

        {items && (
          <div className="mt-4 overflow-x-auto">
            {items.length === 0 ? (
              <p className="text-sm text-gray-500">
                This QuickBooks company has no items yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-semibold">ID</th>
                    <th className="py-2 pr-4 font-semibold">Name</th>
                    <th className="py-2 pr-4 font-semibold">Type</th>
                    <th className="py-2 font-semibold">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-mono font-semibold text-gray-900">
                        {it.id}
                      </td>
                      <td className="py-2 pr-4 text-gray-900">
                        {it.name}
                        {!it.active && (
                          <span className="ml-2 text-xs text-gray-400">inactive</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{it.type}</td>
                      <td className="py-2 text-gray-500">{it.account}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Whether every invoiced order actually landed on its own customer.
          One order was found to have gone out under a name that was not its
          own — the company's link to QuickBooks had been cleared by a switch
          to a different company, and a fallback grabbed a leftover reference
          from the old one. This checks every synced order the same way, so
          the full extent is known rather than found one at a time. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Invoice customers</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Checks every synced order against who QuickBooks actually billed it to.
            </p>
          </div>
          <button
            onClick={runAudit}
            disabled={auditing}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {auditing ? "Checking…" : "Audit invoice customers"}
          </button>
        </div>

        {audit && (
          <div className="mt-4">
            {audit.mismatches.length === 0 ? (
              <p className="text-sm text-emerald-700">
                Checked {audit.checked} order{audit.checked === 1 ? "" : "s"} — every one is billed to its own customer.
              </p>
            ) : (
              <>
                <p className="text-sm text-red-700 font-semibold mb-3">
                  {audit.mismatches.length} of {audit.checked} order{audit.checked === 1 ? "" : "s"} went out under the wrong customer:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="py-2 pr-4 font-semibold">Order</th>
                        <th className="py-2 pr-4 font-semibold">Should be</th>
                        <th className="py-2 pr-4 font-semibold">QuickBooks has it as</th>
                        <th className="py-2 font-semibold">QB Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.mismatches.map((m) => (
                        <tr key={m.order_number} className="border-b border-gray-100">
                          <td className="py-2 pr-4 font-semibold text-gray-900">{m.order_number}</td>
                          <td className="py-2 pr-4 text-gray-700">{m.our_company}</td>
                          <td className="py-2 pr-4 text-red-700 font-medium">{m.qb_customer || "—"}</td>
                          <td className="py-2 font-mono text-xs text-gray-500">{m.qb_invoice_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {audit.errors.length > 0 && (
              <p className="mt-3 text-xs text-gray-400">
                {audit.errors.length} order{audit.errors.length === 1 ? "" : "s"} couldn&rsquo;t be checked
                (invoice not reachable in QuickBooks right now).
              </p>
            )}
          </div>
        )}
      </div>

      {/* Instructions box for when QB is rate-limited */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">When to use these buttons:</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-700">
          <li>Create a new Intuit app at developer.intuit.com</li>
          <li>Update <code className="bg-amber-100 px-1 rounded">QB_CLIENT_ID</code> and <code className="bg-amber-100 px-1 rounded">QB_CLIENT_SECRET</code> in Railway env vars and redeploy</li>
          <li>Click <strong>Purge Queue</strong> — clears all backed-up retry tasks</li>
          <li>After connecting to a <em>different company</em>, click <strong>Switch to Connected Company</strong> — until then syncing stays paused on purpose, because the customer references we hold belong to the previous company</li>
          <li>Click <strong>Connect QuickBooks</strong> — starts OAuth with the new app</li>
        </ol>
      </div>

      {message && (
        <div className={`border rounded p-3 text-sm ${
          message.type === "success" ? "bg-green-50 border-green-200 text-green-800" :
          message.type === "error" ? "bg-red-50 border-red-200 text-red-800" :
          "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500">Last Successful Sync</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {data.last_sync_at
                  ? new Date(data.last_sync_at).toLocaleString()
                  : "Never"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500">Synced Today</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.synced_today}</p>
            </div>
          </div>

          {/* Failed syncs */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Failed Syncs
                {data.failed_syncs.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                    {data.failed_syncs.length}
                  </span>
                )}
              </h2>
            </div>
            {data.failed_syncs.length === 0 ? (
              <p className="px-6 py-6 text-sm text-gray-400">No failed syncs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">Type</th>
                      <th className="px-6 py-3 text-left">Entity ID</th>
                      <th className="px-6 py-3 text-right">Attempts</th>
                      <th className="px-6 py-3 text-left">Error</th>
                      <th className="px-6 py-3 text-left">Last Attempt</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.failed_syncs.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 capitalize">{s.entity_type}</td>
                        <td className="px-6 py-3 font-mono text-xs">{s.entity_id.slice(0, 8)}…</td>
                        <td className="px-6 py-3 text-right">{s.attempt_count}</td>
                        <td className="px-6 py-3 text-red-600 max-w-xs truncate">
                          {s.error_message ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {s.updated_at ? new Date(s.updated_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => handleRetry(s.id)}
                            disabled={retrying === s.id}
                            className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                          >
                            {retrying === s.id ? "Queuing..." : "Retry"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
