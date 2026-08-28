"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminService } from "@/services/admin.service";
import { apiClient } from "@/lib/api-client";

interface OrderItem {
  id: string;
  sku: string;
  product_code?: string | null;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
}

// Group order lines by product + colour into a compact size run so the same
// colour's sizes render as one row (a matrix) instead of a long list of rows.
const _ORDER_SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL"];
function groupOrderItems(items: OrderItem[]) {
  const rank = (s: string | null) => {
    const i = _ORDER_SIZE_ORDER.indexOf((s ?? "").toUpperCase());
    return i === -1 ? 999 : i;
  };
  const map = new Map<string, {
    key: string; product_name: string; product_code?: string | null; color: string | null;
    sizes: { id: string; size: string | null; quantity: number; line_total: number }[];
    totalQty: number; totalPrice: number; minPrice: number; maxPrice: number;
  }>();
  for (const it of items ?? []) {
    const key = `${it.product_name}||${it.color ?? ""}`;
    let g = map.get(key);
    if (!g) {
      g = { key, product_name: it.product_name, product_code: it.product_code, color: it.color, sizes: [], totalQty: 0, totalPrice: 0, minPrice: Infinity, maxPrice: 0 };
      map.set(key, g);
    }
    const up = Number(it.unit_price);
    g.sizes.push({ id: it.id, size: it.size, quantity: it.quantity, line_total: Number(it.line_total) });
    g.totalQty += it.quantity;
    g.totalPrice += Number(it.line_total);
    g.minPrice = Math.min(g.minPrice, up);
    g.maxPrice = Math.max(g.maxPrice, up);
  }
  const arr = Array.from(map.values());
  arr.forEach(g => g.sizes.sort((a, b) => rank(a.size) - rank(b.size)));
  return arr;
}

interface ShippingAddress {
  full_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  postal_code?: string;
  country?: string;
}

interface AdminOrder {
  id: string;
  order_number: string;
  company_name: string;
  company_id: string;
  status: string;
  payment_status: string;
  po_number: string | null;
  order_notes: string | null;
  tracking_number: string | null;
  tracking_url?: string | null;
  label_url?: string | null;
  carrier?: string | null;
  shipping_rate_id?: string | null;
  courier: string | null;
  courier_service: string | null;
  shipped_at: string | null;
  qb_invoice_id: string | null;
  /** An invoice in QuickBooks is not the same as the money being recorded against it. */
  qb_payment_id?: string | null;
  /** Where the bank debit has got to — money moves over days, not at once. */
  qb_echeck_status?: string | null;
  /** Evidence the customer allowed the debit — produced if one is ever disputed. */
  ach_authorized_at?: string | null;
  ach_authorized_ip?: string | null;
  ach_authorization_text?: string | null;
  subtotal: string;
  shipping_cost: string;
  tax_amount?: string;
  discount_percent?: string | number | null;
  discount_amount?: string | number | null;
  total: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
  shipping_address?: ShippingAddress;
  shipping_method?: string | null;
  // Customer fields (may not be present)
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  pricing_tier?: string;
  payment_method?: string;
  // ACH fields
  ach_bank_name?: string | null;
  ach_account_holder?: string | null;
  ach_account_last4?: string | null;
  ach_account_type?: string | null;
  ach_verified?: boolean | null;
  // Invoice & payment tracking
  payment_terms?: string | null;
  invoice_sent_at?: string | null;
  marked_paid_at?: string | null;
  marked_paid_by?: string | null;
  amount_paid?: string | null;
  balance_due?: string | null;
  is_fully_paid?: boolean;
  // Timeline
  timeline?: Array<{ status: string; message: string; created_by: string; created_at: string }>;
  // Pre-calculated shipment weight from backend (used to pre-fill rate fetch)
  calculated_weight_lbs?: number;
  // Admin edits
  items_edited?: boolean;
  convenience_fee?: string | null;
  // Multi-box labels JSON string
  all_labels?: string | null;
}

interface BoxSummary {
  num_boxes: number;
  total_weight_lbs: number;
  weight_per_box_lbs: number;
  boxes: { box_number: number; weight_lbs: number }[];
  manual_box_count?: number | null;
}

interface BoxLabel {
  box_number: number;
  tracking_number: string;
  tracking_url?: string;
  label_url: string;
  carrier: string;
  service: string;
}

interface CustomerStats {
  total_orders: number;
  total_spent: number;
  created_at: string;
}

interface CompanyRegistration {
  company_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  how_heard: string | null;
  num_employees: string | null;
  num_sales_reps: string | null;
  secondary_business: string | null;
  estimated_annual_volume: string | null;
  ppac_number: string | null;
  ppai_number: string | null;
  asi_number: string | null;
  fax: string | null;
}

interface AdminRate {
  rate_id: string;
  carrier: string;
  service: string;
  cost: number;
  currency: string;
  days: number | null;
}

const CARRIER_LOGOS: Record<string, string> = {
  USPS: "https://shippo-static.s3.amazonaws.com/providers/75/USPS.png",
  UPS: "https://shippo-static.s3.amazonaws.com/providers/75/UPS.png",
  FedEx: "https://shippo-static.s3.amazonaws.com/providers/75/FedEx.png",
  DHL: "https://shippo-static.s3.amazonaws.com/providers/75/DHL_Express.png",
};

const STATUSES = ["pending", "confirmed", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled", "refunded"];

function getAvailableStatuses(currentStatus: string): string[] {
  if (currentStatus === "delivered") return ["delivered", "refunded"];
  if (currentStatus === "cancelled") return ["cancelled", "refunded"];
  return STATUSES.filter(s => s !== "refunded");
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: "#D97706",
    confirmed: "#1A5CFF",
    processing: "#6366F1",
    ready_for_pickup: "#0891B2",
    shipped: "#8B5CF6",
    delivered: "#059669",
    cancelled: "#E8242A",
    refunded: "#6B7280",
  };
  return map[status] ?? "#7A7880";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  ready_for_pickup: "Ready for Pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const COURIERS = [
  { id: "fedex", name: "FedEx",  icon: "FX",  services: ["Ground", "2-Day", "Overnight", "Express Saver"] },
  { id: "ups",   name: "UPS",    icon: "UPS", services: ["Ground", "2-Day Air", "Next Day Air", "3-Day Select"] },
  { id: "usps",  name: "USPS",   icon: "US",  services: ["Priority Mail", "Priority Express", "First Class", "Parcel Select"] },
  { id: "dhl",   name: "DHL",    icon: "DHL", services: ["Express", "Economy Select", "Expedited"] },
  { id: "other", name: "Other",  icon: "→",   services: ["Standard", "Express"] },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:           { bg: "rgba(217,119,6,.1)",   color: "#D97706" },
  confirmed:         { bg: "rgba(26,92,255,.1)",   color: "#1A5CFF" },
  processing:        { bg: "rgba(99,102,241,.1)",  color: "#6366F1" },
  ready_for_pickup:  { bg: "rgba(8,145,178,.1)",   color: "#0891B2" },
  shipped:           { bg: "rgba(139,92,246,.1)",  color: "#8B5CF6" },
  delivered:         { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  cancelled:         { bg: "rgba(232,36,42,.1)",   color: "#E8242A" },
  refunded:          { bg: "rgba(107,114,128,.1)", color: "#6B7280" },
  authorized:        { bg: "rgba(245,158,11,.1)",  color: "#D97706" },
  paid:              { bg: "rgba(5,150,105,.1)",   color: "#059669" },
  unpaid:            { bg: "rgba(107,114,128,.1)", color: "#6B7280" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "rgba(0,0,0,.06)", color: "#555" };
  const label = STATUS_LABEL[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
      {label}
    </span>
  );
}

function generateTrackingNumber(courier: string): string {
  const prefix: Record<string, string> = { fedex: "7489", ups: "1Z", usps: "9400", dhl: "JD", other: "TRK" };
  const p = prefix[courier] ?? "TRK";
  const random = Math.random().toString(36).substring(2, 12).toUpperCase();
  const ts = Date.now().toString().slice(-6);
  return `${p}${ts}${random}`;
}

const LabelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: ".08em",
  color: "#7A7880", marginBottom: "6px", display: "block",
};

const CardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #E2E0DA",
  borderRadius: "10px", padding: "20px", marginBottom: "16px",
};

const SectionHead: React.CSSProperties = {
  fontFamily: "var(--font-bebas)", fontSize: "16px",
  letterSpacing: ".06em", color: "#2A2830",
};

