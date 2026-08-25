"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { authService } from "@/services/auth.service";
import { apiClient } from "@/lib/api-client";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { ShoppingCartIcon } from "@/components/ui/icons";
import { SiteSearch } from "@/components/layout/SiteSearch";

const RESOURCES_LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/style-sheets", label: "Style Sheets" },
  { href: "/product-specs", label: "Product Specs" },
  { href: "/print-guide", label: "Print Guide" },
  { href: "/reviews", label: "Customer Reviews" },
  { href: "/private-label", label: "Private Label" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact Us" },
];

export function Header() {
  const { user, isAuthenticated, isAdmin, clearAuth, isLoading } = useAuthStore();
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (resourcesRef.current && !resourcesRef.current.contains(e.target as Node)) {
        setResourcesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isLoading || !user || user.is_admin || user.is_staff) return;
    function loadCount() {
      apiClient
        .get<{ items: { quantity: number }[] }>("/api/v1/cart")
        .then((r) => {
          const items = r?.items ?? [];
          setCartCount(items.reduce((sum, i) => sum + i.quantity, 0));
        })
        .catch(() => {});
    }
    loadCount();
    window.addEventListener("cart_updated", loadCount);
    return () => window.removeEventListener("cart_updated", loadCount);
  }, [isLoading, user]);

  useEffect(() => {
    if (isLoading || user) return;
    function readGuestCount() {
      try {
        const entries: { quantity: number }[] = JSON.parse(localStorage.getItem("af_guest_cart") || "[]");
        setCartCount(entries.reduce((s, i) => s + i.quantity, 0));
      } catch {
        setCartCount(0);
      }
    }
    readGuestCount();
    window.addEventListener("storage", readGuestCount);
    window.addEventListener("af_guest_cart_updated", readGuestCount);
    return () => {
      window.removeEventListener("storage", readGuestCount);
      window.removeEventListener("af_guest_cart_updated", readGuestCount);
    };
  }, [isLoading, user]);

  async function handleLogout() {
    try {
      await authService.logout();
    } catch {
      // ignore
    }
    clearAuth();
    setCartCount(0);
    router.push("/login");
  }

  const navLinkStyle: React.CSSProperties = {
    color: "#1C3557",
    fontSize: "18px",
    fontWeight: 500,
    textDecoration: "none",
    letterSpacing: ".01em",
    padding: "6px 12px",
    transition: "color .15s",
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <>
      <AnnouncementBar />

      {/* Main header */}
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E2DE", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="header-inner" style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "90px", gap: "24px" }}>

          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <Image src="/Af-apparel logo.png" alt="AF Blanks" height={52} width={75} className="af-logo" style={{ objectFit: "contain", display: "block" }} />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex" style={{ gap: "0px", alignItems: "center" }}>
            {([
              { href: "/products", label: "Shop All" },
              { href: "/products?category=t-shirts", label: "T-Shirts" },
              { href: "/products?category=hoodies", label: "Hoodies" },
              { href: "/products", label: "New" },
            ] as { href: string; label: string }[]).map(({ href, label }) => (
              <Link key={label} href={href} style={navLinkStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
                {label}
              </Link>
            ))}

            {/* Resources dropdown */}
            <div ref={resourcesRef} style={{ position: "relative" }}>
              <button
                onClick={() => setResourcesOpen(o => !o)}
                style={{ ...navLinkStyle, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" } as React.CSSProperties}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#1c3557"; }}
                onMouseLeave={e => { if (!resourcesOpen) { (e.currentTarget as HTMLButtonElement).style.color = "#1C3557"; } }}
              >
                Resources
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginTop: "1px", opacity: 0.6, transform: resourcesOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {resourcesOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "4px", background: "#fff", border: "1px solid #E2E2DE", padding: "6px", minWidth: "200px", boxShadow: "0 8px 24px rgba(0,0,0,.08)", zIndex: 100 }}>
                  {RESOURCES_LINKS.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setResourcesOpen(false)}
                      style={{ display: "block", padding: "9px 12px", color: "#1C3557", fontSize: "18px", fontWeight: 500, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", transition: "background .15s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F8F8F6")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Admin link */}
            {isAdmin() && (
              <Link href="/admin/dashboard" style={navLinkStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
                Admin Panel
              </Link>
            )}

            {/* Authenticated non-admin links */}
            {isAuthenticated() && !isAdmin() && (
              <>
                <Link href="/quick-order" style={navLinkStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
                  Quick Order
                </Link>
                <Link href="/account" style={navLinkStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1c3557"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#1C3557"; }}>
                  My Account
                </Link>
              </>
            )}
          </nav>

          {/* Right Actions */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Search — first, because a shopper who knows the style number wants
                to type it, not walk the category menus to reach it. */}
            <SiteSearch />
            {/* US flag */}
            <img src="https://flagcdn.com/w40/us.png" alt="US" width={28} height={18} style={{ objectFit: "cover", borderRadius: "2px", display: "block", marginRight: "8px" }} />
            {/* Cart */}
            {!isAdmin() && (
              <Link href="/cart" style={{ position: "relative", background: "transparent", border: "1px solid #E2E2DE", color: "#1C3557", padding: "8px 12px", cursor: "pointer", fontSize: "18px", transition: "all .2s", display: "flex", alignItems: "center" }}>
                <ShoppingCartIcon size={18} color="#1C3557" />
                {cartCount > 0 && (
                  <span style={{ position: "absolute", top: "-6px", right: "-6px", background: "#1C3557", color: "#fff", fontSize: "9px", fontWeight: 700, width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            <div className="hidden md:flex" style={{ gap: "8px", alignItems: "center" }}>
              {isAuthenticated() ? (
                <>
                  <span style={{ fontSize: "18px", color: "#1C3557", fontFamily: "'DM Sans', sans-serif" }}>
                    {user?.first_name}
                    {isAdmin() && <span style={{ marginLeft: "6px", fontSize: "10px", background: "rgba(28,53,87,.1)", color: "#1C3557", padding: "2px 8px", fontWeight: 600 }}>Admin</span>}
                  </span>
                  <button
                    onClick={handleLogout}
                    style={{ background: "transparent", color: "#1C3557", padding: "8px 16px", fontSize: "18px", border: "1px solid #1C3557", cursor: "pointer", fontWeight: 500, transition: "all .2s", fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" style={{ background: "transparent", color: "#1C3557", padding: "8px 16px", fontSize: "18px", border: "1px solid #1C3557", fontWeight: 500, textDecoration: "none", transition: "all .2s", fontFamily: "'DM Sans', sans-serif" }}>
                    Log In
                  </Link>
                  <Link href="/wholesale/register" style={{ background: "#1C3557", color: "#fff", padding: "8px 18px", fontSize: "18px", fontWeight: 500, textDecoration: "none", transition: "all .2s", fontFamily: "'DM Sans', sans-serif" }}>
                    Apply Now
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden"
              style={{ padding: "8px", color: "#1C3557", background: "transparent", border: "1px solid #E2E2DE", cursor: "pointer" }}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay nav */}
      {menuOpen && (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 200 }}>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)" }}
            onClick={() => setMenuOpen(false)}
          />
          {/* Drawer */}
          <div style={{
            position: "fixed", left: 0, top: 0, bottom: 0, width: "300px",
            background: "#fff", overflowY: "auto", zIndex: 201,
            padding: "0 0 32px",
            boxShadow: "4px 0 24px rgba(0,0,0,.12)",
          }}>
            {/* Drawer header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E2E2DE" }}>
              <Image src="/Af-apparel logo.png" alt="AF Blanks" height={40} width={60} style={{ objectFit: "contain" }} />
              <button
                onClick={() => setMenuOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6B6B", fontSize: "13px", lineHeight: 1, padding: "4px" }}
              >
                ✕
              </button>
            </div>
            {/* Links */}
            <div style={{ padding: "16px 24px" }}>
              {[
                { href: "/products", label: "Shop All" },
                { href: "/products?category=t-shirts", label: "T-Shirts" },
                { href: "/products?category=hoodies", label: "Hoodies" },
                { href: "/about", label: "About Us" },
                { href: "/contact", label: "Contact" },
                { href: "/blog", label: "Blog" },
              ].map(({ href, label }) => (
                <Link key={href} href={href} onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                  {label}
                </Link>
              ))}
              {isAdmin() && (
                <Link href="/admin/dashboard" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                  Admin Panel
                </Link>
              )}
              {isAuthenticated() && !isAdmin() && (
                <>
                  <Link href="/quick-order" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    Quick Order
                  </Link>
                  <Link href="/account" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    My Account
                  </Link>
                  <Link href="/cart" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    Cart {cartCount > 0 && `(${cartCount})`}
                  </Link>
                </>
              )}
              {!isAuthenticated() && (
                <>
                  <Link href="/cart" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "12px 0", color: "#1C3557", fontSize: "14px", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #E2E2DE", fontFamily: "'DM Sans', sans-serif" }}>
                    Cart {cartCount > 0 && `(${cartCount})`}
                  </Link>
                  <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Link href="/wholesale/register" onClick={() => setMenuOpen(false)} style={{ display: "block", background: "#1C3557", color: "#fff", padding: "12px 20px", fontWeight: 500, fontSize: "13px", textDecoration: "none", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                      Apply for Wholesale Account
                    </Link>
                    <Link href="/login" onClick={() => setMenuOpen(false)} style={{ display: "block", background: "transparent", color: "#1C3557", border: "1px solid #1C3557", padding: "12px 20px", fontWeight: 500, fontSize: "13px", textDecoration: "none", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                      Log In
                    </Link>
                  </div>
                </>
              )}
              {isAuthenticated() && (
                <button onClick={handleLogout} style={{ marginTop: "20px", display: "block", width: "100%", textAlign: "center", padding: "12px", color: "#1C3557", fontSize: "18px", fontWeight: 500, background: "transparent", border: "1px solid #E2E2DE", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @media (max-width: 768px) {
          .af-logo { height: 40px !important; width: auto !important; }
          .header-inner { padding: 0 16px !important; }
        }
      `}</style>
    </>
  );
}
