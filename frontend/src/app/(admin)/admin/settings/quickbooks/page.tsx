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

interface QBStatus {
  last_sync_at: string | null;
  synced_today: number;
  failed_syncs: FailedSync[];
}

export default function QuickBooksPage() {
  const [data, setData] = useState<QBStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r: any = await apiClient.get("/api/v1/admin/quickbooks/status");
      setData(r.data);
    } finally {
      setLoading(false);
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
      const d = r.data;
      setMessage({
        type: "success",
        text: `Queue purged — ${d.total_deleted} tasks deleted. Now safe to connect a new Intuit app.`,
      });
    } catch (e: any) {
      setMessage({ type: "error", text: `Purge failed: ${e?.response?.data?.detail ?? e?.message}` });
    } finally {
      setPurging(false);
    }
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
            onClick={handleConnect}
            className="px-4 py-2 bg-[#1B3A5C] text-white rounded-md text-sm font-medium hover:bg-[#162f4a]"
          >
            Connect QuickBooks
          </button>
        </div>
      </div>

      {/* Instructions box for when QB is rate-limited */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">When to use these buttons:</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-700">
          <li>Create a new Intuit app at developer.intuit.com</li>
          <li>Update <code className="bg-amber-100 px-1 rounded">QB_CLIENT_ID</code> and <code className="bg-amber-100 px-1 rounded">QB_CLIENT_SECRET</code> in Railway env vars and redeploy</li>
          <li>Click <strong>Purge Queue</strong> — clears all backed-up retry tasks</li>
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
