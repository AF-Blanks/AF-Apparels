"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { accountService } from "@/services/account.service";

interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  total: string;
  created_at: string;
}

interface Profile {
  first_name: string;
  last_name: string;
  email: string;
}

export default function AccountOverviewPage() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [owed, setOwed] = useState(0);
  const hasLoaded = useRef(false);

  useEffect(() => {
    // Don't fetch until auth is settled and this is an actual customer
    // (admin and staff accounts have no customer dashboard).
    if (isLoading || !user || user.is_admin || user.is_staff) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    async function load() {
      const [p, o, inv] = await Promise.all([
        accountService.getProfile() as Promise<Profile>,
        accountService.getOrders({ page: 1 }) as Promise<{ items: OrderSummary[] }>,
        // What is still owed. Asked for here rather than worked out from the
        // five recent orders shown below, which would miss anything older —
        // and an invoice that has aged is exactly the one worth surfacing.
        (accountService.getInvoices() as Promise<Array<{ balance: number }>>).catch(
          () => [] as Array<{ balance: number }>
        ),
      ]);
      setProfile(p);
      setRecentOrders((o.items ?? []).slice(0, 5));
      setOwed((inv ?? []).reduce((sum, i) => sum + Number(i.balance || 0), 0));
    }
    load();
  }, [isLoading]);

  // Admin and staff accounts don't have a customer dashboard
  if (!isLoading && (user?.is_admin || user?.is_staff)) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-amber-800 mb-1">Admin Account</h2>
        <p className="text-sm text-amber-700">
          Admin accounts don&apos;t have a customer dashboard.{" "}
          <Link href="/admin/dashboard" className="underline font-medium">
            Use the Admin Panel →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">
        Welcome{profile ? `, ${profile.first_name}` : ""}
      </h1>

      {/* What is owed, and somewhere to pay it. A customer on Net 30 or Net 7
          had nowhere at all to settle a balance from their own account — the
          payment page existed and nothing linked to it. */}
      {owed > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Outstanding balance
            </p>
            <p className="mt-0.5 text-2xl font-bold text-amber-900">
              ${owed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <Link
            href="/account/invoices"
            className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-800"
          >
            View &amp; pay invoices
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {[
          { label: "Orders", href: "/account/orders" },
          { label: "Profile", href: "/account/profile" },
          { label: "Addresses", href: "/account/addresses" },
          { label: "Price List", href: "/account/price-list" },
          { label: "Sales History", href: "/account/sales-history" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-white border border-gray-200 rounded-lg p-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {item.label} →
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Orders</h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentOrders.map((order) => (
              <li key={order.id} className="py-2 flex items-center justify-between">
                <div>
                  <Link href={`/account/orders/${order.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-800">
                    {order.order_number}
                  </Link>
                  <span className="ml-2 text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-700">${Number(order.total).toFixed(2)}</p>
                  <p className="text-xs text-gray-400 capitalize">{order.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
