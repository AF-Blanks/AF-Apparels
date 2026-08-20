"use client";

import Link from "next/link";
import { TrendingUpIcon, PackageIcon, UsersIcon } from "@/components/ui/icons";

const REPORT_CARDS = [
  {
    href: "/admin/reports/sales",
    title: "Sales Report",
    description: "Revenue by period, category breakdown, top products",
    icon: <TrendingUpIcon size={36} color="#1A5CFF" />,
  },
  {
    href: "/admin/reports/inventory",
    title: "Inventory Report",
    description: "Stock levels, low-stock alerts, movement history",
    icon: <PackageIcon size={36} color="#1A5CFF" />,
  },
  {
    href: "/admin/reports/inventory-value",
    title: "Inventory Value",
    description: "Total worth of stock on hand — quantity × unit cost",
    icon: <PackageIcon size={36} color="#16a34a" />,
  },
  {
    href: "/admin/reports/variant-sales",
    title: "Variant Sales",
    description: "Color & size breakdown of sold variants by period",
    icon: <TrendingUpIcon size={36} color="#16a34a" />,
  },
  {
    href: "/admin/reports/stock-movement",
    title: "Stock Movement",
    description: "Opening stock, sold, received and on order — per variant, per month",
    icon: <PackageIcon size={36} color="#1B3A5C" />,
  },
  {
    href: "/admin/reports/variant-comparison",
    title: "Variant Sales Comparison",
    description: "One month against another, by product, colour and size",
    icon: <TrendingUpIcon size={36} color="#0e7490" />,
  },
  {
    href: "/admin/reports/customers",
    title: "Customer Report",
    description: "New registrations, approval rate, AOV by tier",
    icon: <UsersIcon size={36} color="#1A5CFF" />,
  },
  {
    href: "/admin/reports/outstanding",
    title: "Outstanding Balances",
    description: "Who owes money, how much, and how long it's been due",
    icon: <UsersIcon size={36} color="#E8242A" />,
  },
  {
    href: "/admin/reports/purchase-history",
    title: "Customer Purchase History",
    description: "Per-customer order history by product or line-item price",
    icon: <UsersIcon size={36} color="#0e7490" />,
  },
  {
    href: "/admin/reports/inventory-qb",
    title: "Inventory vs QuickBooks",
    description: "Where our stock and QuickBooks' quantity on hand disagree",
    icon: <PackageIcon size={36} color="#dc2626" />,
  },
  {
    href: "/admin/reports/qb-reconciliation",
    title: "QuickBooks Reconciliation",
    description: "Why dashboard sales and a QuickBooks P&L differ — order by order",
    icon: <TrendingUpIcon size={36} color="#7c3aed" />,
  },
];

export default function ReportsDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Business insights across sales, inventory, and customers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {REPORT_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-blue-300 transition-all"
          >
            <div className="mb-3">{card.icon}</div>
            <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{card.description}</p>
            <span className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
              View report →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
