"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { adminService } from "@/services/admin.service";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 90 Days" },
  { value: "year", label: "Last Year" },
];

const GROUP_OPTIONS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

interface SalesReport {
  summary: { total_orders: number; total_revenue: number; avg_order_value: number; total_refunds?: number; gross_revenue?: number };
  period_data: { period: string; order_count: number; revenue: number }[];
  by_category: { category: string; revenue: number; items_sold: number }[];
  top_products: { product_name: string; variant_count: number; units_sold: number; revenue: number }[];
}

export default function SalesReportPage() {
  const [period, setPeriod] = useState("month");
  const [groupBy, setGroupBy] = useState("day");
  // Exact date range — when set it overrides the rolling period on the server.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const usingCustomRange = Boolean(dateFrom || dateTo);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ period, group_by: groupBy });
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    apiClient
      .get(`/api/v1/admin/reports/sales?${qs.toString()}`)
      .then((r: any) => setData(r))
      .finally(() => setLoading(false));
  }, [period, groupBy, dateFrom, dateTo]);

  function handleExport() {
    adminService.exportSalesCsv(period).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
          <p className="text-sm text-gray-500 mt-1">Revenue, orders, and product performance</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={usingCustomRange}
            title={usingCustomRange ? "Clear the date range to use a rolling period" : undefined}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
        {usingCustomRange && (
          <div className="flex items-end">
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
            >
              Clear dates
            </button>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Group By</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Orders", value: data.summary.total_orders.toLocaleString() },
              { label: "Net Revenue", value: `$${data.summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: "Refunds", value: `$${(data.summary.total_refunds ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: "Avg Order Value", value: `$${data.summary.avg_order_value.toFixed(2)}` },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-5">
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Revenue Over Time Table */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Revenue Over Time
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Period</th>
                    <th className="px-6 py-3 text-right">Orders</th>
                    <th className="px-6 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.period_data.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3">{row.period}</td>
                      <td className="px-6 py-3 text-right">{row.order_count}</td>
                      <td className="px-6 py-3 text-right">${row.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Category */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Revenue by Category
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Category</th>
                    <th className="px-6 py-3 text-right">Items Sold</th>
                    <th className="px-6 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.by_category.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3">{row.category}</td>
                      <td className="px-6 py-3 text-right">{row.items_sold}</td>
                      <td className="px-6 py-3 text-right">${row.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Top 20 Products by Revenue
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">#</th>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-6 py-3 text-left">Variants</th>
                    <th className="px-6 py-3 text-right">Units Sold</th>
                    <th className="px-6 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.top_products.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-6 py-3 font-medium">{row.product_name}</td>
                      <td className="px-6 py-3 text-xs text-gray-500">{row.variant_count} variant{row.variant_count !== 1 ? "s" : ""}</td>
                      <td className="px-6 py-3 text-right">{row.units_sold}</td>
                      <td className="px-6 py-3 text-right">${row.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
