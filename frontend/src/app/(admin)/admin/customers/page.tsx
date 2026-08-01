// frontend/src/app/%28admin%29/admin/customers/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { UsersIcon, CheckCircleIcon, BarChartIcon, DollarSignIcon, DownloadIcon } from "@/components/ui/icons";

interface CompanyRow {
  id: string;
  name: string;
  status: string;
  pricing_tier_id: string | null;
  shipping_tier_id: string | null;
  order_count: number;
  total_spend: string;
  created_at: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  last_order_date?: string;
  account_type?: string;
}

interface PricingTier { id: string; name: string; }

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "rgba(5,150,105,.1)",  color: "#059669" },
  suspended: { bg: "rgba(232,36,42,.1)",  color: "#E8242A" },
  pending:   { bg: "rgba(217,119,6,.1)",  color: "#D97706" },
};

// ── Add Customer Modal ─────────────────────────────────────────────────────────

function AddCustomerModal({ pricingTiers, discountGroups, onClose, onSuccess }: {
  pricingTiers: PricingTier[];
  discountGroups: { id: string; title: string; customer_tag: string | null }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "", business_type: "retailer", tax_id: "", website: "",
    phone: "", company_email: "",
    address_line1: "", city: "", state_province: "", postal_code: "", country: "US",
    contact_first_name: "", contact_last_name: "",
    contact_email: "", contact_phone: "",
    pricing_tier_id: "", customer_tag: "", admin_notes: "",
  });
  const [taxExempt, setTaxExempt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Company name is required."); return; }
    setSaving(true); setError(null);
    try {
      await adminService.createCompany({
        name: form.name,
        business_type: form.business_type,
        tax_id: form.tax_id || undefined,
        website: form.website || undefined,
        phone: form.phone || undefined,
        company_email: form.company_email || undefined,
        address_line1: form.address_line1 || undefined,
        city: form.city || undefined,
        state_province: form.state_province || undefined,
        postal_code: form.postal_code || undefined,
        country: form.country || "US",
        contact_first_name: form.contact_first_name || undefined,
        contact_last_name: form.contact_last_name || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
        pricing_tier_id: form.pricing_tier_id || undefined,
        tags: form.customer_tag ? [form.customer_tag] : undefined,
        admin_notes: form.admin_notes || undefined,
        tax_exempt: taxExempt,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 11px", border: "1.5px solid #E2E0DA",
    borderRadius: "7px", fontSize: "13px", outline: "none", boxSizing: "border-box",
    fontFamily: "var(--font-jakarta)",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: ".06em", color: "#7A7880", marginBottom: "5px",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "600px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #E2E0DA", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "22px", color: "#2A2830", letterSpacing: ".04em", margin: 0 }}>ADD CUSTOMER</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#7A7880", lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {error && <div style={{ background: "rgba(232,36,42,.08)", border: "1px solid rgba(232,36,42,.2)", borderRadius: "6px", padding: "10px 14px", fontSize: "13px", color: "#E8242A", marginBottom: "16px" }}>{error}</div>}

          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#7A7880", marginBottom: "12px" }}>Company Information</div>
          <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Company Name *</label>
              <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} required />
            </div>
            <div>
              <label style={lbl}>Business Type</label>
              <select style={inp} value={form.business_type} onChange={e => set("business_type", e.target.value)}>
                {["retailer","distributor","screen_printer","embroiderer","promotional","other"].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Tax ID / EIN</label>
              <input style={inp} value={form.tax_id} onChange={e => set("tax_id", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} value={form.phone} onChange={e => set("phone", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Company Email</label>
              <input style={inp} type="email" value={form.company_email} onChange={e => set("company_email", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Street Address</label>
              <input style={inp} value={form.address_line1} onChange={e => set("address_line1", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>City</label>
              <input style={inp} value={form.city} onChange={e => set("city", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>State</label>
              <input style={inp} value={form.state_province} onChange={e => set("state_province", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>ZIP</label>
              <input style={inp} value={form.postal_code} onChange={e => set("postal_code", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Pricing Tier (flat %)</label>
              <select style={inp} value={form.pricing_tier_id} onChange={e => set("pricing_tier_id", e.target.value)}>
                <option value="">None</option>
                {pricingTiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: "14px" }}>
            <label style={lbl}>Customer Tier (discount group)</label>
            <select style={inp} value={form.customer_tag} onChange={e => set("customer_tag", e.target.value)}>
              <option value="">None</option>
              {discountGroups.map(g => (
                <option key={g.id} value={g.customer_tag ?? ""}>{g.title}</option>
              ))}
            </select>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Your tiers (Tier-1…5, Stephen-5, RAJ-6) — sets the customer&apos;s per-variant pricing.</div>
          </div>

          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#7A7880", marginTop: "20px", marginBottom: "12px" }}>Contact Person (optional)</div>
          <div className="checkout-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={lbl}>First Name</label>
              <input style={inp} value={form.contact_first_name} onChange={e => set("contact_first_name", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Last Name</label>
              <input style={inp} value={form.contact_last_name} onChange={e => set("contact_last_name", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Login Email</label>
              <input style={inp} type="email" value={form.contact_email} onChange={e => set("contact_email", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: "16px", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830", marginBottom: "4px" }}>Tax Exempt</div>
            <p style={{ fontSize: "12px", color: "#7A7880", marginBottom: "10px", lineHeight: 1.5 }}>
              When enabled, this customer will not be charged or shown any tax at checkout.
            </p>
            <label
              onClick={() => setTaxExempt(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}
            >
              <div style={{
                position: "relative", width: "44px", height: "24px", borderRadius: "12px",
                background: taxExempt ? "#059669" : "#E2E0DA",
                transition: "background .2s", flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute", top: "3px",
                  left: taxExempt ? "23px" : "3px",
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: "#fff", transition: "left .2s",
                  boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                }} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600, color: taxExempt ? "#059669" : "#7A7880" }}>
                {taxExempt ? "Tax Exempt — no tax charged" : "Not exempt (standard tax)"}
              </span>
            </label>
          </div>

          <div style={{ marginTop: "16px" }}>
            <label style={lbl}>Admin Notes</label>
            <textarea style={{ ...inp, resize: "vertical", minHeight: "60px" }} value={form.admin_notes} onChange={e => set("admin_notes", e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E2E0DA" }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#fff" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: "10px", background: saving ? "#E2E0DA" : "#1A5CFF", color: saving ? "#aaa" : "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Creating…" : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminCustomersPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [discountGroups, setDiscountGroups] = useState<{ id: string; title: string; customer_tag: string | null }[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped_duplicate: number; skipped_no_email: number; errors: string[] } | null>(null);
  const [pwSetupLoading, setPwSetupLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  async function load() {
    setIsLoading(true);
    try {
      const data = await adminService.listCompanies({
        q: q || undefined,
        status: statusFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      }) as { items: CompanyRow[]; total: number };
      setCompanies(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [q, statusFilter, page]);

  useEffect(() => {
    adminService.listPricingTiers().then(t => setPricingTiers(t as PricingTier[])).catch(() => {});
    adminService.listDiscountGroups()
      .then(g => setDiscountGroups((g as any[]).map(x => ({ id: x.id, title: x.title, customer_tag: x.customer_tag ?? null }))))
      .catch(() => {});
  }, []);

  const sorted = useMemo(() => {
    const list = [...companies];
    if (sortBy === "total_spend") list.sort((a, b) => Number(b.total_spend) - Number(a.total_spend));
    else if (sortBy === "order_count") list.sort((a, b) => b.order_count - a.order_count);
    else list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [companies, sortBy]);

  const stats = useMemo(() => ({
    total,
    active: companies.filter(c => c.status === "active").length,
    avg_spend: companies.length ? companies.reduce((s, c) => s + Number(c.total_spend), 0) / companies.length : 0,
    total_revenue: companies.reduce((s, c) => s + Number(c.total_spend), 0),
  }), [companies, total]);

  const pages = Math.ceil(total / PAGE_SIZE);

  async function handleExport() {
    setExportLoading(true);
    try { await adminService.exportCompaniesCsv(); } catch { /* ignore */ } finally { setExportLoading(false); }
  }

  // Bulk "Set Your Password" invite — queues one email per customer (rate-safe).
  async function handleSendPasswordSetup() {
    try {
      const { count } = await adminService.getPasswordSetupCount();
      if (!count) { alert("No active customers with an email to send to."); return; }
      if (!confirm(
        `Send a "Set Your Password" email to all ${count} customers now?\n\n` +
        `Each customer gets their own secure link (valid 14 days) to create a password and log in. ` +
        `Emails are sent gradually in the background.`
      )) return;
      setPwSetupLoading(true);
      const res = await adminService.sendPasswordSetupToAll();
      alert(`Done ✅  A "Set Your Password" email has been queued for ${res.queued} customers. They'll receive it shortly.`);
    } catch (err) {
      alert(`Failed to send: ${err instanceof Error ? err.message : "Server error"}`);
    } finally {
      setPwSetupLoading(false);
    }
  }

  async function handleImportFile(file: File) {
    setImportLoading(true);
    setImportResult(null);
    try {
      const result = await adminService.importCompaniesCsv(file);
      setImportResult(result);
      load();
    } catch (err: unknown) {
      setImportResult({ created: 0, updated: 0, skipped_duplicate: 0, skipped_no_email: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const thStyle: React.CSSProperties = {
    padding: "11px 14px", textAlign: "left", fontSize: "10px",
    textTransform: "uppercase", letterSpacing: ".07em", color: "#7A7880", fontWeight: 700,
  };

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>

      {showAddModal && (
        <AddCustomerModal
          pricingTiers={pricingTiers}
          discountGroups={discountGroups}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); load(); }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "32px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>CUSTOMERS</h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "4px" }}>{total} companies · wholesale accounts</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
          />
          <button
            onClick={() => importInputRef.current?.click()} disabled={importLoading}
            style={{ padding: "10px 18px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: importLoading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "6px", opacity: importLoading ? .6 : 1 }}>
            {importLoading ? "Importing…" : "Import Customers"}
          </button>
          <button
            onClick={handleSendPasswordSetup} disabled={pwSetupLoading}
            title="Email every customer a secure link to set their password"
            style={{ padding: "10px 18px", border: "1px solid #1B3A5C", borderRadius: "8px", background: "#1B3A5C", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: pwSetupLoading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "6px", opacity: pwSetupLoading ? .6 : 1 }}>
            {pwSetupLoading ? "Sending…" : "✉ Send Password Setup"}
          </button>
          <button
            onClick={handleExport} disabled={exportLoading}
            style={{ padding: "10px 18px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: exportLoading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "6px", opacity: exportLoading ? .6 : 1 }}>
            <DownloadIcon size={14} color="#2A2830" /> {exportLoading ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}>
            + Add Customer
          </button>
        </div>
      </div>

      {importResult && (
        <div style={{ background: importResult.errors.length ? "rgba(232,36,42,.06)" : "rgba(5,150,105,.06)", border: `1px solid ${importResult.errors.length ? "rgba(232,36,42,.2)" : "rgba(5,150,105,.2)"}`, borderRadius: "8px", padding: "14px 16px", marginBottom: "20px", fontSize: "13px" }}>
          <div style={{ fontWeight: 700, marginBottom: "4px", color: "#2A2830" }}>
            Import complete — {importResult.created} created, {importResult.updated} updated (tier &amp; tax-exempt), {importResult.skipped_no_email} skipped (no email/id)
          </div>
          {importResult.errors.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px", color: "#E8242A" }}>
              {importResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              {importResult.errors.length > 10 && <li>…and {importResult.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="admin-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Total Customers", value: stats.total, icon: <UsersIcon size={22} color="#2A2830" />, color: "#2A2830" },
          { label: "Active Accounts", value: stats.active, icon: <CheckCircleIcon size={22} color="#059669" />, color: "#059669" },
          { label: "Avg Order Value", value: `$${stats.avg_spend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: <BarChartIcon size={22} color="#1A5CFF" />, color: "#1A5CFF" },
          { label: "Total Revenue", value: `$${stats.total_revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: <DollarSignIcon size={22} color="#D97706" />, color: "#D97706" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
            {s.icon}
            <div>
              <div style={{ fontFamily: "var(--font-bebas)", fontSize: "24px", color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "10px", color: "#7A7880", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="Search customers…"
          style={{ padding: "9px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", width: "220px" }}
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", background: "#fff", cursor: "pointer" }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "8px", fontSize: "13px", fontFamily: "var(--font-jakarta)", background: "#fff", cursor: "pointer" }}>
          <option value="created_at">Sort: Newest</option>
          <option value="total_spend">Sort: Most Spent</option>
          <option value="order_count">Sort: Most Orders</option>
        </select>
        <span style={{ fontSize: "13px", color: "#7A7880", marginLeft: "auto" }}>
          {sorted.length} result{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead>
            <tr style={{ background: "#F4F3EF", borderBottom: "2px solid #E2E0DA" }}>
              <th style={thStyle}>Company</th>
              <th style={thStyle}>Contact</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Orders</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount Spent</th>
              <th style={thStyle}>Joined</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && sorted.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>No customers found</td></tr>
            ) : sorted.map(co => {
              const statusCfg = STATUS_BADGE[co.status] ?? { bg: "rgba(156,163,175,.15)", color: "#9CA3AF" };
              const isRetail = co.account_type === "retail";
              return (
                <tr key={co.id}
                  onClick={() => router.push(`/admin/customers/${co.id}`)}
                  style={{ borderBottom: "1px solid #F4F3EF", cursor: "pointer", transition: "background .12s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "13px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: isRetail ? "#7C3AED" : "#1A5CFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-bebas)", fontSize: "15px", flexShrink: 0 }}>
                        {co.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: 700, fontSize: "13px", color: "#2A2830" }}>{co.name}</span>
                          <span style={{ padding: "1px 7px", borderRadius: "20px", fontSize: "10px", fontWeight: 700, background: isRetail ? "rgba(124,58,237,.1)" : "rgba(26,92,255,.1)", color: isRetail ? "#7C3AED" : "#1A5CFF", textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0 }}>
                            {isRetail ? "Retail" : "Wholesale"}
                          </span>
                        </div>
                        {co.phone && <div style={{ fontSize: "11px", color: "#7A7880" }}>{co.phone}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "13px 14px" }}>
                    {co.contact_name && <div style={{ fontSize: "13px", color: "#2A2830", fontWeight: 600 }}>{co.contact_name}</div>}
                    {co.email && <div style={{ fontSize: "12px", color: "#7A7880" }}>{co.email}</div>}
                    {co.phone && <div style={{ fontSize: "12px", color: "#7A7880" }}>📞 {co.phone}</div>}
                    {!co.contact_name && !co.email && !co.phone && <span style={{ color: "#bbb", fontSize: "13px" }}>—</span>}
                  </td>
                  <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{co.order_count}</td>
                  <td style={{ padding: "13px 14px", textAlign: "right", fontFamily: "var(--font-bebas)", fontSize: "18px", color: "#2A2830" }}>
                    ${Number(co.total_spend).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "13px 14px", fontSize: "12px", color: "#7A7880" }}>{new Date(co.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "13px 14px" }}>
                    <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: statusCfg.bg, color: statusCfg.color, textTransform: "capitalize" }}>
                      {co.status}
                    </span>
                  </td>
                  <td style={{ padding: "13px 14px" }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/admin/customers/${co.id}`)}
                      style={{ padding: "5px 12px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "7px 14px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontSize: "13px", fontWeight: 600 }}>
            ← Prev
          </button>
          <span style={{ fontSize: "13px", color: "#7A7880" }}>{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            style={{ padding: "7px 14px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.4 : 1, fontSize: "13px", fontWeight: 600 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
