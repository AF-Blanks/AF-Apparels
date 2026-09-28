"use client";

import { useState } from "react";

/**
 * Record money that arrived outside the website — a cheque, cash, a transfer.
 *
 * The amount starts at the whole balance because that is the common case; a
 * part payment is typed over it. Nothing here settles an order on its own: the
 * server decides that when the balance reaches zero, so a mistyped figure
 * leaves the rest owing rather than closing the invoice.
 */

export interface RecordPaymentTarget {
  orderId: string;
  orderNumber: string;
  due: number;
}

const METHODS: { value: string; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card (taken elsewhere)" },
  { value: "other", label: "Other" },
];

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RecordPaymentDialog({
  target, busy, onCancel, onSave,
}: {
  target: RecordPaymentTarget;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: { amount: number; method: string; reference: string; paid_on: string }) => void;
}) {
  const [amount, setAmount] = useState(target.due.toFixed(2));
  const [method, setMethod] = useState("check");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));

  const value = Number(amount);
  const tooMuch = Number.isFinite(value) && value > target.due + 0.005;
  const invalid = !Number.isFinite(value) || value <= 0 || tooMuch;
  const remaining = Number.isFinite(value) ? Math.max(0, target.due - value) : target.due;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">
            Record a payment · Invoice {target.orderNumber}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {money(target.due)} is outstanding on this invoice. This is for money already
            received — it takes nothing from the customer.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700">Amount received</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                style={{ fontVariantNumeric: "tabular-nums" }}
              />
              <button type="button" onClick={() => setAmount(target.due.toFixed(2))}
                className="whitespace-nowrap rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                Full {money(target.due)}
              </button>
            </div>
            {tooMuch ? (
              <p className="mt-1 text-xs font-semibold text-red-600">
                That is more than the {money(target.due)} still due.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                {remaining > 0.005
                  ? `${money(remaining)} will still be owed after this.`
                  : "This settles the invoice in full."}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700">How it was paid</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700">Date received</label>
              <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700">
              Reference <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Check number, transfer reference…"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <p className="text-xs text-gray-400">
            The same amount is recorded against this invoice in QuickBooks.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onCancel} disabled={busy}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => onSave({ amount: value, method, reference: reference.trim(), paid_on: paidOn })}
            disabled={busy || invalid}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {busy ? "Saving…" : "Record payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
