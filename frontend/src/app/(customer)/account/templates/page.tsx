"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { accountService } from "@/services/account.service";
import { ApiClientError } from "@/lib/api-client";
import { backorderAckText } from "@/lib/backorder";

interface Template {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
}

export default function AccountTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // A template holding backordered lines needs the same tick the product page
  // asks for (one kind of order per cart — see lib/backorder.ts).
  const [ackFor, setAckFor] = useState<string | null>(null);
  const [ackTicked, setAckTicked] = useState(false);
  const [errorFor, setErrorFor] = useState<{ id: string; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    accountService.getTemplates().then((d) => setTemplates(d as Template[]));
  }, []);

  async function handleLoad(id: string, acknowledge = false) {
    setLoadingId(id);
    setErrorFor(null);
    try {
      await accountService.loadTemplate(id, acknowledge);
      window.dispatchEvent(new Event("cart_updated"));
      router.push("/cart");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "BACKORDER_ACK_REQUIRED") {
        setAckFor(id);
        setAckTicked(false);
      } else {
        setErrorFor({ id, text: err instanceof Error ? err.message : "Couldn't load this template." });
      }
    } finally { setLoadingId(null); }
  }

  async function handleDelete(id: string) {
    await accountService.deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Order Templates</h1>
      <p className="text-sm text-gray-500 mb-4">Saved order templates let you quickly reorder common product combinations.</p>

      {templates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No templates saved yet. Add items to cart and click "Save as Template".</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.item_count} item{t.item_count !== 1 ? "s" : ""} · Saved {new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLoad(t.id)}
                    disabled={!!loadingId}
                    className="bg-brand-600 text-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                  >
                    {loadingId === t.id ? "Loading…" : "Load to Cart"}
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>

              {ackFor === t.id && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <label className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackTicked}
                      onChange={(e) => setAckTicked(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>This template has backordered items. {backorderAckText(null)}</span>
                  </label>
                  <button
                    onClick={() => handleLoad(t.id, true)}
                    disabled={!ackTicked || !!loadingId}
                    className="mt-2 bg-brand-600 text-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                  >
                    Load to Cart
                  </button>
                </div>
              )}

              {errorFor?.id === t.id && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{errorFor.text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
