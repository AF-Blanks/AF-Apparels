/**
 * The cut-off notice, moving continuously right to left.
 *
 * It is the one thing a shopper needs to know before ordering and cannot work
 * out from the page, so it repeats rather than sitting still: a static line at
 * the top of every page stops being read after the first visit.
 *
 * The track is two identical halves and slides exactly half its own width, so
 * the moment it resets the second half is already where the first was and the
 * loop has no seam. Each half repeats the notice several times — with only one
 * copy per half, a wide screen outruns the text and leaves a gap on the right
 * before the next copy arrives.
 *
 * Motion is slow on purpose; this is a notice, not an attention-grab. It pauses
 * on hover and stops entirely for anyone who has asked for reduced motion.
 */
const NOTICE =
  "Order before 12 PM CT for same-day shipping. Orders placed after 12 PM CT will ship the next business day.";

// Enough copies that one half always overruns the widest screen.
const PER_HALF = 4;

function Half({ hidden }: { hidden?: boolean }) {
  return (
    <div style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden={hidden ? "true" : undefined}>
      {Array.from({ length: PER_HALF }, (_, i) => (
        <span key={i} style={{ paddingRight: "72px", flexShrink: 0 }}>{NOTICE}</span>
      ))}
    </div>
  );
}

function AnnouncementBarInner() {
  return (
    <div
      style={{
        background: "#1C3557",
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "12px",
        letterSpacing: "0.02em",
        padding: "8px 0",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
      role="status"
      aria-label={NOTICE}
    >
      {/* Both halves are hidden from screen readers — the label above already
          reads the notice once, and it should not be heard eight times because
          it happens to scroll. */}
      <div className="announcement-track" style={{ display: "inline-flex" }}>
        <Half hidden />
        <Half hidden />
      </div>
    </div>
  );
}

export default AnnouncementBarInner;
export { AnnouncementBarInner as AnnouncementBar, NOTICE as SHIPPING_CUTOFF_NOTICE };
