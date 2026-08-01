"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import { PackageIcon, ClipboardIcon, AlertTriangleIcon } from "@/components/ui/icons";

interface RecentOrder {
  id: string;
  order_number: string;
  company_name: string;
  total: number;
  status: string;
  created_at: string;
  items_count?: number;
  return_status?: string | null;
}

interface Application {
  id: string;
  company_name: string;
  business_type: string;
  created_at: string;
  status: string;
}

interface DashboardState {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  pendingOrders: number;
  pendingApplications: number;
  lowStockCount: number;
  recentOrders: RecentOrder[];
  recentApplications: Application[];
  dailyCounts: number[];
  conversionRate: number;
  totalTaxCollected: number;
  totalCustomers: number;
  revenueChange: number | null;
  ordersChange: number | null;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:    { bg: "rgba(217,119,6,.1)",   color: "#D97706" },
  confirmed:  { bg: "rgba(26,92,255,.1)",   color: "#1A5CFF" },
  processing: { bg: "rgba(99,102,241,.1)",  color: "#6366F1" },
  shipped:    { bg: "rgba(139,92,246,.1)",  color: "#8B5CF6" },
  delivered:  { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  cancelled:  { bg: "rgba(232,36,42,.1)",   color: "#E8242A" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "rgba(0,0,0,.06)", color: "#555" };
  return (
    <span style={{ background: s.bg, color: s.color, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" as const }}>
      {status}
    </span>
  );
}

function Sparkline({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const W = 240, H = 56, PAD = 4;
  const pts = counts.map((v, i) => {
    const x = PAD + (i / (counts.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  const area = `M ${PAD},${H - PAD} ` +
    counts.map((v, i) => {
      const x = PAD + (i / (counts.length - 1)) * (W - PAD * 2);
      const y = H - PAD - (v / max) * (H - PAD * 2);
      return `L ${x},${y}`;
    }).join(" ") +
    ` L ${W - PAD},${H - PAD} Z`;

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A5CFF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#1A5CFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spGrad)" />
      <polyline points={pts} fill="none" stroke="#1A5CFF" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AlertCard({ icon, count, label, color, href }: { icon: React.ReactNode; count: number; label: string; color: string; href: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{ background: "#fff", border: `1.5px solid ${color}22`, borderRadius: "10px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", minWidth: "200px", cursor: "pointer", transition: "box-shadow .2s" }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 0 3px ${color}22`)}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
      >
        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color, lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: "12px", color: "#7A7880", fontWeight: 600 }}>{label}</div>
        </div>
      </div>
    </Link>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PERIODS: { id: string; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "custom", label: "Custom" },
];
const PERIOD_SUBTITLE: Record<string, string> = {
  today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", custom: "Custom range",
};

export default function AdminDashboard() {
  const [state, setState] = useState<Partial<DashboardState>>({});
  const [loading, setLoading] = useState(true);
  const [showPasswordWarning, setShowPasswordWarning] = useState(false);
  const [period, setPeriod] = useState("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShowPasswordWarning(!localStorage.getItem("pw_warning_dismissed"));
    }
  }, []);

  // Period-independent widgets (recent orders, sparkline, alerts) — fetch once.
  useEffect(() => {
    Promise.allSettled([
      apiClient.get("/api/v1/admin/wholesale-applications?status=pending"),
      apiClient.get("/api/v1/admin/reports/inventory?low_stock_only=true"),
      apiClient.get("/api/v1/admin/orders?page_size=10"),
      apiClient.get("/api/v1/admin/orders?status=pending&page_size=50"),
    ]).then(([appsRes, stockRes, ordersRes, pendingRes]) => {
      const s: Partial<DashboardState> = {};

      if (appsRes.status === "fulfilled") {
        const list = appsRes.value as any[];
        s.pendingApplications = Array.isArray(list) ? list.length : 0;
        s.recentApplications = Array.isArray(list)
          ? list.slice(0, 5).map((a: any) => ({
              id: a.id,
              company_name: a.company_name ?? "—",
              business_type: a.business_type ?? "—",
              created_at: a.created_at,
              status: a.status ?? "pending",
            }))
          : [];
      }

      if (stockRes.status === "fulfilled") {
        const list = stockRes.value as any[];
        s.lowStockCount = Array.isArray(list) ? list.length : 0;
      }

      if (ordersRes.status === "fulfilled") {
        const items: any[] = (ordersRes.value as any)?.items ?? [];
        s.recentOrders = items.map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          company_name: o.company?.name ?? o.company_name ?? "—",
          total: o.total,
          status: o.status,
          created_at: o.created_at,
          items_count: o.items?.length ?? o.items_count,
          return_status: o.return_status,
        }));

        // Build last-7-days sparkline from order created_at timestamps
        const now = new Date();
        const daily = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - (6 - i));
          const key = d.toISOString().split("T")[0];
          return items.filter((o: any) => o.created_at?.startsWith(key)).length;
        });
        s.dailyCounts = daily;
      }

      if (pendingRes.status === "fulfilled") {
        const items: any[] = (pendingRes.value as any)?.items ?? [];
        s.pendingOrders = items.length;
      }

      setState(prev => ({ ...prev, ...s }));
    }).finally(() => setLoading(false));
  }, []);

  // Period-scoped KPI cards (revenue, orders, conversion, tax, customers) —
  // re-fetch whenever the date filter changes. Only touches the dashboard.
  useEffect(() => {
    if (period === "custom" && (!customStart || !customEnd)) return;
    const qs = period === "custom"
      ? `period=custom&start_date=${customStart}&end_date=${customEnd}`
      : `period=${period}`;
    apiClient.get(`/api/v1/admin/analytics?${qs}`).then((res) => {
      const ov = (res as any)?.overview ?? {};
      setState(prev => ({
        ...prev,
        totalRevenue: ov.total_revenue ?? 0,
        totalOrders: ov.total_orders ?? 0,
        avgOrderValue: ov.average_order_value ?? 0,
        conversionRate: ov.conversion_rate ?? 0,
        totalTaxCollected: ov.total_tax_collected ?? 0,
        totalCustomers: ov.total_customers ?? 0,
        revenueChange: ov.revenue_change_percent ?? null,
        ordersChange: ov.orders_change_percent ?? null,
      }));
    }).catch(() => {});
  }, [period, customStart, customEnd]);

  async function handleApprove(id: string) {
    try {
      await apiClient.patch(`/api/v1/admin/wholesale-applications/${id}/approve`, {});
      setState(prev => ({
        ...prev,
        recentApplications: prev.recentApplications?.filter(a => a.id !== id),
        pendingApplications: Math.max(0, (prev.pendingApplications ?? 1) - 1),
      }));
    } catch { /* ignore */ }
  }

  async function handleReject(id: string) {
    try {
      await apiClient.post(`/api/v1/admin/wholesale-applications/${id}/reject`, { rejection_reason: "Rejected by admin" });
      setState(prev => ({
        ...prev,
        recentApplications: prev.recentApplications?.filter(a => a.id !== id),
        pendingApplications: Math.max(0, (prev.pendingApplications ?? 1) - 1),
      }));
    } catch { /* ignore */ }
  }

  if (loading && !AdminDashboard) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "320px" }}>
        <div style={{ fontSize: "13px", color: "#aaa" }}>Loading dashboard…</div>
      </div>
    );
  }

  const dailyCounts = state.dailyCounts ?? [0, 0, 0, 0, 0, 0, 0];

  // Format a real period-over-period % from analytics into a badge string.
  // Empty string → the card renders no badge (never show fake movement).
  const fmtPct = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : `${v >= 0 ? "+" : ""}${v}%`;

  const statCards = [
    { label: "Customers", value: String(state.totalCustomers ?? 0), change: "", up: true, sub: "active accounts" },
    {
      label: "Total Sales",
      value: `$${(state.totalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      change: fmtPct(state.revenueChange),
      up: (state.revenueChange ?? 0) >= 0,
      sub: `${state.totalOrders ?? 0} orders`,
    },
    {
      label: "Orders",
      value: String(state.totalOrders ?? 0),
      change: fmtPct(state.ordersChange),
      up: (state.ordersChange ?? 0) >= 0,
      sub: `avg $${(state.avgOrderValue ?? 0).toFixed(0)}`,
    },
    { label: "Conversion Rate", value: `${(state.conversionRate ?? 0).toFixed(1)}%`, change: "", up: true, sub: "paid / total orders" },
    {
      label: "Tax Collected",
      value: `$${(state.totalTaxCollected ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      up: true,
      sub: "synced to QuickBooks",
    },
  ];

  return (
    <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".03em", lineHeight: 1 }}>Dashboard</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>{PERIOD_SUBTITLE[period] ?? "Overview"} overview</p>
        </div>

        {/* Date period filter */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #E2E0DA", borderRadius: "8px", overflow: "hidden" }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  padding: "7px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: "none",
                  borderLeft: p.id !== "today" ? "1px solid #E2E0DA" : "none",
                  background: period === p.id ? "#1A5CFF" : "#fff",
                  color: period === p.id ? "#fff" : "#7A7880",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "6px", fontSize: "12px", color: "#2A2830" }} />
              <span style={{ fontSize: "12px", color: "#7A7880" }}>to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                style={{ padding: "6px 8px", border: "1px solid #E2E0DA", borderRadius: "6px", fontSize: "12px", color: "#2A2830" }} />
            </div>
          )}
        </div>
      </div>

      {/* Security warning banner */}
      {showPasswordWarning && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ fontSize: "13px", color: "#991B1B" }}>
            <strong>⚠️ Security Alert:</strong>
            <span style={{ marginLeft: "8px" }}>
              Your admin password was found in a public data breach. Please change it in{" "}
              <a href="/admin/settings" style={{ color: "#DC2626", fontWeight: 700 }}>Settings</a>{" "}
              immediately.
            </span>
          </div>
          <button
            onClick={() => {
              localStorage.setItem("pw_warning_dismissed", "1");
              setShowPasswordWarning(false);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#F87171", flexShrink: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="admin-dash-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "16px", marginBottom: "24px" }}>
        {statCards.map(stat => (
          <div key={stat.label} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "13px", color: "#7A7880", marginBottom: "6px" }}>{stat.label}</div>
                <div style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>{stat.sub}</div>
              </div>
              {stat.change && (
                <span style={{
                  background: stat.up ? "rgba(5,150,105,.1)" : "rgba(232,36,42,.1)",
                  color: stat.up ? "#059669" : "#E8242A",
                  padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700,
                }}>
                  {stat.up ? "↑" : "↓"} {stat.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline + Alerts Row */}
      <div className="admin-dash-kpi-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", marginBottom: "24px", alignItems: "start" }}>
        {/* Sparkline */}
        <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".05em", color: "#2A2830" }}>ORDERS — LAST 7 DAYS</div>
              <div style={{ fontSize: "12px", color: "#7A7880" }}>Daily order volume</div>
            </div>
            <div style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#1A5CFF" }}>
              {dailyCounts.reduce((a, b) => a + b, 0)}
            </div>
          </div>
          <Sparkline counts={dailyCounts} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            {DAY_LABELS.map(d => (
              <span key={d} style={{ fontSize: "10px", color: "#bbb", fontWeight: 600, textTransform: "uppercase" as const }}>{d}</span>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <AlertCard icon={<PackageIcon size={20} color="#E8242A" />} count={state.pendingOrders ?? 0} label="orders to fulfill" color="#E8242A" href="/admin/orders?status=pending" />
          <AlertCard icon={<ClipboardIcon size={20} color="#D97706" />} count={state.pendingApplications ?? 0} label="applications pending" color="#D97706" href="/admin/customers/applications" />
          <AlertCard icon={<AlertTriangleIcon size={20} color="#6366F1" />} count={state.lowStockCount ?? 0} label="low stock SKUs" color="#6366F1" href="/admin/reports/inventory" />
        </div>
      </div>

      {/* Recent Orders */}
      <div className="admin-table-card" style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #E2E0DA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".05em", color: "#2A2830" }}>RECENT ORDERS</h2>
          <Link href="/admin/orders" style={{ fontSize: "12px", color: "#1A5CFF", textDecoration: "none", fontWeight: 700 }}>View all →</Link>
        </div>
        {!state.recentOrders?.length ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>No recent orders.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E0DA", background: "#FAFAF8" }}>
                {["Order #", "Customer", "Date", "Items", "Total", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: h === "Total" ? "right" : "left", fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase" as const, letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.recentOrders.map((order, i) => (
                <tr key={order.id} style={{ borderBottom: i < state.recentOrders!.length - 1 ? "1px solid #F0EDE8" : "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/admin/orders/${order.id}`} style={{ color: "#1A5CFF", textDecoration: "none", fontFamily: "monospace", fontSize: "12px", fontWeight: 700 }}>
                      {order.order_number}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#2A2830" }}>{order.company_name}</td>
                  <td style={{ padding: "12px 16px", color: "#7A7880" }}>
                    {order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#7A7880" }}>{order.items_count ?? "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#2A2830" }}>${Number(order.total).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <StatusBadge status={order.status} />
                      {order.return_status && (
                        <span style={{ background: "rgba(234,88,12,.1)", color: "#EA580C", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>
                          {order.return_status === "refunded" ? "Refunded" : "Returned"}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Applications */}
      <div className="admin-table-card" style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #E2E0DA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".05em", color: "#2A2830" }}>RECENT APPLICATIONS</h2>
          <Link href="/admin/customers/applications" style={{ fontSize: "12px", color: "#1A5CFF", textDecoration: "none", fontWeight: 700 }}>View all →</Link>
        </div>
        {!state.recentApplications?.length ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>No pending applications.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E0DA", background: "#FAFAF8" }}>
                {["Company", "Type", "Date", "Status", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase" as const, letterSpacing: ".06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.recentApplications.map((app, i) => (
                <tr key={app.id} style={{ borderBottom: i < state.recentApplications!.length - 1 ? "1px solid #F0EDE8" : "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2A2830" }}>{app.company_name}</td>
                  <td style={{ padding: "12px 16px", color: "#7A7880" }}>{app.business_type}</td>
                  <td style={{ padding: "12px 16px", color: "#7A7880" }}>
                    {app.created_at ? new Date(app.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}><StatusBadge status={app.status} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => handleApprove(app.id)}
                        style={{ background: "rgba(5,150,105,.1)", color: "#059669", border: "none", padding: "5px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                        ✓ Approve
                      </button>
                      <button onClick={() => handleReject(app.id)}
                        style={{ background: "rgba(232,36,42,.08)", color: "#E8242A", border: "none", padding: "5px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                        ✕ Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
