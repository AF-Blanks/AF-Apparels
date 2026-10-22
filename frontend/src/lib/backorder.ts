/**
 * One kind of order per cart: in stock, or on backorder — never both.
 *
 * The checkout already refuses a mixed order, but only after the customer has
 * filled a cart and reached for a card. The cart now holds one kind at a time:
 * whatever goes in first decides what may follow, until that order is placed or
 * the cart is emptied. The server enforces the same rule on every way into the
 * cart (backend: app/services/backorder_rules.py); these helpers let the pages
 * say so before the customer is refused.
 */
import { apiClient } from "@/lib/api-client";
import { cartService } from "@/services/cart.service";

export type CartKind = "in_stock" | "backorder" | "mixed";
type StockedVariant = { stock_quantity?: number | null; allow_backorder?: boolean } | null | undefined;

// Worded exactly as the server words them, so the page and a refusal agree.
export const IN_STOCK_CART_MESSAGE =
  "Your cart has in-stock items. Backordered items must be ordered separately — please complete your current order first, then add these in a new order.";
export const BACKORDER_CART_MESSAGE =
  "Your cart has backordered items. In-stock items must be ordered separately — please complete your current order first, then add these in a new order.";
export const MIXED_CART_MESSAGE =
  "Your cart already has both in-stock and backordered items. Please remove one group from your cart before adding more.";
export const MIXED_SELECTION_MESSAGE =
  "In-stock and backordered items can't be added together. Please add them as two separate orders.";

export function cartKindMessage(kind: CartKind): string {
  if (kind === "in_stock") return IN_STOCK_CART_MESSAGE;
  if (kind === "backorder") return BACKORDER_CART_MESSAGE;
  return MIXED_CART_MESSAGE;
}

/** What is on the shelf. Sold past zero is still nothing on the shelf. */
export function shelf(v: StockedVariant): number {
  return Math.max(0, Number(v?.stock_quantity ?? 0));
}

/** A line is a backorder when it asks for more than the shelf holds of a size marked sellable past zero. */
export function isBackorderLine(v: StockedVariant, qty: number): boolean {
  return !!v?.allow_backorder && qty > shelf(v);
}

export function kindOf(flags: boolean[]): CartKind | null {
  if (!flags.length) return null;
  const waiting = flags.some(Boolean);
  const ready = flags.some(f => !f);
  if (waiting && ready) return "mixed";
  return waiting ? "backorder" : "in_stock";
}

/** The checkbox's wording, with the date the goods are due when every line has one. */
export function backorderAckText(eta: string | null): string {
  return `I understand these items are on backorder and will ship when stock arrives${eta ? ` (expected ${eta})` : ""}.`;
}

/** What kind the customer's cart is now: from the server for an account, from the browser's basket for a guest. */
export async function loadCartKind(isAuthenticated: boolean): Promise<CartKind | null> {
  try {
    if (isAuthenticated) {
      const cart = await cartService.getCart();
      return kindOf((cart.items ?? []).map(i => Boolean(i.is_backordered)));
    }
    const entries: Array<{ variant_id: string; quantity: number }> =
      JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
    const lines = entries.filter(e => e?.variant_id && e.quantity > 0);
    if (!lines.length) return null;
    const r = await apiClient.post<{ backordered_variant_ids?: string[] }>("/api/v1/guest/stock-check", {
      items: lines.map(e => ({ variant_id: e.variant_id, quantity: e.quantity })),
    });
    const waiting = new Set(r.backordered_variant_ids ?? []);
    return kindOf(lines.map(e => waiting.has(e.variant_id)));
  } catch {
    // Not knowing must not lock the page; the server still refuses a mixed cart.
    return null;
  }
}
