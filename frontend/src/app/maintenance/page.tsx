/**
 * What a customer sees while the shop is closed.
 *
 * Deliberately plain: no navigation to pages that are not there, no cart, no
 * search. It says what is happening, roughly how long, and how to reach a
 * person — which is all anyone arriving at a closed shop actually wants.
 */
export const metadata = {
  title: "Back shortly — AF Apparels",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: "#F8F8F6",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: "520px", textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Af-apparel logo.png"
          alt="AF Apparels"
          style={{ height: "64px", margin: "0 auto 32px", display: "block" }}
        />

        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: "34px",
            fontWeight: 600,
            color: "#1A1A1A",
            margin: "0 0 14px",
            lineHeight: 1.2,
          }}
        >
          We&rsquo;ll be back shortly
        </h1>

        <p style={{ fontSize: "15px", color: "#5A5A5A", lineHeight: 1.7, margin: "0 0 28px" }}>
          The store is closed for a short while for scheduled maintenance.
          Ordering will be back on very soon — thank you for bearing with us.
        </p>

        <div
          style={{
            background: "#fff",
            border: "1px solid #E2E2DE",
            borderRadius: "10px",
            padding: "22px 24px",
            textAlign: "left",
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A7880", margin: "0 0 12px" }}>
            Need something in the meantime?
          </p>
          <p style={{ fontSize: "14px", color: "#3A3A3A", lineHeight: 1.7, margin: 0 }}>
            Email{" "}
            <a href="mailto:info@afblanks.com" style={{ color: "#1C3557", fontWeight: 600 }}>
              info@afblanks.com
            </a>
            <br />
            or call{" "}
            <a href="tel:+12142727213" style={{ color: "#1C3557", fontWeight: 600 }}>
              214-272-7213
            </a>
          </p>
          <p style={{ fontSize: "13px", color: "#7A7880", lineHeight: 1.6, margin: "12px 0 0" }}>
            Orders already placed are unaffected and are being processed as usual.
          </p>
        </div>
      </div>
    </div>
  );
}