const AddrInput: React.CSSProperties = {
  width: "100%", padding: "7px 10px", border: "1.5px solid #1A5CFF", borderRadius: "6px",
  fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box" as const,
};
const AddrLabel: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const,
  letterSpacing: ".06em", color: "#aaa", marginBottom: "3px", display: "block",
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [companyReg, setCompanyReg] = useState<CompanyRegistration | null>(null);
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Courier state (manual / local shipping)
  const [selectedCourier, setSelectedCourier] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [isShipping, setIsShipping] = useState(false);
  const [showManualShipping, setShowManualShipping] = useState(false);
  const [manualShippingAmount, setManualShippingAmount] = useState("");

  // Shippo label generation state
  const [selectedCarrier, setSelectedCarrier] = useState("");
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelResult, setLabelResult] = useState<{
    success?: boolean;
    tracking_number?: string;
    tracking_url?: string;
    label_url?: string;
    carrier?: string;
    service?: string;
    rate?: number;
    error?: string;
  } | null>(null);

  const [manualWeight, setManualWeight] = useState<number>(1.0);
  const [manualLabelLoading, setManualLabelLoading] = useState(false);
  const [adminRates, setAdminRates] = useState<AdminRate[]>([]);
  const [adminRatesLoading, setAdminRatesLoading] = useState(false);
  // Shippo hands back a normal-looking PDF on a test key, watermarked
  // "SAMPLE - DO NOT MAIL". Nothing else in the response says so, so warn here
  // rather than let a sample label reach a parcel.
  const [shippoTestMode, setShippoTestMode] = useState(false);
  const [resettingLabel, setResettingLabel] = useState(false);
  // A percentage keeps tracking the subtotal; a fixed amount is a figure that was
  // agreed and should not move when items do. Both are real cases, so ask which.
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [adminSelectedRateId, setAdminSelectedRateId] = useState<string | null>(null);
  const adminRatesRef = useRef<AdminRate[]>([]);

  const [boxSummary, setBoxSummary] = useState<BoxSummary | null>(null);
  const [allLabels, setAllLabels] = useState<BoxLabel[]>([]);

  const [isVerifyingAch, setIsVerifyingAch] = useState(false);
  const [isResendingInvoice, setIsResendingInvoice] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Notes state
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Shipping address edit state
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    full_name: "", address_line1: "", address_line2: "", city: "", state: "", postal_code: "", country: "US", phone: "",
  });
  const [savingAddress, setSavingAddress] = useState(false);

  // Order items edit mode
  const [editingItems, setEditingItems] = useState(false);
  // manual price override while editing an order's items
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [savingPriceKey, setSavingPriceKey] = useState<string | null>(null);

  // Add item state
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<{ variant_id: string; product_id: string; sku: string; product_name: string; color: string | null; size: string | null; price: number }[]>([]);
  const [itemRawData, setItemRawData] = useState<{ id: string; name: string; variants: { id: string; sku: string; color: string | null; size: string | null; retail_price: number }[] }[]>([]);
  const [sizeGrid, setSizeGrid] = useState<{ productName: string; color: string | null; rows: { variant_id: string; size: string | null; sku: string; price: number; qty: number }[] } | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [addItemMsg, setAddItemMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  // admin discount on this order (percent typed, amount comes off the subtotal)
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [recreatingInvoice, setRecreatingInvoice] = useState(false);
  // per-order email (send to this order's customer)
  const [showEmail, setShowEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  // change shipping method (customer changed their mind after ordering)
  const [editingShipping, setEditingShipping] = useState(false);
  const [shipMethodEdit, setShipMethodEdit] = useState("");
  const [shipCostEdit, setShipCostEdit] = useState("");
  const [savingShipping, setSavingShipping] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrderLoading(true);
    setOrderError(null);
    adminService.getOrder(id)
      .then(async (d) => {
        const o = d as AdminOrder;
        setOrder(o);
        setStatus(o.status);
        setManualWeight(o.calculated_weight_lbs ?? 1.0);
        setTracking(o.tracking_number ?? "");
        setNoteText(o.order_notes ?? "");
        if (o.courier) setSelectedCourier(o.courier);
        if (o.courier_service) setSelectedService(o.courier_service);
        if (o.tracking_number) setTrackingNumber(o.tracking_number);
        setTrackingUrl(o.tracking_url ?? "");
        const _cMap: Record<string, string> = { USPS: "usps", UPS: "ups", FedEx: "fedex" };
        if (o.tracking_number && o.label_url) {
          setLabelResult({
            success: true,
            tracking_number: o.tracking_number,
            tracking_url: o.tracking_url ?? undefined,
            label_url: o.label_url,
            carrier: o.courier ?? "",
            service: o.courier_service ?? "",
          });
          const raw = o.courier ?? "";
          setSelectedCarrier(_cMap[raw] ?? raw.toLowerCase());
        } else if (o.carrier) {
          // Pre-select the carrier the customer chose at checkout
          setSelectedCarrier(_cMap[o.carrier] ?? o.carrier.toLowerCase());
        }

        // Parse previously-generated multi-box labels from order.all_labels
        if (o.all_labels) {
          try {
            const parsed = JSON.parse(o.all_labels) as BoxLabel[];
            if (Array.isArray(parsed) && parsed.length > 0) setAllLabels(parsed);
          } catch { /* ignore */ }
        }

        // Fetch box summary for Standard Ground orders (no live Shippo rate)
        const _hasLiveRateOnLoad = !!o.shipping_rate_id;
        const _isWillCallOnLoad = !!(
          o.shipping_method?.toLowerCase().includes("will_call") ||
          o.shipping_method?.toLowerCase().includes("pickup")
        );
        if (!_hasLiveRateOnLoad && !_isWillCallOnLoad) {
          try {
            const bs = await apiClient.get<BoxSummary>(`/api/v1/admin/orders/${o.id}/box-summary`);
            if (bs && bs.num_boxes) {
              setBoxSummary(bs);
              // The field below is labelled PER BOX and a label is bought per box,
              // so it must hold one box's weight. Seeding it from the shipment
              // total asked the carriers to quote a single 187 lb package, which
              // is over the 150 lb limit — they returned nothing at all.
              if (bs.weight_per_box_lbs) setManualWeight(bs.weight_per_box_lbs);
            }
          } catch { /* box summary is optional */ }
        }

        // Fetch customer stats and company registration info (best-effort)
        if (o.company_id) {
          try {
            const stats = await apiClient.get<CustomerStats>(`/api/v1/admin/customers/${o.company_id}/stats`);
            if (stats) setCustomerStats(stats);
          } catch { /* stats are optional */ }
          try {
            const co = await apiClient.get<CompanyRegistration>(`/api/v1/admin/customers/${o.company_id}`);
            if (co) setCompanyReg(co);
          } catch { /* company info optional */ }
        }
      })
      .catch((err) => {
        setOrderError(err?.message || "Failed to load order.");
      })
      .finally(() => {
        setOrderLoading(false);
      });
  }, [id]);


  // Safeguard: restore rates from ref if React wipes state unexpectedly
  useEffect(() => {
    if (!adminRatesLoading && adminRates.length === 0 && adminRatesRef.current.length > 0) {
      setAdminRates(adminRatesRef.current);
    }
  });

  function handleCourierSelect(courierId: string) {
    setSelectedCourier(courierId);
    setSelectedService("");
    // Don't pre-fill a generated tracking number for manual/local shipping —
    // the admin pastes the real tracking ID from the courier.
    setTrackingNumber("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true); setMsg(null);
    try {
      await adminService.updateOrder(order?.id ?? id, { status });
      setMsg({ text: "Order updated successfully.", ok: true });
      setOrder(prev => prev ? { ...prev, status, tracking_number: tracking || null } : prev);
    } catch {
      setMsg({ text: "Failed to update order.", ok: false });
    } finally { setIsSaving(false); }
  }

  async function handleSyncQB() {
    setIsSyncing(true); setMsg(null);
    try {
      const res = await adminService.syncOrderToQb(order?.id ?? id) as { message?: string; action?: string } | undefined;
      setMsg({ text: res?.message || "QuickBooks sync queued.", ok: true });
      // The worker writes the payment id a moment later; re-read so the row
      // stops offering to do something that has already been done.
      if (res?.action === "payment_queued") {
        setTimeout(() => {
          adminService.getOrder(order?.id ?? id)
            .then(fresh => setOrder(fresh as AdminOrder))
            .catch(() => { /* the row simply stays until the page is reopened */ });
        }, 4000);
      }
    } catch (err: unknown) {
      setMsg({ text: err instanceof Error ? err.message : "QB sync failed.", ok: false });
    } finally { setIsSyncing(false); }
  }

  async function handleDeleteOrder() {
    if (!order) return;
    const paidWarn = order.payment_status === "paid"
      ? "\n\n⚠️ This order is marked PAID. Deleting it removes it from reports and voids its QuickBooks invoice."
      : "";
    if (!window.confirm(`Delete order ${order.order_number} permanently? This cannot be undone.${paidWarn}`)) return;
    setDeleting(true); setMsg(null);
    try {
      await adminService.deleteOrder(order.id ?? id);
      router.push("/admin/orders");
    } catch (err: unknown) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to delete order.", ok: false });
      setDeleting(false);
    }
  }

  async function openEmailComposer() {
    if (!order?.company_id) { setMsg({ text: "This order has no company on file to email.", ok: false }); return; }
    setEmailSubject(""); setEmailBody(""); setEmailRecipients([]); setShowEmail(true);
    try {
      const r = await adminService.getCustomerEmailRecipients(order.company_id) as { emails: string[] };
      setEmailRecipients(r.emails ?? []);
    } catch { setEmailRecipients([]); }
  }

  async function handleSendEmail() {
    if (!order?.company_id) return;
    if (!emailSubject.trim() || !emailBody.trim()) { setMsg({ text: "Add a subject and a message first", ok: false }); return; }
    setSendingEmail(true);
    try {
      const html = emailBody.trim().replace(/\n/g, "<br>");
      const r = await adminService.sendCustomerEmail(order.company_id, emailSubject.trim(), html) as { count: number; sent_to: string[] };
      setMsg({ text: `Email sent to ${r.sent_to.join(", ")}`, ok: true });
      setShowEmail(false);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to send email", ok: false });
    } finally {
      setSendingEmail(false);
    }
  }

  const SHIP_METHODS = [
    { value: "will_call", label: "Will Call Pickup", zeroCost: true },
    { value: "free", label: "Free Shipping", zeroCost: true },
    { value: "standard", label: "Standard / Courier", zeroCost: false },
    { value: "pallet", label: "Pallet", zeroCost: false },
  ];

  function openShippingEditor() {
    if (!order) return;
    setShipMethodEdit(order.shipping_method || "standard");
    setShipCostEdit(order.shipping_cost ? String(Number(order.shipping_cost)) : "0");
    setEditingShipping(true);
  }

  async function handleSaveShipping() {
    if (!order) return;
    const method = shipMethodEdit;
    const zero = SHIP_METHODS.find(m => m.value === method)?.zeroCost;
    const cost = zero ? 0 : (parseFloat(shipCostEdit) || 0);
    setSavingShipping(true); setMsg(null);
    try {
      await adminService.updateOrder(order.id ?? id, { shipping_method: method, shipping_cost: cost });
      // Reload so the recomputed total + shipping display refresh everywhere.
      const fresh = await adminService.getOrder(order.id ?? id) as AdminOrder;
      setOrder(fresh);
      setEditingShipping(false);
      setMsg({ text: "Shipping updated — invoice total recalculated.", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to update shipping", ok: false });
    } finally {
      setSavingShipping(false);
    }
  }

  async function handleRecreateInvoice() {
    if (!order) return;
    if (!window.confirm(`Recreate the QuickBooks invoice for order ${order.order_number}? A fresh invoice will be created in QuickBooks and emailed to the customer. Use this if its invoice was deleted.`)) return;
    setRecreatingInvoice(true); setMsg(null);
    try {
      const r = await adminService.recreateQbInvoice(order.id ?? id) as { message: string };
      setMsg({ text: r.message || "Recreating invoice in QuickBooks…", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to recreate invoice", ok: false });
    } finally {
      setRecreatingInvoice(false);
    }
  }

  async function handleSetBoxCount(n: number | null) {
    if (!order) return;
    const oid = order.id ?? id;
    try {
      await apiClient.patch(`/api/v1/admin/orders/${oid}/box-count`, { box_count: n });
      const bs = await apiClient.get<BoxSummary>(`/api/v1/admin/orders/${oid}/box-summary`);
      if (bs) {
        setBoxSummary(bs);
        // Splitting into more boxes makes each one lighter — requote against the
        // new per-box weight, not the one from the previous split.
        if (bs.weight_per_box_lbs) setManualWeight(bs.weight_per_box_lbs);
        setAdminRates([]);
        adminRatesRef.current = [];
        setAdminSelectedRateId(null);
      }
    } catch {
      setMsg({ text: "Couldn't update box count", ok: false });
    }
  }

  async function handleSaveDiscount(clear = false) {
    if (!order) return;
    const byAmount = !clear && discountMode === "amount";
    const value = clear ? 0 : parseFloat(discountInput);
    if (!clear) {
      if (!Number.isFinite(value) || value < 0) {
        setMsg({ text: byAmount ? "Enter a discount amount" : "Enter a discount between 0 and 100%", ok: false });
        return;
      }
      if (byAmount && value > Number(order.subtotal ?? 0)) {
        setMsg({ text: `A $${value.toFixed(2)} discount is more than the $${Number(order.subtotal ?? 0).toFixed(2)} of goods on this order.`, ok: false });
        return;
      }
      if (!byAmount && value > 100) {
        setMsg({ text: "Enter a discount between 0 and 100%", ok: false });
        return;
      }
    }
    setSavingDiscount(true); setMsg(null);
    try {
      await apiClient.patch(
        `/api/v1/admin/orders/${order.id ?? id}/discount`,
        byAmount ? { discount_amount: value } : { discount_percent: value },
      );
      // Reload so the subtotal, discount and total shown are the server's own
      // figures — the invoice must never disagree with what's on screen.
      const fresh = await adminService.getOrder(order.id ?? id) as AdminOrder;
      setOrder(fresh);
      setEditingDiscount(false);
      setMsg({
        text: value > 0
          ? (byAmount ? `$${value.toFixed(2)} discount applied` : `${value}% discount applied`)
          : "Discount removed",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to apply discount", ok: false });
    } finally {
      setSavingDiscount(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!order) return;
    setDownloadingInvoice(true); setMsg(null);
    try {
      await adminService.downloadOrderInvoice(order.id ?? id, order.order_number);
    } catch {
      setMsg({ text: "Couldn't generate the invoice PDF. Please try again.", ok: false });
    } finally {
      setDownloadingInvoice(false);
    }
  }

  async function handleMarkShipped() {
    if (!selectedCourier || !selectedService) return;
    setIsShipping(true); setMsg(null);
    try {
      const shippingCostValue = manualShippingAmount.trim() ? parseFloat(manualShippingAmount) : undefined;
      await apiClient.patch(`/api/v1/admin/orders/${order?.id ?? id}/status`, {
        status: "shipped",
        tracking_number: trackingNumber || undefined,
        tracking_url: trackingUrl.trim() || undefined,
        courier: selectedCourier,
        courier_service: selectedService,
        shipping_cost: shippingCostValue,
      });
      const courierLabel = COURIERS.find(c => c.id === selectedCourier)?.name ?? selectedCourier;
      setMsg({ text: `Order marked as shipped via ${courierLabel} ${selectedService}.`, ok: true });
      setOrder(prev => prev ? {
        ...prev, status: "shipped",
        tracking_number: trackingNumber || null,
        courier: selectedCourier, courier_service: selectedService,
        shipping_cost: shippingCostValue !== undefined ? String(shippingCostValue) : prev.shipping_cost,
        shipped_at: new Date().toISOString(),
      } : prev);
      setStatus("shipped");
      setTracking(trackingNumber);
      setShowManualShipping(false);
    } catch {
      setMsg({ text: "Failed to mark as shipped.", ok: false });
    } finally { setIsShipping(false); }
  }

  async function handleGenerateLabel() {
    if (!selectedCarrier) return;
    setLabelLoading(true); setMsg(null); setLabelResult(null); setAllLabels([]);
    try {
      const result = await apiClient.post<{
        success?: boolean; tracking_number?: string; tracking_url?: string;
        label_url?: string; carrier?: string; service?: string; rate?: number; error?: string;
        num_boxes?: number; labels?: BoxLabel[];
      }>(`/api/v1/admin/orders/${order?.id ?? id}/labels`, { carrier: selectedCarrier });
      if (result.success) {
        const boxes = result.num_boxes ?? 1;
        setMsg({ text: `${boxes > 1 ? `${boxes} labels` : "Label"} generated — ${result.carrier?.toUpperCase()} ${result.service}`, ok: true });
        if (result.labels && result.labels.length > 1) {
          setAllLabels(result.labels);
        } else {
          setLabelResult(result);
        }
        setOrder(prev => prev ? {
          ...prev,
          status: "shipped",
          tracking_number: result.tracking_number ?? prev.tracking_number,
          tracking_url: result.tracking_url ?? prev.tracking_url,
          label_url: result.label_url ?? prev.label_url,
          courier: result.carrier ?? prev.courier,
          courier_service: result.service ?? prev.courier_service,
          shipped_at: prev.shipped_at ?? new Date().toISOString(),
        } : prev);
        setStatus("shipped");
        if (result.tracking_number) setTracking(result.tracking_number);
      } else {
        setLabelResult(result);
        setMsg({ text: result.error ?? "Label generation failed.", ok: false });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to generate label.";
      setLabelResult({ success: false, error: errMsg });
      setMsg({ text: errMsg, ok: false });
    } finally {
      setLabelLoading(false);
    }
  }

  async function handleResetLabel() {
    // Buying a second label does not undo the first, so make the admin say it out
    // loud — on a live key the old one is real money already spent.
    const detail = labelResult?.tracking_number
      ? `

Current label: ${(labelResult.carrier ?? "").toUpperCase()} ${labelResult.service ?? ""} — ${labelResult.tracking_number}`
      : "";
    if (!window.confirm(
      "Clear this shipping label so a new one can be generated?" + detail +
      `

The existing label is NOT refunded — if it was a real one, request the refund from Shippo. The order's status is not changed.`
    )) return;
    setResettingLabel(true);
    setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/reset-label`, {});
      setLabelResult(null);
      setAllLabels([]);
      setAdminRates([]);
      adminRatesRef.current = [];
      setAdminSelectedRateId(null);
      setOrder(prev => prev ? { ...prev, tracking_number: null, tracking_url: null, label_url: null } : prev);
      setMsg({ text: "Label cleared — fetch rates and generate a new one.", ok: true });
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't clear the label.", ok: false });
    } finally {
      setResettingLabel(false);
    }
  }

  async function handleFetchAdminRates() {
    setAdminRatesLoading(true);
    setMsg(null);
    adminRatesRef.current = [];
    setAdminRates([]);
    setAdminSelectedRateId(null);
    try {
      const result = await apiClient.post<{
        rates: AdminRate[]; error?: string; box_count?: number; missing_carriers?: string[]; test_mode?: boolean;
      }>(
        `/api/v1/admin/orders/${order?.id ?? id}/fetch-rates`,
        { weight_lbs: manualWeight, box_count: boxSummary?.num_boxes ?? 1 }
      );
      setShippoTestMode(!!result.test_mode);
      const rates = result.rates ?? [];
      adminRatesRef.current = rates;
      setAdminRates(rates);
      if (rates.length > 0) {
        setAdminSelectedRateId(rates[0]!.rate_id);
        // A carrier that was still computing is absent, not unavailable — say so,
        // otherwise a short list looks like the full set of options.
        const late = result.missing_carriers ?? [];
        if (late.length > 0) {
          setMsg({
            text: `${late.map(c => c.toUpperCase()).join(" and ")} hadn't answered yet — click Refresh Rates again to include ${late.length > 1 ? "them" : "it"}.`,
            ok: false,
          });
        }
      } else {
        // An empty list is not self-explanatory — Shippo returns one for an
        // address the carriers won't serve just as readily as for a bad weight.
        setMsg({
          text: result.error
            ? `No carrier rates: ${result.error}`
            : `No carrier rates came back for ${manualWeight} lbs to this address. Check the per-box weight and the shipping address.`,
          ok: false,
        });
      }
    } catch (e: unknown) {
      adminRatesRef.current = [];
      setAdminRates([]);
      setMsg({ text: e instanceof Error ? e.message : "Couldn't fetch carrier rates.", ok: false });
    } finally {
      setAdminRatesLoading(false);
    }
  }

  async function handleGenerateManualLabel() {
    const selectedRate = adminRates.find(r => r.rate_id === adminSelectedRateId);
    if (!selectedRate) return;
    setManualLabelLoading(true); setMsg(null); setLabelResult(null); setAllLabels([]);
    try {
      const result = await apiClient.post<{
        success?: boolean; num_boxes?: number; tracking_number?: string; tracking_url?: string;
        label_url?: string; carrier?: string; service?: string; rate?: number; error?: string;
        labels?: BoxLabel[];
      }>(`/api/v1/admin/orders/${order?.id ?? id}/generate-label-manual`, {
        rate_id: selectedRate.rate_id,
        carrier: selectedRate.carrier,
        service: selectedRate.service,
      });
      setLabelResult(result);
      if (result.success) {
        const numBoxes = result.num_boxes ?? 1;
        const boxText = numBoxes > 1 ? ` (${numBoxes} boxes)` : "";
        setMsg({ text: `Label generated${boxText} — ${result.carrier?.toUpperCase()} ${result.service}`, ok: true });
        if (result.labels && result.labels.length > 0) {
          setAllLabels(result.labels);
        }
        setOrder(prev => prev ? {
          ...prev,
          status: "shipped",
          tracking_number: result.tracking_number ?? prev.tracking_number,
          tracking_url: result.tracking_url ?? prev.tracking_url,
          label_url: result.label_url ?? prev.label_url,
          courier: result.carrier ?? prev.courier,
          courier_service: result.service ?? prev.courier_service,
          shipped_at: prev.shipped_at ?? new Date().toISOString(),
        } : prev);
        setStatus("shipped");
        if (result.tracking_number) setTracking(result.tracking_number);
      } else {
        setMsg({ text: result.error ?? "Label generation failed.", ok: false });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to generate label.";
      setLabelResult({ success: false, error: errMsg });
      setMsg({ text: errMsg, ok: false });
    } finally {
      setManualLabelLoading(false);
    }
  }

  async function handleCapturePayment() {
    setIsCapturing(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/capture`, {});
      setMsg({ text: "Payment captured successfully.", ok: true });
      setOrder(prev => prev ? { ...prev, payment_status: "paid" } : prev);
    } catch {
      setMsg({ text: "Failed to capture payment.", ok: false });
    } finally { setIsCapturing(false); }
  }

  async function handleVerifyAch() {
    setIsVerifyingAch(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/verify-ach`, {});
      setMsg({ text: "ACH payment verified. Order payment status updated to Paid.", ok: true });
      setOrder(prev => prev ? { ...prev, payment_status: "paid", ach_verified: true } : prev);
    } catch {
      setMsg({ text: "Failed to verify ACH payment.", ok: false });
    } finally { setIsVerifyingAch(false); }
  }

  async function handleResendInvoice() {
    setIsResendingInvoice(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/send-invoice`, {});
      setMsg({ text: "Invoice emailed to customer.", ok: true });
      setOrder(prev => prev ? { ...prev, invoice_sent_at: new Date().toISOString() } : prev);
    } catch {
      setMsg({ text: "Failed to send invoice email.", ok: false });
    } finally { setIsResendingInvoice(false); }
  }

  async function handleMarkAsPaid() {
    if (!confirm("Mark this order as paid?")) return;
    setIsMarkingPaid(true); setMsg(null);
    try {
      await apiClient.post(`/api/v1/admin/orders/${order?.id ?? id}/mark-paid`, {});
      setMsg({ text: "Order marked as paid.", ok: true });
      setOrder(prev => prev ? { ...prev, payment_status: "paid", marked_paid_at: new Date().toISOString() } : prev);
    } catch {
      setMsg({ text: "Failed to mark as paid.", ok: false });
    } finally { setIsMarkingPaid(false); }
  }

  async function handleSaveNote() {
    try {
      await apiClient.patch(`/api/v1/admin/orders/${order?.id ?? id}`, { notes: noteText });
      setEditingNote(false);
      setOrder(prev => prev ? { ...prev, order_notes: noteText } : prev);
      setMsg({ text: "Note saved.", ok: true });
    } catch {
      setMsg({ text: "Failed to save note.", ok: false });
    }
  }

  function openAddressEditor() {
    const a = order?.shipping_address;
    setAddressForm({
      full_name: a?.full_name ?? "",
      address_line1: a?.address_line1 ?? "",
      address_line2: a?.address_line2 ?? "",
      city: a?.city ?? "",
      state: a?.state ?? "",
      postal_code: a?.postal_code ?? a?.zip_code ?? "",
      country: a?.country ?? "US",
      phone: "",
    });
    setEditingAddress(true);
  }

  async function handleSaveAddress() {
    if (!addressForm.address_line1.trim() || !addressForm.city.trim() || !addressForm.state.trim() || !addressForm.postal_code.trim()) {
      setMsg({ text: "Street address, city, state and ZIP are required.", ok: false });
      return;
    }
    setSavingAddress(true);
    try {
      const data = await apiClient.patch<{ shipping_address: ShippingAddress }>(
        `/api/v1/admin/orders/${order?.id ?? id}/shipping-address`,
        addressForm
      );
      setOrder(prev => prev ? { ...prev, shipping_address: data.shipping_address } : prev);
      setEditingAddress(false);
      setMsg({ text: "Shipping address updated. Try generating the label again.", ok: true });
    } catch {
      setMsg({ text: "Failed to update shipping address.", ok: false });
    } finally {
      setSavingAddress(false);
    }
  }

  function handleItemSearchChange(val: string) {
    setItemSearch(val);
    setSizeGrid(null);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!val.trim()) { setItemResults([]); setItemRawData([]); return; }
    searchDebounce.current = setTimeout(async () => {
      try {
        const data = await apiClient.get<{ id: string; name: string; product_code?: string | null; variants: { id: string; sku: string; color: string | null; size: string | null; retail_price: number }[] }[]>(
          `/api/v1/admin/products?q=${encodeURIComponent(val)}&page_size=20`
        );
        const raw = Array.isArray(data) ? data : [];
        setItemRawData(raw);
        // Intelligent narrowing: every word the admin typed must appear somewhere
        // in the variant (product name/code + color + size + sku). "1001 black" →
        // only 1001 blacks; add "xl" → just the 1001 black XL. We de-dupe to one
        // row per product+color so the dropdown lists colors, then the size grid
        // opens all that color's sizes to fill quantities.
        const tokens = val.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const results: typeof itemResults = [];
        const seen = new Set<string>();
        for (const p of raw) {
          for (const v of p.variants ?? []) {
            const hay = `${p.name} ${p.product_code ?? ""} ${v.color ?? ""} ${v.size ?? ""} ${v.sku ?? ""}`.toLowerCase();
            if (!tokens.every(t => hay.includes(t))) continue;
            const key = `${p.id}|${v.color ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({ variant_id: v.id, product_id: p.id, sku: v.sku, product_name: p.name, color: v.color, size: v.size, price: Number(v.retail_price || 0) });
          }
        }
        setItemResults(results.slice(0, 40));
      } catch { /* ignore */ }
    }, 300);
  }

  // Canonical apparel size order so the grid reads XS → S → M → L → XL → 2XL …
  const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL"];
  const sizeRank = (s: string | null) => {
    const i = SIZE_ORDER.indexOf((s ?? "").toUpperCase());
    return i === -1 ? 999 : i;
  };

  // Clicking a color opens every size of that product+color with a qty box each.
  async function openSizeGrid(picked: { product_id: string; product_name: string; color: string | null }) {
    const prod = itemRawData.find(p => p.id === picked.product_id);
    const rows = (prod?.variants ?? [])
      .filter(x => (x.color ?? "") === (picked.color ?? ""))
      .map(x => ({ variant_id: x.id, size: x.size, sku: x.sku, price: Number(x.retail_price || 0), qty: 0 }))
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
    setSizeGrid({ productName: picked.product_name, color: picked.color, rows });
    setItemResults([]);
    setItemSearch(`${picked.product_name} — ${picked.color ?? ""}`);
    // Fetch the customer's price for this size run (small set → cheap) so the grid
    // shows discounted pricing, not catalog. Falls back to catalog on failure.
    try {
      const res = await apiClient.post<{ prices: Record<string, number> }>(
        `/api/v1/admin/orders/${order?.id ?? id}/price-variants`,
        { variant_ids: rows.map(r => r.variant_id) }
      );
      setSizeGrid(g => g ? { ...g, rows: g.rows.map(r => ({ ...r, price: res.prices[r.variant_id] ?? r.price })) } : g);
    } catch { /* keep catalog price */ }
  }

  function setGridQty(variant_id: string, qty: number) {
    setSizeGrid(g => g ? { ...g, rows: g.rows.map(r => r.variant_id === variant_id ? { ...r, qty: Math.max(0, Math.floor(qty || 0)) } : r) } : g);
  }

  async function handleBulkAdd() {
    if (!sizeGrid) return;
    const items = sizeGrid.rows.filter(r => r.qty > 0).map(r => ({ variant_id: r.variant_id, quantity: r.qty }));
    if (!items.length) { setAddItemMsg({ text: "Enter a quantity for at least one size.", ok: false }); return; }
    setBulkAdding(true); setAddItemMsg(null);
    try {
      const result = await apiClient.post<{ items: { item_id: string; sku: string; product_name: string; color: string | null; size: string | null; quantity: number; unit_price: number; line_total: number }[]; subtotal: number; total: number }>(
        `/api/v1/admin/orders/${order?.id ?? id}/items/bulk`,
        { items }
      );
      setOrder(prev => prev ? {
        ...prev,
        subtotal: String(result.subtotal),
        total: String(result.total),
        items_edited: true,
        items: [...prev.items, ...result.items.map(it => ({
          id: it.item_id,
          sku: it.sku,
          product_name: it.product_name,
          color: it.color,
          size: it.size,
          quantity: it.quantity,
          unit_price: String(it.unit_price),
          line_total: String(it.line_total),
        }))],
      } : prev);
      const pieces = items.reduce((s, i) => s + i.quantity, 0);
      setAddItemMsg({ text: `Added ${result.items.length} size(s) · ${pieces} pcs — ${sizeGrid.productName} ${sizeGrid.color ?? ""}`, ok: true });
      setSizeGrid(null); setItemSearch(""); setItemResults([]); setItemRawData([]);
    } catch (err: unknown) {
      setAddItemMsg({ text: err instanceof Error ? err.message : "Failed to add items", ok: false });
    } finally {
      setBulkAdding(false);
    }
  }

  /** Apply a manually agreed unit price to every size in one product/colour row. */
  async function handleApplyGroupPrice(groupKey: string, itemIds: string[]) {
    const raw = (priceEdits[groupKey] ?? "").trim();
    if (raw === "") return;
    const price = parseFloat(raw);
    if (!Number.isFinite(price) || price < 0) {
      setMsg({ text: "Enter a valid price.", ok: false });
      return;
    }
    setSavingPriceKey(groupKey);
    try {
      const oid = order?.id ?? id;
      for (const itemId of itemIds) {
        await apiClient.patch(`/api/v1/admin/orders/${oid}/items/${itemId}`, { unit_price: price });
      }
      // Reload from the server so line totals, subtotal and total are exactly
      // what the backend computed — never a locally-guessed number.
      const fresh = await adminService.getOrder(oid) as AdminOrder;
      setOrder(fresh);
      setPriceEdits(prev => { const n = { ...prev }; delete n[groupKey]; return n; });
      setMsg({ text: `Price updated to $${price.toFixed(2)}`, ok: true });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to update price", ok: false });
    } finally {
      setSavingPriceKey(null);
    }
  }

  async function handleRemoveItem(itemId: string, lineTotal: string) {
    try {
      await apiClient.delete(`/api/v1/admin/orders/${order?.id ?? id}/items/${itemId}`);
      setOrder(prev => prev ? {
        ...prev,
        items: prev.items.filter(i => i.id !== itemId),
        subtotal: String(Math.max(0, Number(prev.subtotal) - Number(lineTotal))),
        total: String(Math.max(0, Number(prev.total) - Number(lineTotal))),
        items_edited: true,
      } : prev);
    } catch {
      setMsg({ text: "Failed to remove item.", ok: false });
    }
  }

  if (orderLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "320px" }}>
        <div style={{ fontSize: "13px", color: "#aaa" }}>Loading order…</div>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "320px", gap: "12px" }}>
        <div style={{ fontSize: "14px", color: "#E8242A", fontWeight: 600 }}>{orderError || "Order not found."}</div>
        <button onClick={() => router.back()} style={{ fontSize: "13px", color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>← Back to Orders</button>
      </div>
    );
  }

  const courierObj = COURIERS.find(c => c.id === selectedCourier);
  const courierDisplayName = COURIERS.find(c => c.id === order.courier)?.name ?? order.courier;
  const _carrierMap: Record<string, string> = { USPS: "usps", UPS: "ups", FedEx: "fedex" };
  const customerCarrier = order.carrier
    ? (_carrierMap[order.carrier] ?? order.carrier.toLowerCase())
    : null;

  const isWillCallPickup = !!(
    order.shipping_method?.toLowerCase().includes("will_call") ||
    order.shipping_method?.toLowerCase().includes("pickup")
  );
  const hasLiveRate = !!order.shipping_rate_id;
  const isStandardGround = !hasLiveRate && !isWillCallPickup;

  // The order stores the raw method key ("standard", "pallet"…). Show the same
  // wording the customer saw on the checkout screen instead of the key.
  const SHIPPING_METHOD_LABELS: Record<string, string> = {
    standard: "Standard Ground",
    expedited: "Expedited",
    will_call: "Will Call Pickup",
    pickup: "Will Call Pickup",
    pallet: "Pallet Freight (Bulk)",
    free: "Free Shipping",
  };
  const shippingMethodLabel =
    SHIPPING_METHOD_LABELS[(order.shipping_method ?? "").toLowerCase()] ?? order.shipping_method;

  const addr = order.shipping_address;
  const zip = addr?.zip_code ?? addr?.postal_code ?? "";

  const backendTimeline = order.timeline ?? [];
  const timelineEvents: { text: string; sub: string; time: string; color: string }[] = [
    // Seed the "Order placed" entry from order creation time
    {
      text: "Order placed",
      sub: `${order.company_name || order.customer_name || "Customer"} · ${order.payment_status}`,
      time: order.created_at,
      color: "#1A5CFF",
    },
    // Append all backend-recorded status changes in chronological order
    ...backendTimeline.map(entry => ({
      text: entry.message,
      sub: entry.created_by === "admin" ? "Admin" : entry.created_by,
      time: entry.created_at,
      color: getStatusColor(entry.status),
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).reverse();

  const avatarInitial = order.customer_name?.[0]?.toUpperCase() ?? order.company_name?.[0]?.toUpperCase() ?? "C";
  const mapQuery = [addr?.address_line1, addr?.city, addr?.state].filter(Boolean).join(", ");

  return (
    <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "1200px" }}>
      {/* ── Email composer (send to this order's customer) ────────────────── */}
      {showEmail && (
        <div onClick={() => !sendingEmail && setShowEmail(false)} className="no-print"
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "560px", background: "#fff", borderRadius: "12px", padding: "22px 24px", boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#1B3A5C", marginBottom: "4px" }}>Email Customer</div>
            <div style={{ fontSize: "12px", color: "#7A7880", marginBottom: "16px" }}>
              To: {emailRecipients.length > 0
                ? <b style={{ color: "#2A2830" }}>{emailRecipients.join(", ")}</b>
                : <span style={{ color: "#E8242A" }}>no valid email on file for this customer</span>}
            </div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#7A7880", marginBottom: "5px" }}>Subject</label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder={`Regarding your order ${order.order_number}`}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", marginBottom: "14px", boxSizing: "border-box" }} />
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#7A7880", marginBottom: "5px" }}>Message</label>
            <textarea rows={8} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder={"Hi {{first_name}},\n\nWrite your message here…"}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #E2E0DA", borderRadius: "7px", fontSize: "13px", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "6px" }}>Tip: type <code>{"{{first_name}}"}</code> for the customer&rsquo;s name.</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "18px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowEmail(false)} disabled={sendingEmail}
                style={{ padding: "9px 16px", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSendEmail} disabled={sendingEmail || emailRecipients.length === 0 || !emailSubject.trim() || !emailBody.trim()}
                style={{ padding: "9px 20px", background: (sendingEmail || emailRecipients.length === 0 || !emailSubject.trim() || !emailBody.trim()) ? "#9CA3AF" : "#1B3A5C", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: (sendingEmail || emailRecipients.length === 0) ? "not-allowed" : "pointer" }}>
                {sendingEmail ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back */}
      <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#1A5CFF", cursor: "pointer", fontSize: "13px", fontWeight: 700, padding: 0, marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
        ← Back to Orders
      </button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "28px", color: "#2A2830", letterSpacing: ".04em", lineHeight: 1 }}>
            {order.order_number}
          </h1>
          <p style={{ fontSize: "13px", color: "#7A7880", marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
            <span>{order.company_name}</span>
            <span>·</span>
            <span>{new Date(order.created_at).toLocaleDateString()}</span>
            <span>·</span>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} />
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }} className="no-print">
          <button
            onClick={openEmailComposer}
            title="Write and send an email to this order's customer"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", border: "1.5px solid #1B3A5C", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, color: "#1B3A5C", cursor: "pointer" }}
          >
            ✉️ Email
          </button>
          <button
            onClick={handleDownloadInvoice}
            disabled={downloadingInvoice}
            title="Download this order's invoice as a PDF"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#1B3A5C", border: "1.5px solid #1B3A5C", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, color: "#fff", cursor: downloadingInvoice ? "default" : "pointer", opacity: downloadingInvoice ? 0.7 : 1 }}
          >
            📄 {downloadingInvoice ? "Preparing…" : "Invoice PDF"}
          </button>
          <button
            onClick={handleRecreateInvoice}
            disabled={recreatingInvoice}
            title="Recreate this order's invoice in QuickBooks (if it was deleted) and email it to the customer"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", border: "1.5px solid #059669", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, color: "#059669", cursor: recreatingInvoice ? "default" : "pointer", opacity: recreatingInvoice ? 0.6 : 1 }}
          >
            ↻ {recreatingInvoice ? "Working…" : "Recreate QB Invoice"}
          </button>
          <button
            onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, color: "#2A2830", cursor: "pointer" }}
          >
            🖨️ Print
          </button>
          <button
            onClick={handleDeleteOrder}
            disabled={deleting}
            title="Permanently delete this order"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", border: "1.5px solid rgba(232,36,42,.4)", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, color: "#E8242A", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
          >
            🗑️ {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      <style>{`
        @media print {
          nav, header, aside, [data-sidebar], .no-print { display: none !important; }
          body { font-size: 12px; }
          main, .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
      `}</style>

      {/* Feedback */}
      {msg && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.ok ? "rgba(5,150,105,.1)" : "rgba(232,36,42,.1)", color: msg.ok ? "#059669" : "#E8242A", border: `1px solid ${msg.ok ? "rgba(5,150,105,.2)" : "rgba(232,36,42,.2)"}` }}>
          {msg.text}
        </div>
      )}

      {/* Payment Capture Alert */}
      {order.payment_status === "authorized" && (
        <div style={{ background: "#fff8f0", border: "1.5px solid #fed7aa", borderRadius: "10px", padding: "20px 24px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" as const }}>
            <div>
              <h4 style={{ fontWeight: 700, color: "#c2410c", marginBottom: "4px", fontSize: "15px" }}>⏰ Payment Authorized</h4>
              <p style={{ fontSize: "13px", color: "#7A7880" }}>Capture payment before authorization expires</p>
            </div>
            <button onClick={handleCapturePayment} disabled={isCapturing}
              style={{ background: "#059669", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "14px", opacity: isCapturing ? .6 : 1, whiteSpace: "nowrap" as const }}>
              {isCapturing ? "Capturing…" : `Capture $${Number(order.total).toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* ── 2-COLUMN LAYOUT ── */}
      <div className="admin-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "20px", alignItems: "flex-start" }}>

        {/* ── LEFT: Main content ── */}
        <div>
          {/* SHIPPING & COURIER — always shown; content varies by order type */}
          <div style={{ ...CardStyle, padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em", margin: 0 }}>SHIPPING & COURIER</h3>
              {!editingShipping && (
                <button onClick={openShippingEditor} className="no-print"
                  style={{ fontSize: "12px", fontWeight: 700, color: "#1A5CFF", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  ✎ Change shipping
                </button>
              )}
            </div>

            {/* Change-shipping editor (customer changed their mind → pickup / self-collect / etc.) */}
            {editingShipping && (
              <div className="no-print" style={{ background: "#F7F6F3", border: "1px solid #E2E0DA", borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1B3A5C", marginBottom: "10px" }}>Change Shipping Method</div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <label style={{ display: "block", fontSize: "11px", color: "#7A7880", marginBottom: "4px", fontWeight: 600 }}>Method</label>
                    <select value={shipMethodEdit} onChange={e => {
                        const m = e.target.value; setShipMethodEdit(m);
                        if (SHIP_METHODS.find(x => x.value === m)?.zeroCost) setShipCostEdit("0");
                      }}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
                      {SHIP_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "0 0 120px" }}>
                    <label style={{ display: "block", fontSize: "11px", color: "#7A7880", marginBottom: "4px", fontWeight: 600 }}>Shipping Cost ($)</label>
                    <input type="number" min={0} step="0.01" value={shipCostEdit}
                      disabled={SHIP_METHODS.find(m => m.value === shipMethodEdit)?.zeroCost}
                      onChange={e => setShipCostEdit(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: "6px", fontSize: "13px", background: SHIP_METHODS.find(m => m.value === shipMethodEdit)?.zeroCost ? "#F3F4F6" : "#fff" }} />
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "8px" }}>
                  Pickup &amp; Free are $0. The order total updates automatically. Re-download the invoice PDF to get the updated copy.
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button onClick={handleSaveShipping} disabled={savingShipping}
                    style={{ padding: "8px 18px", background: savingShipping ? "#9CA3AF" : "#1B3A5C", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: savingShipping ? "default" : "pointer" }}>
                    {savingShipping ? "Saving…" : "Save Shipping"}
                  </button>
                  <button onClick={() => setEditingShipping(false)} disabled={savingShipping}
                    style={{ padding: "8px 14px", border: "1px solid #E2E0DA", borderRadius: "7px", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Already-shipped summary */}
            {order.status === "shipped" && order.courier && (
              <div style={{ fontSize: "12px", color: "#059669", fontWeight: 600, marginBottom: "14px", padding: "8px 12px", background: "rgba(5,150,105,.08)", borderRadius: "6px" }}>
                ✓ Shipped via {courierDisplayName} {order.courier_service}
                {order.tracking_number && ` · Tracking: ${order.tracking_number}`}
                {order.shipped_at && ` · ${new Date(order.shipped_at).toLocaleDateString()}`}
              </div>
            )}

            {/* CASE 3: Will Call Pickup */}
            {isWillCallPickup ? (
              <div style={{ background: "rgba(26,92,255,.05)", border: "1.5px solid rgba(26,92,255,.2)", borderRadius: "10px", padding: "18px 20px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A5CFF", marginBottom: "10px" }}>📦 Customer selected: Will Call Pickup</div>
                <div style={{ fontSize: "13px", color: "#2A2830", fontWeight: 600, marginBottom: "6px" }}>Warehouse Address:</div>
                <div style={{ fontSize: "13px", color: "#7A7880", lineHeight: 1.7 }}>
                  AF Apparels<br />
                  10719 Turbeville Rd<br />
                  Dallas, TX 75243<br />
                  Mon–Fri 10am–4:30pm CST
                </div>
                <div style={{ marginTop: "12px", fontSize: "12px", color: "#059669", fontWeight: 700, background: "rgba(5,150,105,.08)", padding: "6px 10px", borderRadius: "6px", display: "inline-block" }}>
                  ✓ No shipping label required — customer will pick up
                </div>
              </div>
            ) : (
              /* CASE 1 & 2: Shippo label generation */
              <div style={{ marginBottom: "16px" }}>
                <label style={{ ...LabelStyle, marginBottom: "10px" }}>Generate Shipping Label via Shippo</label>

                {shippoTestMode && (
                  <div style={{ background: "rgba(232,36,42,.07)", border: "1.5px solid rgba(232,36,42,.35)", borderRadius: "8px", padding: "12px 14px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#E8242A", marginBottom: "3px" }}>
                      Shippo is in test mode — labels are not mailable
                    </div>
                    <div style={{ fontSize: "12px", color: "#7A7880", lineHeight: 1.55 }}>
                      Rates and tracking numbers look real, but every label PDF comes out stamped
                      &ldquo;SAMPLE &mdash; DO NOT MAIL&rdquo; and no carrier will accept it. Nothing is charged either.
                      Switch <strong>SHIPPO_API_KEY</strong> to the live key (it starts with <code>shippo_live_</code>)
                      to buy real postage.
                    </div>
                  </div>
                )}

                {/* Customer selection info banner */}
                {order.shipping_method && (
                  <div style={{ background: "rgba(26,92,255,.06)", border: "1px solid rgba(26,92,255,.2)", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, marginBottom: "2px" }}>Customer Selected at Checkout:</div>
                    <div style={{ fontSize: "13px", color: "#1A5CFF", fontWeight: 700 }}>
                      {hasLiveRate && order.carrier
                        ? `${order.carrier}${order.courier_service ? ` — ${order.courier_service}` : ""} — $${Number(order.shipping_cost).toFixed(2)}`
                        : `${shippingMethodLabel} — Flat Rate — $${Number(order.shipping_cost).toFixed(2)}`
                      }
                    </div>
                    {/* A flat-rate pick carries no carrier service — the customer only chose a
                        price tier, so the carrier below is the admin's call. Say so, otherwise
                        "Standard Ground" reads as if the customer had asked for a service. */}
                    {!hasLiveRate && (
                      <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px", lineHeight: 1.5 }}>
                        Customer picked a flat-rate tier, not a carrier service — no UPS/FedEx Ground vs Air choice was made at checkout. Pick the carrier service below when you generate the label.
                      </div>
                    )}
                    {order.shipping_rate_id && (
                      <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px" }}>Customer chose this exact service at checkout · Rate ID: {order.shipping_rate_id}</div>
                    )}
                    {order.courier && (
                      <div style={{ fontSize: "12px", color: "#059669", fontWeight: 700, marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(26,92,255,.15)" }}>
                        Actually shipped as: {courierDisplayName}{order.courier_service ? ` — ${order.courier_service}` : ""}
                        {order.tracking_number && <span style={{ color: "#7A7880", fontWeight: 600 }}> · {order.tracking_number}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* CASE 2 (Standard Ground): live rates fetch UI */}
                {isStandardGround ? (
                  <>
                    {!labelResult?.success && allLabels.length === 0 && (
                      <>
                        {/* Box summary banner */}
                        {boxSummary && (
                          <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.2)", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" as const }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "18px" }}>📦</span>
                              <div>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "#6366F1" }}>
                                  {boxSummary.num_boxes} box{boxSummary.num_boxes !== 1 ? "es" : ""}
                                  {boxSummary.manual_box_count != null
                                    ? <span style={{ fontSize: "11px", fontWeight: 600, color: "#7A7880" }}> (set manually)</span>
                                    : <span style={{ fontSize: "11px", fontWeight: 600, color: "#7A7880" }}> (auto)</span>}
                                </div>
                                <div style={{ fontSize: "12px", color: "#7A7880" }}>
                                  {boxSummary.weight_per_box_lbs} lbs per box · {boxSummary.total_weight_lbs} lbs total
                                </div>
                              </div>
                            </div>
                            {/* Adjust how many boxes the order was actually packed in */}
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }} className="no-print">
                              <span style={{ fontSize: "11px", color: "#7A7880", fontWeight: 600 }}>Boxes:</span>
                              <button
                                onClick={() => handleSetBoxCount(Math.max(1, boxSummary.num_boxes - 1))}
                                disabled={boxSummary.num_boxes <= 1}
                                title="One fewer box"
                                style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #C7C9F5", background: "#fff", color: "#6366F1", fontSize: "16px", fontWeight: 700, cursor: boxSummary.num_boxes <= 1 ? "not-allowed" : "pointer", lineHeight: 1, opacity: boxSummary.num_boxes <= 1 ? 0.4 : 1 }}>−</button>
                              <span style={{ minWidth: "20px", textAlign: "center", fontSize: "14px", fontWeight: 800, color: "#6366F1" }}>{boxSummary.num_boxes}</span>
                              <button
                                onClick={() => handleSetBoxCount(boxSummary.num_boxes + 1)}
                                title="One more box"
                                style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #C7C9F5", background: "#fff", color: "#6366F1", fontSize: "16px", fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>+</button>
                              {boxSummary.manual_box_count != null && (
                                <button
                                  onClick={() => handleSetBoxCount(null)}
                                  title="Back to automatic box count"
                                  style={{ marginLeft: "4px", padding: "4px 8px", borderRadius: "6px", border: "1px solid #E2E0DA", background: "#fff", color: "#7A7880", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>↺ Auto</button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Weight input + Fetch Rates button */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" as const }}>
                          <label style={{ ...LabelStyle, marginBottom: 0, whiteSpace: "nowrap" as const }}>Per-Box Weight (lbs)</label>
                          <input
                            type="number" min="0.1" step="0.1" value={manualWeight}
                            onChange={e => setManualWeight(parseFloat(e.target.value) || 0.5)}
                            style={{ width: "80px", padding: "8px 10px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)" }}
                          />
                          <button onClick={handleFetchAdminRates} disabled={adminRatesLoading}
                            style={{ padding: "8px 18px", background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: adminRatesLoading ? "not-allowed" : "pointer", opacity: adminRatesLoading ? .65 : 1, whiteSpace: "nowrap" as const }}>
                            {adminRatesLoading ? "Fetching…" : "Refresh Rates"}
                          </button>
                        </div>

                        {/* Loading */}
                        {adminRatesLoading && (
                          <div style={{ fontSize: "12px", color: "#7A7880", padding: "6px 0", marginBottom: "10px" }}>Fetching live carrier rates…</div>
                        )}

                        {/* Rate list */}
                        {!adminRatesLoading && adminRates.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px", marginBottom: "14px" }}>
                            {adminRates.map(rate => {
                              const isRateSelected = adminSelectedRateId === rate.rate_id;
                              return (
                                <div key={rate.rate_id}
                                  onClick={() => setAdminSelectedRateId(rate.rate_id)}
                                  style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "10px 14px", cursor: "pointer",
                                    border: `1px solid ${isRateSelected ? "#1A5CFF" : "#E2E0DA"}`,
                                    borderRadius: "6px",
                                    background: isRateSelected ? "rgba(26,92,255,.04)" : "#fff",
                                    transition: "all .1s",
                                  }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div style={{
                                      width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0,
                                      border: `2px solid ${isRateSelected ? "#1A5CFF" : "#E2E0DA"}`,
                                      background: isRateSelected ? "#1A5CFF" : "#fff",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                      {isRateSelected && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#fff" }} />}
                                    </div>
                                    {CARRIER_LOGOS[rate.carrier] && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={CARRIER_LOGOS[rate.carrier]} alt={rate.carrier}
                                        style={{ maxHeight: "20px", width: "auto", objectFit: "contain", flexShrink: 0 }} />
                                    )}
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>{rate.service}</div>
                                      {rate.days != null && <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "1px" }}>{rate.days} business day{rate.days !== 1 ? "s" : ""}</div>}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" as const }}>
                                    <span style={{ fontSize: "13px", fontWeight: 800, color: "#2A2830" }}>${Number(rate.cost).toFixed(2)}</span>
                                    {boxSummary && boxSummary.num_boxes > 1 && (
                                      <div style={{ fontSize: "11px", color: "#6366F1", marginTop: "1px" }}>
                                        × {boxSummary.num_boxes} = ${(rate.cost * boxSummary.num_boxes).toFixed(2)} total
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* No rates yet */}
                        {!adminRatesLoading && adminRates.length === 0 && (
                          <div style={{ fontSize: "12px", color: "#7A7880", marginBottom: "14px" }}>
                            Enter a per-box weight and click "Refresh Rates" to load available carrier options.
                          </div>
                        )}

                        {/* Generate Label button */}
                        <button onClick={handleGenerateManualLabel} disabled={!adminSelectedRateId || manualLabelLoading}
                          style={{ background: adminSelectedRateId ? "#1A5CFF" : "#E2E0DA", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: adminSelectedRateId ? "pointer" : "not-allowed", opacity: manualLabelLoading ? .65 : 1, marginBottom: "14px" }}>
                          {manualLabelLoading
                            ? "Generating labels…"
                            : adminSelectedRateId
                              ? `Generate ${boxSummary && boxSummary.num_boxes > 1 ? `${boxSummary.num_boxes} Labels` : "Label"}`
                              : "Select a rate first"}
                        </button>
                      </>
                    )}

                    {/* Multi-box labels display */}
                    {allLabels.length > 1 && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px", marginBottom: "14px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669", marginBottom: "4px" }}>
                          ✓ {allLabels.length} labels generated
                        </div>
                        {allLabels.map(lbl => (
                          <div key={lbl.box_number} style={{ background: "rgba(5,150,105,.05)", border: "1px solid rgba(5,150,105,.18)", borderRadius: "8px", padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669" }}>Box {lbl.box_number}</div>
                              <div style={{ fontSize: "11px", color: "#7A7880" }}>{lbl.carrier} · {lbl.service}</div>
                            </div>
                            <div style={{ fontSize: "12px", color: "#2A2830", marginBottom: "8px" }}>
                              <span style={{ color: "#7A7880" }}>Tracking: </span>{lbl.tracking_number}
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
                              <a href={lbl.label_url} target="_blank" rel="noreferrer"
                                style={{ background: "#1A5CFF", color: "#fff", padding: "6px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}>
                                ↓ Label PDF
                              </a>
                              {lbl.tracking_url && (
                                <a href={lbl.tracking_url} target="_blank" rel="noreferrer"
                                  style={{ background: "#fff", color: "#1A5CFF", padding: "6px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, textDecoration: "none", border: "1.5px solid #1A5CFF" }}>
                                  Track →
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* CASE 1 (Live Rate): customer's rate already known — generate label directly */
                  <>
                    {!labelResult?.success && allLabels.length === 0 && (
                      <button onClick={handleGenerateLabel} disabled={!selectedCarrier || labelLoading}
                        style={{ background: selectedCarrier ? "#1A5CFF" : "#E2E0DA", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: selectedCarrier ? "pointer" : "not-allowed", opacity: labelLoading ? .65 : 1, marginBottom: "14px" }}>
                        {labelLoading ? "Generating labels…" : `Generate ${(order.carrier ?? selectedCarrier ?? "").toUpperCase()} Label`}
                      </button>
                    )}
                    {/* Multi-box labels display for live-rate orders */}
                    {allLabels.length > 1 && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px", marginBottom: "14px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669", marginBottom: "4px" }}>
                          ✓ {allLabels.length} labels generated
                        </div>
                        {allLabels.map(lbl => (
                          <div key={lbl.box_number} style={{ background: "rgba(5,150,105,.05)", border: "1px solid rgba(5,150,105,.18)", borderRadius: "8px", padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669" }}>Box {lbl.box_number}</div>
                              <div style={{ fontSize: "11px", color: "#7A7880" }}>{lbl.carrier} · {lbl.service}</div>
                            </div>
                            <div style={{ fontSize: "12px", color: "#2A2830", marginBottom: "8px" }}>
                              <span style={{ color: "#7A7880" }}>Tracking: </span>{lbl.tracking_number}
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
                              <a href={lbl.label_url} target="_blank" rel="noreferrer"
                                style={{ background: "#1A5CFF", color: "#fff", padding: "6px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}>
                                ↓ Label PDF
                              </a>
                              {lbl.tracking_url && (
                                <a href={lbl.tracking_url} target="_blank" rel="noreferrer"
                                  style={{ background: "#fff", color: "#1A5CFF", padding: "6px 12px", borderRadius: "5px", fontSize: "12px", fontWeight: 700, textDecoration: "none", border: "1.5px solid #1A5CFF" }}>
                                  Track →
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Label result */}
                {labelResult && labelResult.success && (
                  <div style={{ background: "rgba(5,150,105,.06)", border: "1px solid rgba(5,150,105,.2)", borderRadius: "8px", padding: "14px 16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669", marginBottom: "10px" }}>✓ Label generated</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px", color: "#2A2830", marginBottom: "12px" }}>
                      {labelResult.carrier && <div><span style={{ color: "#7A7880", fontWeight: 600 }}>Carrier: </span>{labelResult.carrier.toUpperCase()}</div>}
                      {labelResult.service && <div><span style={{ color: "#7A7880", fontWeight: 600 }}>Service: </span>{labelResult.service}</div>}
                      {labelResult.tracking_number && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#7A7880", fontWeight: 600 }}>Tracking: </span>{labelResult.tracking_number}</div>}
                      {labelResult.rate != null && <div><span style={{ color: "#7A7880", fontWeight: 600 }}>Rate: </span>${Number(labelResult.rate).toFixed(2)}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const }}>
                      {labelResult.label_url && (
                        <a href={labelResult.label_url} target="_blank" rel="noreferrer"
                          style={{ background: "#1A5CFF", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                          ↓ Download Label PDF
                        </a>
                      )}
                      {labelResult.tracking_url && (
                        <a href={labelResult.tracking_url} target="_blank" rel="noreferrer"
                          style={{ background: "#fff", color: "#1A5CFF", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none", border: "1.5px solid #1A5CFF" }}>
                          Track Package →
                        </a>
                      )}
                      {/* Nothing else could replace a label once one existed — the rate
                          list stays hidden while it is stored. Needed whenever the first
                          one can't be used: wrong weight, changed address, ruined print. */}
                      <button onClick={handleResetLabel} disabled={resettingLabel}
                        style={{ background: "#fff", color: "#7A7880", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, border: "1.5px solid #E2E0DA", cursor: resettingLabel ? "default" : "pointer", opacity: resettingLabel ? 0.6 : 1 }}>
                        {resettingLabel ? "Clearing…" : "↻ Generate a new label"}
                      </button>
                    </div>
                  </div>
                )}
                {labelResult && !labelResult.success && (
                  <div style={{ background: "rgba(232,36,42,.06)", border: "1px solid rgba(232,36,42,.2)", borderRadius: "8px", padding: "12px 16px", fontSize: "13px", color: "#E8242A", fontWeight: 600 }}>
                    ✗ {labelResult.error ?? "Label generation failed. Check that Shippo API key and shipping address are set."}
                  </div>
                )}
              </div>
            )}

            {/* Manual / Local Shipping — bypass Shippo entirely: admin types in the
                courier, tracking number, and amount charged (e.g. local hand-delivery,
                a courier without live Shippo rates, or a flat rate already agreed with the customer). */}
            {!isWillCallPickup && (
              <div style={{ marginTop: "16px", borderTop: "1px solid #E2E0DA", paddingTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setShowManualShipping(v => !v)}
                  style={{ background: "none", border: "none", padding: 0, color: "#1A5CFF", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
                >
                  {showManualShipping ? "− Hide Manual / Local Shipping" : "+ Manual / Local Shipping (no Shippo label)"}
                </button>

                {showManualShipping && (
                  <div style={{ marginTop: "14px", background: "#FAFAFA", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, marginBottom: "14px" }}>
                      {COURIERS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleCourierSelect(c.id)}
                          style={{
                            padding: "8px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                            border: `1.5px solid ${selectedCourier === c.id ? "#1A5CFF" : "#E2E0DA"}`,
                            background: selectedCourier === c.id ? "rgba(26,92,255,.06)" : "#fff",
                            color: selectedCourier === c.id ? "#1A5CFF" : "#2A2830",
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>

                    {selectedCourier && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
                        <div>
                          <label style={LabelStyle}>Service</label>
                          <select
                            value={selectedService}
                            onChange={e => setSelectedService(e.target.value)}
                            style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)", background: "#fff", width: "100%", maxWidth: "280px" }}
                          >
                            <option value="">Select service…</option>
                            {COURIERS.find(c => c.id === selectedCourier)?.services.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={LabelStyle}>Tracking Number</label>
                          <input
                            value={trackingNumber}
                            onChange={e => setTrackingNumber(e.target.value)}
                            placeholder="Paste the real tracking ID from the courier"
                            style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)", width: "100%", maxWidth: "280px", boxSizing: "border-box" as const }}
                          />
                        </div>
                        <div>
                          <label style={LabelStyle}>Tracking Link (courier URL)</label>
                          <input
                            type="url"
                            value={trackingUrl}
                            onChange={e => setTrackingUrl(e.target.value)}
                            placeholder="https://www.ups.com/track?tracknum=…"
                            style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)", width: "100%", maxWidth: "380px", boxSizing: "border-box" as const }}
                          />
                          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Optional — the customer&apos;s shipped email gets a &quot;Track Your Shipment&quot; button linking here.</div>
                        </div>
                        <div>
                          <label style={LabelStyle}>Shipping Amount ($)</label>
                          <input
                            type="number" min="0" step="0.01"
                            value={manualShippingAmount}
                            onChange={e => setManualShippingAmount(e.target.value)}
                            placeholder="0.00"
                            style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)", width: "100%", maxWidth: "160px", boxSizing: "border-box" as const }}
                          />
                          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>Leave blank to keep the existing shipping charge on this order.</div>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={handleMarkShipped}
                            disabled={!selectedService || isShipping}
                            style={{ background: selectedService ? "#1A5CFF" : "#E2E0DA", color: "#fff", border: "none", padding: "11px 22px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: selectedService ? "pointer" : "not-allowed", opacity: isShipping ? .65 : 1 }}
                          >
                            {isShipping ? "Saving…" : "Mark as Shipped"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STATUS UPDATE */}
          <div style={{ ...CardStyle, padding: "24px" }}>
            <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em", marginBottom: "16px" }}>UPDATE ORDER</h3>
            <form onSubmit={handleUpdate} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div>
                <label style={LabelStyle}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  style={{ padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "14px", fontFamily: "var(--font-jakarta)", background: "#fff" }}>
                  {getAvailableStatuses(order.status).filter(s => !(s === "shipped" && order.shipping_method === "will_call")).map(s => (
                    <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                  ))}
                </select>
              </div>
              {/* Tracking is managed via Shipping & Courier section above */}
              <button type="submit" disabled={isSaving}
                style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "11px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: "pointer", opacity: isSaving ? .6 : 1 }}>
                {isSaving ? "Saving…" : "Update Order"}
              </button>
            </form>
          </div>

          {/* ORDER ITEMS */}
          <div style={{ ...CardStyle, padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em" }}>ORDER ITEMS</h3>
              {["pending", "confirmed", "processing"].includes(order.status) && (
                editingItems ? (
                  <button
                    onClick={() => setEditingItems(false)}
                    style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "1.5px solid #E2E0DA", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#7A7880" }}>
                    ✕ Done Editing
                  </button>
                ) : (
                  <button
                    onClick={() => setEditingItems(true)}
                    style={{ display: "flex", alignItems: "center", gap: "5px", background: "#F4F3EF", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#2A2830" }}>
                    ✎ Edit
                  </button>
                )
              )}
            </div>

            {/* Add Items — only in edit mode */}
            {editingItems && (
              <div style={{ background: "#F4F3EF", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#7A7880", marginBottom: "10px" }}>Add Product</div>
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ position: "relative" }}>
                    <input
                      value={itemSearch}
                      onChange={e => handleItemSearchChange(e.target.value)}
                      placeholder="Search product by name, SKU, or color…"
                      style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "13px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box" as const, background: "#fff" }}
                    />
                    {itemResults.length > 0 && !sizeGrid && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "6px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", zIndex: 50, maxHeight: "220px", overflowY: "auto" as const }}>
                        {itemResults.map(v => (
                          <div
                            key={`${v.product_id}-${v.color ?? ""}`}
                            onClick={() => openSizeGrid(v)}
                            style={{ padding: "9px 12px", fontSize: "13px", cursor: "pointer", borderBottom: "1px solid #F4F3EF" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F4F3EF")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                          >
                            <span style={{ fontWeight: 600, color: "#2A2830" }}>{v.product_name}</span>
                            <span style={{ color: "#7A7880", marginLeft: "8px" }}>{v.color || "—"}</span>
                            <span style={{ color: "#1A5CFF", marginLeft: "8px", fontSize: "11px" }}>· pick sizes →</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {sizeGrid && (
                  <div style={{ background: "#fff", border: "1.5px solid #E2E0DA", borderRadius: "8px", padding: "12px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                        {sizeGrid.productName} <span style={{ color: "#7A7880", fontWeight: 600 }}>· {sizeGrid.color || "—"}</span>
                      </div>
                      <button onClick={() => { setSizeGrid(null); setItemSearch(""); }} style={{ fontSize: "12px", color: "#E8242A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>✕ Close</button>
                    </div>
                    {sizeGrid.rows.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "#7A7880" }}>No sizes found for this color.</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "8px" }}>
                        {sizeGrid.rows.map(r => (
                          <div key={r.variant_id} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "3px", border: "1px solid #E2E0DA", borderRadius: "6px", padding: "7px 8px", minWidth: "60px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#2A2830" }}>{r.size || "—"}</div>
                            <div style={{ fontSize: "10.5px", color: "#059669", fontWeight: 600 }}>${r.price.toFixed(2)}</div>
                            <input
                              type="number"
                              min={0}
                              value={r.qty || ""}
                              placeholder="0"
                              onChange={e => setGridQty(r.variant_id, Number(e.target.value))}
                              style={{ width: "50px", padding: "5px 4px", border: "1.5px solid #E2E0DA", borderRadius: "5px", fontSize: "13px", textAlign: "center" as const, background: "#fff" }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", gap: "8px", flexWrap: "wrap" as const }}>
                      <div style={{ fontSize: "12px", color: "#7A7880", fontWeight: 600 }}>
                        {sizeGrid.rows.reduce((s, r) => s + (r.qty || 0), 0)} pcs · ${sizeGrid.rows.reduce((s, r) => s + (r.qty || 0) * r.price, 0).toFixed(2)}
                      </div>
                      <button
                        onClick={handleBulkAdd}
                        disabled={bulkAdding || !sizeGrid.rows.some(r => r.qty > 0)}
                        style={{ background: (!bulkAdding && sizeGrid.rows.some(r => r.qty > 0)) ? "#059669" : "#E2E0DA", color: (!bulkAdding && sizeGrid.rows.some(r => r.qty > 0)) ? "#fff" : "#aaa", border: "none", padding: "9px 18px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: (!bulkAdding && sizeGrid.rows.some(r => r.qty > 0)) ? "pointer" : "not-allowed", whiteSpace: "nowrap" as const }}>
                        {bulkAdding ? "Adding…" : "+ Add to order"}
                      </button>
                    </div>
                  </div>
                )}
                {addItemMsg && (
                  <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 600, color: addItemMsg.ok ? "#059669" : "#E8242A" }}>{addItemMsg.text}</div>
                )}
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E0DA" }}>
                  {["Product", "Product Code", "Color / Sizes", "Qty", "Unit Price", "Total", ""].map(h => (
                    <th key={h} style={{ textAlign: (h === "Qty" || h === "Unit Price" || h === "Total") ? "right" as const : "left" as const, padding: "10px 12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#7A7880" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupOrderItems(order.items).map((g, i, arr) => (
                  <tr key={g.key} style={{ borderBottom: i < arr.length - 1 ? "1px solid #F4F3EF" : "none" }}>
                    <td style={{ padding: "14px 12px", fontWeight: 700, fontSize: "14px", color: "#2A2830", verticalAlign: "top" as const }}>{g.product_name}</td>
                    <td style={{ padding: "14px 12px", fontSize: "12px", color: "#7A7880", fontFamily: "monospace", verticalAlign: "top" as const }}>{g.product_code ?? "—"}</td>
                    <td style={{ padding: "14px 12px", verticalAlign: "top" as const }}>
                      {g.color && <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830", marginBottom: "6px" }}>{g.color}</div>}
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "6px" }}>
                        {g.sizes.map(s => (
                          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#F4F3EF", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, color: "#2A2830" }}>
                            {s.size ?? "—"}<span style={{ color: "#7A7880", fontWeight: 400 }}>×</span>{s.quantity}
                            {editingItems && (
                              <button
                                onClick={() => handleRemoveItem(s.id, String(s.line_total))}
                                title="Remove this size"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#E8242A", fontSize: "12px", fontWeight: 700, padding: 0, marginLeft: "2px", lineHeight: 1 }}>
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const, fontWeight: 700, color: "#2A2830", verticalAlign: "top" as const }}>{g.totalQty}</td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const, color: "#7A7880", verticalAlign: "top" as const, whiteSpace: "nowrap" as const }}>
                      {editingItems ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                          <span style={{ fontSize: "13px", color: "#7A7880" }}>$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={priceEdits[g.key] ?? (g.minPrice === g.maxPrice ? g.minPrice.toFixed(2) : "")}
                            placeholder={g.minPrice === g.maxPrice ? undefined : `${g.minPrice.toFixed(2)}–${g.maxPrice.toFixed(2)}`}
                            onChange={e => setPriceEdits(prev => ({ ...prev, [g.key]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") handleApplyGroupPrice(g.key, g.sizes.map(s => s.id)); }}
                            title="Set a manual price for every size in this row"
                            style={{ width: "78px", padding: "6px 8px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "13px", textAlign: "right", fontFamily: "var(--font-jakarta)" }}
                          />
                          <button
                            onClick={() => handleApplyGroupPrice(g.key, g.sizes.map(s => s.id))}
                            disabled={savingPriceKey === g.key}
                            title="Apply this price"
                            style={{ padding: "6px 9px", border: "none", borderRadius: "6px", background: savingPriceKey === g.key ? "#9CA3AF" : "#059669", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: savingPriceKey === g.key ? "default" : "pointer", lineHeight: 1 }}>
                            {savingPriceKey === g.key ? "…" : "✓"}
                          </button>
                        </div>
                      ) : (
                        g.minPrice === g.maxPrice ? `$${g.minPrice.toFixed(2)}` : `$${g.minPrice.toFixed(2)}–$${g.maxPrice.toFixed(2)}`
                      )}
                    </td>
                    <td style={{ padding: "14px 12px", textAlign: "right" as const, fontWeight: 700, fontFamily: "var(--font-bebas)", fontSize: "16px", color: "#2A2830", verticalAlign: "top" as const }}>${g.totalPrice.toFixed(2)}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div style={{ borderTop: "2px solid #E2E0DA", marginTop: "16px", paddingTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <div style={{ minWidth: "260px" }}>
                {/* Pieces, not money. Each line shows its own quantity, but an order is
                    agreed in total pieces — case counts, pallet counts — so that figure
                    should not have to be added up by hand. */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#2A2830", fontWeight: 700 }}>
                  <span>Total Quantity</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {(order.items ?? []).reduce((t, i) => t + Number(i.quantity ?? 0), 0).toLocaleString()} pcs
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#7A7880" }}>
                  <span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#7A7880" }}>
                  <span>Shipping</span><span>${Number(order.shipping_cost).toFixed(2)}</span>
                </div>
                {/* Admin discount — either a percent off the subtotal, which follows
                    it as items change, or a fixed amount that was agreed and stays put. */}
                {editingDiscount ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }} className="no-print">
                    <span style={{ fontSize: "14px", color: "#7A7880", flex: 1 }}>Discount</span>
                    <div style={{ display: "inline-flex", border: "1.5px solid #E2E0DA", borderRadius: "6px", overflow: "hidden" }}>
                      {(["percent", "amount"] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setDiscountMode(m)}
                          title={m === "percent" ? "A percentage of the subtotal — follows it as items change" : "A fixed amount off — stays the same as items change"}
                          style={{
                            padding: "5px 9px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700, lineHeight: 1,
                            background: discountMode === m ? "#1B3A5C" : "#fff",
                            color: discountMode === m ? "#fff" : "#7A7880",
                          }}
                        >
                          {m === "percent" ? "%" : "$"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min={0} max={discountMode === "percent" ? 100 : undefined} step="0.01" autoFocus
                      value={discountInput}
                      onChange={e => setDiscountInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveDiscount(); }}
                      placeholder={discountMode === "percent" ? "10" : "50.00"}
                      style={{ width: "72px", padding: "5px 7px", border: "1.5px solid #E2E0DA", borderRadius: "6px", fontSize: "13px", textAlign: "right", fontFamily: "var(--font-jakarta)" }}
                    />
                    <button onClick={() => handleSaveDiscount()} disabled={savingDiscount}
                      style={{ padding: "5px 9px", border: "none", borderRadius: "6px", background: savingDiscount ? "#9CA3AF" : "#059669", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>
                      {savingDiscount ? "…" : "✓"}
                    </button>
                    <button onClick={() => setEditingDiscount(false)} disabled={savingDiscount}
                      style={{ padding: "5px 8px", border: "1px solid #E2E0DA", borderRadius: "6px", background: "#fff", fontSize: "12px", color: "#7A7880", cursor: "pointer", lineHeight: 1 }}>
                      ✕
                    </button>
                  </div>
                ) : Number(order.discount_amount ?? 0) > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#059669" }}>
                    <span>
                      Discount{Number(order.discount_percent ?? 0) > 0 ? ` (${Number(order.discount_percent)}%)` : ""}
                      <button onClick={() => {
                        const pct = Number(order.discount_percent ?? 0);
                        setDiscountMode(pct > 0 ? "percent" : "amount");
                        setDiscountInput(String(pct > 0 ? pct : Number(order.discount_amount ?? 0)));
                        setEditingDiscount(true);
                      }}
                        className="no-print"
                        style={{ marginLeft: "6px", background: "none", border: "none", color: "#1A5CFF", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
                        edit
                      </button>
                      <button onClick={() => handleSaveDiscount(true)} disabled={savingDiscount}
                        className="no-print"
                        style={{ marginLeft: "6px", background: "none", border: "none", color: "#E8242A", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
                        remove
                      </button>
                    </span>
                    <span>−${Number(order.discount_amount ?? 0).toFixed(2)}</span>
                  </div>
                ) : (
                  <div style={{ marginBottom: "8px" }} className="no-print">
                    <button onClick={() => { setDiscountInput(""); setDiscountMode("percent"); setEditingDiscount(true); }}
                      style={{ background: "none", border: "none", color: "#1A5CFF", fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
                      + Add discount
                    </button>
                  </div>
                )}

                {order.tax_amount && Number(order.tax_amount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#7A7880" }}>
                    <span>Tax</span><span>${Number(order.tax_amount).toFixed(2)}</span>
                  </div>
                )}
                {order.convenience_fee && Number(order.convenience_fee) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#D97706" }}>
                    <span>Convenience Fee (3%)</span><span>${Number(order.convenience_fee).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-bebas)", fontSize: "20px", color: "#2A2830", borderTop: "1px solid #E2E0DA", paddingTop: "10px", marginTop: "4px" }}>
                  <span>Total</span><span>${Number(order.total).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* INVOICE & PAYMENT — always visible unless paid+card+no edits */}
          {(order.payment_status !== "paid" || order.items_edited) && (
          <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1B3A5C' }}>Invoice &amp; Payment</p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888' }}>
                {order.payment_status === "paid" && !order.invoice_sent_at
                  ? `Payment received via ${order.payment_method === "ach" ? "ACH / Bank Transfer" : "Card"}`
                  : order.invoice_sent_at
                    ? `Invoice sent ${new Date(order.invoice_sent_at).toLocaleDateString()}`
                    : 'Invoice not yet sent'}
                {Number(order.amount_paid) > 0 && order.payment_status !== "paid" && (
                  <span style={{ color: '#D97706', marginLeft: '6px' }}>
                    · ${Number(order.amount_paid).toFixed(2)} paid · ${Number(order.balance_due ?? 0).toFixed(2)} remaining
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={handleResendInvoice}
              disabled={isResendingInvoice}
              style={{ background: '#fff', color: '#1B3A5C', border: '1px solid #1B3A5C', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: isResendingInvoice ? 'not-allowed' : 'pointer', opacity: isResendingInvoice ? 0.6 : 1 }}>
              {isResendingInvoice ? 'Sending…' : (order.invoice_sent_at ? 'Resend Invoice' : 'Send Invoice')}
            </button>
            {order.payment_status !== "paid" && (
              <button
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid}
                style={{ background: '#10B981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: isMarkingPaid ? 'not-allowed' : 'pointer', opacity: isMarkingPaid ? 0.6 : 1 }}>
                {isMarkingPaid ? 'Saving…' : '✓ Mark as Paid'}
              </button>
            )}
          </div>
          )}

          {/* TIMELINE */}
          <div style={{ ...CardStyle, padding: "24px", marginBottom: 0 }}>
            <h3 style={{ ...SectionHead, fontSize: "18px", letterSpacing: ".05em", marginBottom: "20px" }}>TIMELINE</h3>
            <div style={{ position: "relative", paddingLeft: "28px" }}>
              <div style={{ position: "absolute", left: "23px", top: "8px", bottom: "8px", width: "2px", background: "#E2E0DA" }} />
              {timelineEvents.map((event, i) => (
                <div key={i} style={{ display: "flex", gap: "16px", marginBottom: "20px", position: "relative", alignItems: "flex-start" }}>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: event.color, border: "2px solid #fff", boxShadow: `0 0 0 2px ${event.color}`, flexShrink: 0, zIndex: 1, marginLeft: "-14px", marginTop: "2px" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{event.text}</div>
                    {event.sub && <div style={{ fontSize: "12px", color: "#7A7880", marginTop: "2px" }}>{event.sub}</div>}
                    <div style={{ fontSize: "11px", color: "#bbb", marginTop: "4px" }}>{new Date(event.time).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div>
          {/* ── SECTION 0: DOCUMENTS ── */}
          {/* <div style={CardStyle}>
            <h3 style={{ ...SectionHead, marginBottom: "14px" }}>DOCUMENTS</h3>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
              <button
                onClick={handleResendInvoice}
                disabled={isResendingInvoice}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: isResendingInvoice ? "#F4F3EF" : "#1B3A5C", color: isResendingInvoice ? "#7A7880" : "#fff", border: "none", padding: "10px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: isResendingInvoice ? "not-allowed" : "pointer", opacity: isResendingInvoice ? .6 : 1, width: "100%", justifyContent: "center" as const }}>
                {isResendingInvoice ? "Sending…" : "📄 Email Invoice to Customer"}
              </button>
              <a
                href={`/api/v1/orders/${id}/pdf/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" as const, gap: "8px", background: "#F4F3EF", color: "#2A2830", border: "1px solid #E2E0DA", padding: "10px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                ⬇ Download Invoice PDF
              </a>
            </div>
          </div> */}

          {/* ── SECTION 1: NOTES ── */}
          <div style={CardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={SectionHead}>NOTES</h3>
              <button onClick={() => { setEditingNote(true); setNoteText(order.order_notes ?? ""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>✏️</button>
            </div>

            {editingNote ? (
              <div>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Add note about this order…"
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #1A5CFF", borderRadius: "6px", fontSize: "13px", fontFamily: "var(--font-jakarta)", minHeight: "80px", resize: "vertical" as const, outline: "none", boxSizing: "border-box" as const }} />
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button onClick={handleSaveNote}
                    style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                    Save
                  </button>
                  <button onClick={() => setEditingNote(false)}
                    style={{ background: "none", border: "1px solid #E2E0DA", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", color: "#555" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: order.order_notes ? "#2A2830" : "#bbb", fontStyle: order.order_notes ? "normal" : "italic" as const, lineHeight: 1.65 }}>
                {order.order_notes || "No notes added yet"}
              </p>
            )}

            {(order.po_number || order.qb_invoice_id) && (
              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #F4F3EF" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Additional Details</div>
                {order.po_number && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" }}>
                    <span style={{ color: "#7A7880" }}>PO Number</span>
                    <span style={{ fontWeight: 600, color: "#2A2830" }}>{order.po_number}</span>
                  </div>
                )}
                {order.qb_invoice_id && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                    <span style={{ color: "#7A7880" }}>QB Invoice</span>
                    <span style={{ fontWeight: 600, color: "#059669" }}>#{order.qb_invoice_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 2: CUSTOMER ── */}
          <div style={CardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={SectionHead}>CUSTOMER</h3>
              <span onClick={() => router.push(`/admin/customers/${order.company_id}`)}
                style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, cursor: "pointer" }}>
                View Profile →
              </span>
            </div>

            {/* Avatar + company */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#1A5CFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "16px", flexShrink: 0 }}>
                {avatarInitial}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>{order.customer_name ?? order.company_name}</div>
                {order.customer_name && <div style={{ fontSize: "12px", color: "#7A7880" }}>{order.company_name}</div>}
              </div>
            </div>

            {/* Contact */}
            {(order.customer_email || order.customer_phone) && (
              <div style={{ fontSize: "13px", marginBottom: "14px" }}>
                {order.customer_email && <div style={{ color: "#1A5CFF", marginBottom: "4px" }}>📧 {order.customer_email}</div>}
                {order.customer_phone && <div style={{ color: "#7A7880" }}>📞 {order.customer_phone}</div>}
              </div>
            )}

            {/* All orders link */}
            <div style={{ background: "#F4F3EF", borderRadius: "6px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" }}>
              <span style={{ color: "#7A7880" }}>Orders from this company: </span>
              <span onClick={() => router.push(`/admin/orders?company=${order.company_id}`)}
                style={{ fontWeight: 700, color: "#1A5CFF", cursor: "pointer" }}>
                View all →
              </span>
            </div>

            {/* Shipping Address */}
            {addr && (
              <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa" }}>Shipping Address</div>
                  {!editingAddress && (
                    <button onClick={openAddressEditor}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}>✏️</button>
                  )}
                </div>

                {editingAddress ? (
                  <div>
                    <div style={{ marginBottom: "8px" }}>
                      <label style={AddrLabel}>Full Name</label>
                      <input value={addressForm.full_name} onChange={e => setAddressForm(f => ({ ...f, full_name: e.target.value }))} style={AddrInput} />
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <label style={AddrLabel}>Street Address *</label>
                      <input value={addressForm.address_line1} onChange={e => setAddressForm(f => ({ ...f, address_line1: e.target.value }))} style={AddrInput} />
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <label style={AddrLabel}>Apt / Suite / Unit</label>
                      <input value={addressForm.address_line2} onChange={e => setAddressForm(f => ({ ...f, address_line2: e.target.value }))} style={AddrInput} />
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <div style={{ flex: 2 }}>
                        <label style={AddrLabel}>City *</label>
                        <input value={addressForm.city} onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))} style={AddrInput} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={AddrLabel}>State *</label>
                        <input value={addressForm.state} onChange={e => setAddressForm(f => ({ ...f, state: e.target.value }))} style={AddrInput} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={AddrLabel}>ZIP *</label>
                        <input value={addressForm.postal_code} onChange={e => setAddressForm(f => ({ ...f, postal_code: e.target.value }))} style={AddrInput} />
                      </div>
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={AddrLabel}>Phone (helps USPS/Shippo validate the address)</label>
                      <input value={addressForm.phone} onChange={e => setAddressForm(f => ({ ...f, phone: e.target.value }))} style={AddrInput} placeholder="Optional" />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={handleSaveAddress} disabled={savingAddress}
                        style={{ background: "#1A5CFF", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: savingAddress ? 0.6 : 1 }}>
                        {savingAddress ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditingAddress(false)} disabled={savingAddress}
                        style={{ background: "none", border: "1px solid #E2E0DA", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", color: "#555" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: "13px", color: "#2A2830", lineHeight: 1.7 }}>
                      {addr.full_name && <div style={{ fontWeight: 600 }}>{addr.full_name}</div>}
                      {addr.address_line1 && <div>{addr.address_line1}</div>}
                      {addr.address_line2 && <div>{addr.address_line2}</div>}
                      {(addr.city || addr.state) && <div>{[addr.city, addr.state, zip].filter(Boolean).join(", ")}</div>}
                      <div>{addr.country ?? "United States"}</div>
                    </div>
                    {mapQuery && (
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(mapQuery)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: "12px", color: "#1A5CFF", fontWeight: 700, textDecoration: "none", display: "inline-block", marginTop: "6px" }}>
                        View map →
                      </a>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Billing Address</div>
              <div style={{ fontSize: "13px", color: "#7A7880" }}>Same as shipping address</div>
            </div>

            {/* Company Registration Info */}
            {companyReg && (companyReg.company_email || companyReg.address_line1 || companyReg.city || companyReg.secondary_business || companyReg.ppac_number || companyReg.how_heard) && (
              <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginTop: "4px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "10px" }}>Company Registration Info</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px", fontSize: "13px" }}>
                  {companyReg.company_email && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>Company Email: </span><span style={{ color: "#2A2830", fontWeight: 600 }}>{companyReg.company_email}</span></div>
                  )}
                  {(companyReg.address_line1 || companyReg.city) && (
                    <div>
                      <span style={{ color: "#7A7880", fontSize: "11px" }}>Address: </span>
                      <span style={{ color: "#2A2830" }}>
                        {[companyReg.address_line1, companyReg.address_line2, companyReg.city, companyReg.state_province, companyReg.postal_code, companyReg.country].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  {companyReg.secondary_business && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>Secondary Business: </span><span style={{ color: "#2A2830" }}>{companyReg.secondary_business}</span></div>
                  )}
                  {companyReg.estimated_annual_volume && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>Est. Annual Volume: </span><span style={{ color: "#2A2830" }}>{companyReg.estimated_annual_volume}</span></div>
                  )}
                  {(companyReg.ppac_number || companyReg.ppai_number || companyReg.asi_number) && (
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const }}>
                      {companyReg.ppac_number && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>PPAC: </span><span style={{ color: "#2A2830" }}>{companyReg.ppac_number}</span></span>}
                      {companyReg.ppai_number && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>PPAI: </span><span style={{ color: "#2A2830" }}>{companyReg.ppai_number}</span></span>}
                      {companyReg.asi_number && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>ASI: </span><span style={{ color: "#2A2830" }}>{companyReg.asi_number}</span></span>}
                    </div>
                  )}
                  {(companyReg.num_employees || companyReg.num_sales_reps) && (
                    <div style={{ display: "flex", gap: "16px" }}>
                      {companyReg.num_employees && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>Employees: </span><span style={{ color: "#2A2830" }}>{companyReg.num_employees}</span></span>}
                      {companyReg.num_sales_reps && <span><span style={{ color: "#7A7880", fontSize: "11px" }}>Sales Reps: </span><span style={{ color: "#2A2830" }}>{companyReg.num_sales_reps}</span></span>}
                    </div>
                  )}
                  {companyReg.how_heard && (
                    <div><span style={{ color: "#7A7880", fontSize: "11px" }}>How heard: </span><span style={{ color: "#2A2830" }}>{companyReg.how_heard}</span></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION 3: CONVERSION SUMMARY ── */}
          <div style={{ ...CardStyle, marginBottom: 0 }}>
            <h3 style={{ ...SectionHead, marginBottom: "14px" }}>CONVERSION SUMMARY</h3>

            {/* Key metrics */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F4F3EF", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>🛒</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                    {customerStats?.total_orders ?? 1} total orders
                  </div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>from this customer</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F4F3EF", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>💰</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                    ${customerStats ? Number(customerStats.total_spent).toFixed(2) : Number(order.total).toFixed(2)} lifetime value
                  </div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>total revenue from customer</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F4F3EF", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>📅</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>
                    {customerStats?.created_at
                      ? new Date(customerStats.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                      : "New Customer"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#7A7880" }}>customer since</div>
                </div>
              </div>
            </div>

            {/* Order source */}
            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "10px" }}>Order Source</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2A2830", marginBottom: "6px" }}>
                <span>🌐</span><span>Online Store — Direct</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2A2830" }}>
                <span>📱</span><span>Device: Desktop</span>
              </div>
            </div>

            {/* Pricing tier */}
            {order.pricing_tier && (
              <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px", marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Pricing Tier</div>
                <span style={{ background: "rgba(26,92,255,.1)", color: "#1A5CFF", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
                  {order.pricing_tier}
                </span>
              </div>
            )}

            {/* Payment */}
            <div style={{ borderTop: "1px solid #F4F3EF", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#aaa", marginBottom: "8px" }}>Payment</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" }}>
                <span style={{ color: "#7A7880" }}>Method</span>
                <span style={{ fontWeight: 600, color: "#2A2830" }}>{order.payment_method === "ach" ? "ACH / Bank Transfer" : (order.payment_method ?? "Card")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" }}>
                <span style={{ color: "#7A7880" }}>Status</span>
                <span style={{ background: order.payment_status === "paid" ? "rgba(5,150,105,.1)" : "rgba(217,119,6,.1)", color: order.payment_status === "paid" ? "#059669" : "#D97706", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700 }}>
                  {order.payment_status.toUpperCase()}
                </span>
              </div>
              {order.payment_method === "ach" && (
                <div style={{ marginTop: "10px", padding: "12px 14px", background: "#F4F3EF", borderRadius: "8px", fontSize: "12px", display: "flex", flexDirection: "column" as const, gap: "4px" }}>
                  {order.ach_bank_name && <div><span style={{ color: "#7A7880" }}>Bank: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>{order.ach_bank_name}</span></div>}
                  {order.ach_account_holder && <div><span style={{ color: "#7A7880" }}>Holder: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>{order.ach_account_holder}</span></div>}
                  {order.ach_account_last4 && <div><span style={{ color: "#7A7880" }}>Account: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>****{order.ach_account_last4}</span></div>}
                  {order.ach_account_type && <div><span style={{ color: "#7A7880" }}>Type: </span><span style={{ fontWeight: 600, color: "#2A2830" }}>{order.ach_account_type.charAt(0).toUpperCase() + order.ach_account_type.slice(1)}</span></div>}
                  <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ background: order.ach_verified ? "rgba(5,150,105,.12)" : "rgba(217,119,6,.12)", color: order.ach_verified ? "#059669" : "#D97706", padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 700 }}>
                      {order.ach_verified ? "Verified" : "Pending Verification"}
                    </span>
                    {/* A bank debit is a request that clears over days and can
                        still come back. Saying only "pending" would hide the
                        difference between waiting and having been refused. */}
                    {order.qb_echeck_status && !order.ach_verified && (
                      <span style={{
                        marginLeft: "8px", padding: "3px 10px", borderRadius: "10px",
                        fontSize: "11px", fontWeight: 700,
                        ...(["SUCCEEDED", "SETTLED", "CAPTURED", "PAID"].includes(order.qb_echeck_status)
                          ? { background: "rgba(5,150,105,.12)", color: "#059669" }
                          : ["FAILED", "DECLINED", "VOIDED", "RETURNED", "CANCELLED", "REJECTED", "FAILED_TO_RAISE"].includes(order.qb_echeck_status)
                          ? { background: "rgba(220,38,38,.12)", color: "#dc2626" }
                          : { background: "rgba(180,83,9,.12)", color: "#B45309" }),
                      }}>
                        {order.qb_echeck_status === "FAILED_TO_RAISE"
                          ? "Transfer could not be started"
                          : ["FAILED", "DECLINED", "VOIDED", "RETURNED", "CANCELLED", "REJECTED"].includes(order.qb_echeck_status)
                          ? `Transfer returned (${order.qb_echeck_status.toLowerCase()})`
                          : "Transfer in progress — 1-5 business days"}
                      </span>
                    )}
                    {!order.ach_verified && (
                      <button onClick={handleVerifyAch} disabled={isVerifyingAch}
                        style={{ background: "#059669", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: isVerifyingAch ? .6 : 1 }}>
                        {isVerifyingAch ? "Verifying…" : "Mark as Verified"}
                      </button>
                    )}
                  </div>
                  {/* A bank can be told, up to two years on, that this debit was
                      never allowed. This is the answer to that: what the customer
                      read, when they agreed, and from where. */}
                  {order.ach_authorized_at && (
                    <details style={{ marginTop: "8px", fontSize: "11px", color: "#7A7880" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#059669" }}>
                        Authorised {new Date(order.ach_authorized_at).toLocaleString()}
                        {order.ach_authorized_ip ? ` · from ${order.ach_authorized_ip}` : ""}
                      </summary>
                      <p style={{ marginTop: "6px", lineHeight: 1.6, color: "#5A5A5A", fontStyle: "italic" }}>
                        &ldquo;{order.ach_authorization_text}&rdquo;
                      </p>
                      <p style={{ marginTop: "6px", color: "#9A9A9A" }}>
                        Keep this for two years — it is what answers a disputed debit.
                      </p>
                    </details>
                  )}
                </div>
              )}
              {/* Shown for every payment method. This row used to be hidden on ACH
                  orders, so the one place that would have said "invoiced, but the
                  payment never reached QuickBooks" was invisible exactly where
                  that was happening. */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", marginTop: "5px" }}>
                <span style={{ color: "#7A7880" }}>QB Invoice</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: 600, color: order.qb_invoice_id ? "#059669" : "#aaa" }}>
                    {order.qb_invoice_id ? `#${order.qb_invoice_id}` : "Not synced"}
                  </span>
                  {!order.qb_invoice_id && (
                    <button
                      onClick={handleSyncQB}
                      disabled={isSyncing}
                      style={{ background: "#1B3A5C", color: "#fff", border: "none", padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: isSyncing ? "not-allowed" : "pointer", opacity: isSyncing ? 0.6 : 1 }}>
                      {isSyncing ? "Syncing…" : "Sync Now"}
                    </button>
                  )}
                </div>
              </div>
              {/* Invoiced and settled here, but nothing recorded against it in the
                  books — the gap that left every ACH payment out of QuickBooks. */}
              {order.qb_invoice_id && order.payment_status === "paid" && !order.qb_payment_id && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", fontSize: "13px", marginTop: "8px", padding: "8px 10px", background: "#FEF6E7", border: "1px solid #E4B85C", borderRadius: "6px" }}>
                  <span style={{ color: "#7A4F0B", fontWeight: 600, lineHeight: 1.4 }}>
                    Payment not in QuickBooks
                  </span>
                  <button
                    onClick={handleSyncQB}
                    disabled={isSyncing}
                    title="Record this order's payment against its QuickBooks invoice. Nothing else on the invoice is changed."
                    style={{ flexShrink: 0, background: "#B45309", color: "#fff", border: "none", padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: isSyncing ? "not-allowed" : "pointer", opacity: isSyncing ? 0.6 : 1 }}>
                    {isSyncing ? "Recording…" : "Record Payment"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
