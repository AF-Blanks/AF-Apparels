"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

/**
 * Reusable discount-code field for the checkout order summary. Self-contained:
 * reads/writes the shared `af_coupon` localStorage key (the same key the
 * review page + address/payment totals read), validates the code server-side,
 * and reports the discount amount to the parent via onChange so its total
 * updates. Shows an input when no code is applied, or the applied code + Remove.
 */
export default function CouponField({
  subtotal,
  isGuest,
  onChange,
}: {
  subtotal: number;
  isGuest: boolean;
  onChange: (discountAmount: number) => void;
}) {
  const [applied, setApplied] = useState<{ code: string; discount_amount: number } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("af_coupon");
    if (saved) {
      try {
        const a = JSON.parse(saved);
        if (a?.code) setApplied({ code: a.code, discount_amount: Number(a.discount_amount ?? 0) });
      } catch { /* ignore */ }
    }
  }, []);

  async function apply() {
    const code = input.trim();
    if (!code) return;
    setLoading(true); setError(null);
    try {
      const res = await apiClient.post<{ valid: boolean; message?: string; discount_amount?: number; discount_type?: string; code?: string }>(
        "/api/v1/discounts/validate",
        { code, cart_total: subtotal, customer_type: isGuest ? "guest" : "wholesale" }
      );
      if (!res.valid) {
        setError(res.message || "This discount code can't be applied.");
        return;
      }
      const a = { code: res.code || code, discount_amount: Number(res.discount_amount ?? 0), discount_type: res.discount_type || "" };
      if (typeof window !== "undefined") localStorage.setItem("af_coupon", JSON.stringify(a));
      setApplied({ code: a.code, discount_amount: a.discount_amount });
      onChange(a.discount_amount);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function remove() {
    if (typeof window !== "undefined") localStorage.removeItem("af_coupon");
    setApplied(null);
    setError(null);
    onChange(0);
  }

  if (applied) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#059669", padding: "8px 0", borderBottom: "1px solid #E2E2DE" }}>
        <span style={{ fontWeight: 600 }}>
          Coupon ({applied.code})
          <button onClick={remove} style={{ marginLeft: "8px", background: "none", border: "none", color: "#B91C1C", fontSize: "11px", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Remove</button>
        </span>
        <span style={{ fontWeight: 700 }}>-${applied.discount_amount.toFixed(2)}</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #E2E2DE" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          placeholder="Discount code"
          style={{ flex: 1, minWidth: 0, padding: "8px 10px", border: "1px solid #D6D6D0", borderRadius: "6px", fontSize: "13px", outline: "none" }}
        />
        <button
          onClick={apply}
          disabled={loading || !input.trim()}
          style={{ padding: "8px 16px", background: (loading || !input.trim()) ? "#C7C7C0" : "#1B3A5C", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: (loading || !input.trim()) ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
        >
          {loading ? "…" : "Apply"}
        </button>
      </div>
      {error && <div style={{ color: "#B91C1C", fontSize: "12px", marginTop: "6px" }}>{error}</div>}
    </div>
  );
}
