"use client";

/**
 * The reminder, shown to whoever is about to send it.
 *
 * Reached from two places — the order itself, and the outstanding report that
 * found it — and it is the same conversation from both, so it lives here rather
 * than twice.
 *
 * The draft arrives from the server already written. What the admin leaves in
 * the box is what gets sent, unaltered: someone who has rephrased this knows
 * the customer better than a template does.
 */
export interface ReminderDraft {
  to_email: string;
  subject: string;
  message: string;
  amount_due: number;
  account_due: number;
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentReminderDialog({
  draft, orderNumber, busy, onChange, onCancel, onSend,
}: {
  draft: ReminderDraft;
  orderNumber?: string;
  busy: boolean;
  onChange: (d: ReminderDraft) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const label = "block text-xs font-bold text-gray-500 mb-1";
  const field = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm";

  return (
    <div
      onClick={() => !busy && onCancel()}
      className="fixed inset-0 z-[9998] bg-black/45 flex items-start justify-center overflow-y-auto"
      style={{ padding: "40px 16px" }}
    >
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-[620px] p-6 shadow-2xl">
        <h3 className="text-lg font-extrabold text-gray-900 mb-1">
          Send payment reminder{orderNumber ? ` — order ${orderNumber}` : ""}
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          {money(draft.amount_due)} outstanding on this order
          {draft.account_due > draft.amount_due + 0.005
            ? ` · ${money(draft.account_due)} across all their open orders`
            : ""}
        </p>

        <label className={label}>To</label>
        <input value={draft.to_email} className={`${field} mb-4`}
          onChange={e => onChange({ ...draft, to_email: e.target.value })} />

        <label className={label}>Subject</label>
        <input value={draft.subject} className={`${field} mb-4`}
          onChange={e => onChange({ ...draft, subject: e.target.value })} />

        <label className={label}>
          Message <span className="font-normal">— change it however you like</span>
        </label>
        <textarea value={draft.message} rows={13}
          onChange={e => onChange({ ...draft, message: e.target.value })}
          className={`${field} leading-relaxed`} style={{ resize: "vertical" }} />
        <p className="text-[11px] text-gray-400 mt-1.5">
          The order number, the amount and a link to the invoice are added below your message.
        </p>

        <div className="flex gap-2.5 justify-end mt-5">
          <button onClick={onCancel} disabled={busy}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-bold text-gray-500 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSend} disabled={busy || !draft.to_email.trim()}
            className="px-5 py-2 rounded-md bg-amber-700 text-white text-sm font-bold disabled:opacity-50">
            {busy ? "Sending…" : "Send reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
