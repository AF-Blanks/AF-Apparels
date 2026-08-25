"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { SearchIcon } from "@/components/ui/icons";

interface Hit {
  id: string;
  name: string;
  slug: string;
  product_code?: string | null;
  fabric?: string | null;
  primary_image?: { url_thumbnail?: string; url_medium?: string } | null;
}

/** Search that answers while you type, opened from the header. */
export function SiteSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Results can come back out of order, so ignore anything but the newest.
  const latest = useRef(0);

  const run = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      setSearched(false);
      return;
    }
    setLoading(true);
    // A pause before asking: typing "1001 black" is nine keystrokes, and firing on
    // each one floods the server to show answers nobody reads.
    timer.current = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const res = await apiClient.get<{ items?: Hit[] } | Hit[]>(
          `/api/v1/products?q=${encodeURIComponent(q.trim())}&page_size=8`
        );
        if (ticket !== latest.current) return;
        const items = Array.isArray(res) ? res : res?.items ?? [];
        setHits(items);
        setActive(0);
      } catch {
        if (ticket === latest.current) setHits([]);
      } finally {
        if (ticket === latest.current) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 220);
  }, []);

  useEffect(() => { run(query); }, [query, run]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
    else { setQuery(""); setHits([]); setSearched(false); }
  }, [open]);

  // Escape closes from anywhere; ⌘K / Ctrl-K opens without reaching for the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function go(hit: Hit) {
    setOpen(false);
    router.push(`/products/${hit.slug}`);
  }

  function seeAll() {
    setOpen(false);
    router.push(`/products?q=${encodeURIComponent(query.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, hits.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (hits[active]) go(hits[active]);
      else if (query.trim()) seeAll();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search products"
        title="Search products  (Ctrl K)"
        style={{
          background: "transparent", border: "1px solid #E2E2DE", color: "#1C3557",
          padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center",
          gap: "8px", transition: "all .2s", fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#1C3557"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E2DE"; }}
      >
        <SearchIcon size={17} color="#1C3557" />
        <span className="site-search-label">Search</span>
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 200, background: "rgba(28,53,87,.28)",
            backdropFilter: "blur(2px)", display: "flex", justifyContent: "center",
            alignItems: "flex-start", padding: "12vh 20px 20px",
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: "640px", background: "#fff",
              border: "1px solid #E2E2DE", boxShadow: "0 24px 64px rgba(28,53,87,.22)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 20px", borderBottom: "1px solid #E2E2DE" }}>
              <SearchIcon size={19} color="#6B6B6B" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search by style, colour or size — try 1001 black"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: "17px",
                  fontFamily: "'DM Sans', sans-serif", color: "#1A1A1A", background: "transparent",
                }}
              />
              <button onClick={() => setOpen(false)} aria-label="Close search"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6B6B", fontSize: "13px", fontFamily: "'DM Sans', sans-serif" }}>
                Esc
              </button>
            </div>

            <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
              {query.trim().length < 2 ? (
                <Note>Type at least two characters. You can combine words — a style number, a colour and a size.</Note>
              ) : loading && hits.length === 0 ? (
                <Note>Searching…</Note>
              ) : hits.length === 0 && searched ? (
                <Note>
                  Nothing matches &ldquo;{query.trim()}&rdquo;. Every word has to match, so try removing one.
                </Note>
              ) : (
                <>
                  {hits.map((h, i) => (
                    <button
                      key={h.id}
                      onClick={() => go(h)}
                      onMouseEnter={() => setActive(i)}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px", width: "100%",
                        textAlign: "left", padding: "12px 20px", border: "none", cursor: "pointer",
                        borderBottom: "1px solid #F4F3EF",
                        background: i === active ? "#F7F6F2" : "transparent",
                      }}
                    >
                      <div style={{ width: "46px", height: "46px", flexShrink: 0, background: "#F7F6F2", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {h.primary_image?.url_thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.primary_image.url_thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        ) : (
                          <span style={{ fontSize: "18px", opacity: 0.25 }}>👕</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {h.name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "2px" }}>
                          {[h.product_code, h.fabric].filter(Boolean).join(" · ") || "View product"}
                        </div>
                      </div>
                    </button>
                  ))}
                  {hits.length > 0 && (
                    <button
                      onClick={seeAll}
                      style={{
                        width: "100%", textAlign: "center", padding: "13px 20px", border: "none",
                        background: "#fff", cursor: "pointer", color: "#1C3557", fontWeight: 700,
                        fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      See all results for &ldquo;{query.trim()}&rdquo; →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "26px 20px", textAlign: "center", color: "#6B6B6B", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}
