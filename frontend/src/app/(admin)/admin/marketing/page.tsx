"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { adminService } from "@/services/admin.service";

const RichTextEditor = dynamic(
  () => import("@/components/admin/RichTextEditor").then(m => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div style={{ border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "14px 16px", minHeight: "220px", color: "#aaa", fontSize: "14px" }}>
        Loading editor…
      </div>
    ),
  }
);

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};
const sectionCard: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px",
  padding: "24px", marginBottom: "16px",
};

interface Campaign {
  id: string;
  subject: string;
  recipient_count: number;
  sent_at: string | null;
}

export default function MarketingPage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{ recipient_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    adminService.getMarketingRecipientsCount().then(r => setRecipientCount(r.count)).catch(() => {});
    loadCampaigns();
  }, []);

  function loadCampaigns() {
    adminService.listMarketingCampaigns().then(setCampaigns).catch(() => {});
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const result = await adminService.sendMarketingCampaign(subject.trim(), body);
      setSuccess({ recipient_count: result.recipient_count });
      setSubject("");
      setBody("");
      setConfirming(false);
      loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setSending(false);
    }
  }

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !!recipientCount;

  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", letterSpacing: ".02em", lineHeight: 1 }}>
          EMAIL CAMPAIGNS
        </h1>
        <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "6px" }}>
          Send a one-off email update to your active wholesale customers.
        </p>
      </div>

      {success && (
        <div style={{ background: "rgba(5,150,105,.08)", border: "1px solid rgba(5,150,105,.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#059669", fontWeight: 600 }}>
          ✓ Campaign queued — sending to {success.recipient_count} customer{success.recipient_count !== 1 ? "s" : ""}.
        </div>
      )}
      {error && (
        <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid #FECACA", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#E8242A" }}>
          {error}
        </div>
      )}

      <div style={sectionCard}>
        <div style={{ marginBottom: "18px" }}>
          <label style={labelStyle}>Subject <span style={{ color: "#E8242A" }}>*</span></label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. New products now available"
            style={{ ...inputStyle, fontSize: "16px", fontWeight: 600 }}
          />
        </div>
        <div>
          <label style={labelStyle}>
            Message
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#B0ADBA", marginLeft: "8px" }}>
              use {"{{first_name}}"} to greet each customer by name
            </span>
          </label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Write your update to customers…"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E2E0DA" }}>
          <span style={{ fontSize: "13px", color: "#7A7880" }}>
            {recipientCount === null ? "Loading recipient count…" : `Will send to ${recipientCount} active customer${recipientCount !== 1 ? "s" : ""}`}
          </span>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!canSend}
              style={{ padding: "11px 24px", background: canSend ? "#1A5CFF" : "#E2E0DA", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "14px", cursor: canSend ? "pointer" : "not-allowed" }}
            >
              Review & Send
            </button>
          ) : (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#E8242A" }}>
                Send to {recipientCount} customer{recipientCount !== 1 ? "s" : ""}?
              </span>
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                style={{ padding: "10px 18px", border: "1px solid #E2E0DA", borderRadius: "8px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                style={{ padding: "10px 18px", background: "#E8242A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? .65 : 1 }}
              >
                {sending ? "Sending…" : "Confirm Send"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={sectionCard}>
        <h3 style={{ fontFamily: "var(--font-bebas)", fontSize: "16px", letterSpacing: ".06em", color: "#2A2830", marginBottom: "14px" }}>
          RECENT CAMPAIGNS
        </h3>
        {campaigns.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#aaa", fontSize: "13px" }}>No campaigns sent yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #E2E0DA" }}>
                {["Subject", "Recipients", "Sent"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em", color: "#7A7880", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid #F4F3EF" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{c.subject}</td>
                  <td style={{ padding: "10px 12px" }}>{c.recipient_count}</td>
                  <td style={{ padding: "10px 12px", color: "#7A7880" }}>{c.sent_at ? new Date(c.sent_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
