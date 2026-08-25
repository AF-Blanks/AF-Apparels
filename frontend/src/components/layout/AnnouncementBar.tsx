/**
 * The cut-off notice, moving continuously right to left.
 *
 * It is the one thing a shopper needs to know before they order and cannot work
 * out from the page, so it repeats rather than sitting still: a static line at
 * the top of every page stops being read after the first visit.
 *
 * The text is duplicated and the track slides exactly half its width, so the
 * second copy is where the first was at the moment it resets — the loop has no
 * seam. Motion is slow on purpose; this is a notice, not an attention-grab, and
 * it stops entirely for anyone who has asked for reduced motion.
 */
const NOTICE =
  "Order before 12 PM CT for same-day shipping. Orders placed after 12 PM CT will ship the next business day.";

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
      <div className="announcement-track" style={{ display: "inline-flex" }}>
        {/* aria-hidden on both: the label above already reads it once, and a
            screen reader should not hear a notice twice because it scrolls. */}
        <span aria-hidden="true" style={{ paddingRight: "64px" }}>{NOTICE}</span>
        <span aria-hidden="true" style={{ paddingRight: "64px" }}>{NOTICE}</span>
      </div>
    </div>
  );
}

export default AnnouncementBarInner;
export { AnnouncementBarInner as AnnouncementBar, NOTICE as SHIPPING_CUTOFF_NOTICE };
