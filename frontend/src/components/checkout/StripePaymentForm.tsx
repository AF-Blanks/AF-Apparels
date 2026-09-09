"use client";

/**
 * Taking a card or a bank account through Stripe.
 *
 * Sits beside QBPaymentForm rather than replacing it. Which one the checkout
 * page renders is decided by /api/v1/stripe/config — until that says Stripe is
 * active, nothing here is mounted and nothing changes for anyone.
 *
 * The card and account numbers are typed into an iframe Stripe serves, not into
 * this page. What comes back is an id standing in for them; the numbers
 * themselves never reach our server, which is the whole reason for collecting
 * them this way.
 *
 * Two things this form is careful about:
 *
 * **Pressing Pay twice.** The button disables on the first press, but a button
 * is not a guarantee — a slow network invites a second click before the first
 * has visibly done anything, and a refresh resends the whole thing. So every
 * submit carries an attempt key, made once when this form mounts and kept for
 * as long as it is open. The server uses it to recognise the second arrival as
 * the same press and hand back the first one's order.
 *
 * **A bank debit is not a payment yet.** It takes days, and the form says so
 * plainly rather than letting someone leave believing they have paid.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { apiClient } from "@/lib/api-client";

export interface StripeResult {
  /** The payment method Stripe made from what the customer typed. */
  paymentMethodId: string;
  /** "card" or "us_bank_account" — decides which server path takes the money. */
  methodType: string;
  /** Sent with every submit of this attempt so a repeat is recognised as one. */
  attemptKey: string;
}

interface Props {
  /** Total in dollars — shown on the button so nobody pays a number they cannot see. */
  amount: number;
  /** Handed the collected payment method; the parent places the order with it. */
  onReady: (result: StripeResult) => void | Promise<void>;
  /** True while the parent is placing the order, so the button stays disabled. */
  placing?: boolean;
  /** Offer one method only, when the page has already chosen for the customer. */
  only?: "card" | "us_bank_account";
  /** Told as soon as the customer switches tab inside this form, before they pay.
   *  The convenience fee is 3% on a card and nothing on a bank transfer, and the
   *  order summary shows it while they are still deciding — so the page has to
   *  hear about the choice when it is made, not when it is submitted. */
  onMethodChange?: (methodType: string) => void;
  disabled?: boolean;
}

/** One key per open form. Regenerated only on a fresh mount — a genuinely new
 *  attempt — so every retry of this attempt carries the same one. */
function newAttemptKey(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `chk_${rand}`;
}

export default function StripePaymentForm(props: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cfg = await apiClient.get<{
          active: boolean;
          publishable_key: string | null;
        }>("/api/v1/stripe/config");

        if (!cfg.active || !cfg.publishable_key) {
          if (!cancelled) setBootError("Card payments are not available right now.");
          return;
        }

        if (cancelled) return;
        setStripePromise(loadStripe(cfg.publishable_key));
      } catch (e) {
        if (!cancelled) {
          setBootError(
            e instanceof Error ? e.message : "Could not start the payment form."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (bootError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {bootError} Please call us on{" "}
        <a href="tel:2142727213" className="font-semibold underline">
          214-272-7213
        </a>{" "}
        and we will take the order.
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="rounded-md border border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
        Loading payment form…
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        // Deferred mode, not a client secret.
        //
        // The charge is raised server-side against a total the server works out
        // itself — a browser that could name its own amount is a browser that
        // can pay a dollar for a thousand. That means this form's job is only to
        // turn what the customer typed into a payment method id, which is what
        // `createPaymentMethod` does — and Stripe only permits that when the
        // Elements instance was created this way. Handing it a SetupIntent's
        // client secret instead is what produced "your elements instance must be
        // created with paymentMethodCreation: 'manual'".
        //
        // The amount here is for display and for deciding which methods to
        // offer. It is never what gets charged.
        mode: "payment",
        currency: "usd",
        amount: Math.max(50, Math.round((props.amount || 0) * 100)),
        paymentMethodCreation: "manual",
        // Only the two we take and have tested end to end. Left to itself the
        // element also offers whatever else the Stripe account has switched on —
        // Cash App, Amazon Pay, Klarna — none of which the order flow behind
        // this understands.
        paymentMethodTypes: props.only ? [props.only] : ["card", "us_bank_account"],
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#1B3A5C", borderRadius: "6px" },
        },
      }}
    >
      <Inner {...props} />
    </Elements>
  );
}

function Inner({ amount, onReady, placing = false, disabled = false, only, onMethodChange }: Props) {
  const stripe = useStripe();
  const elements = useElements();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<string>(only ?? "card");

  // Made once for the life of this form. Every submit — first press, second
  // press, a retry after a decline — carries this same value, which is what
  // lets the server tell one press apart from two.
  const attemptKey = useMemo(newAttemptKey, []);

  // A second submit can be in flight before React has re-rendered the disabled
  // button. This is checked and set in the same tick, so it cannot be raced.
  const inFlight = useRef(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (inFlight.current || busy || placing || disabled) return;
      if (!stripe || !elements) return;

      inFlight.current = true;
      setBusy(true);
      setError(null);

      try {
        // Everything the customer typed, checked by Stripe before we go further
        // — an obviously wrong card number should not cost a round trip.
        const { error: submitError } = await elements.submit();
        if (submitError) {
          setError(submitError.message ?? "Please check the details above.");
          return;
        }

        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          elements,
        });

        if (pmError || !paymentMethod) {
          setError(
            pmError?.message ??
              "We could not read those payment details. Please check and try again."
          );
          return;
        }

        setMethod(paymentMethod.type);
        await onReady({
          paymentMethodId: paymentMethod.id,
          methodType: paymentMethod.type,
          attemptKey,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong taking payment. Please try again."
        );
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
    },
    [stripe, elements, busy, placing, disabled, onReady, attemptKey]
  );

  const working = busy || placing;

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement
        options={{ layout: "tabs" }}
        onChange={(e) => {
          const t = e.value?.type ?? "card";
          setMethod(t);
          onMethodChange?.(t);
        }}
      />

      {/* A bank debit clears over days. Saying so here is the difference between
          a customer who waits and a customer who rings up asking why their
          order has not shipped. */}
      {method === "us_bank_account" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Bank transfers take 3–5 business days to clear.</strong> Your
          order is placed straight away and we will start on it; the payment
          shows as outstanding until the transfer completes. By continuing you
          authorise AF Apparels to debit the account above for this order.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || working || disabled}
        className="w-full rounded-md bg-[#1B3A5C] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {working
          ? "Placing your order…"
          : method === "us_bank_account"
            ? `Authorise $${amount.toFixed(2)} bank transfer`
            : `Pay $${amount.toFixed(2)}`}
      </button>

      <p className="text-center text-xs text-gray-500">
        Payments processed by Stripe. Your card details are encrypted and never
        stored on AF Apparels servers.
      </p>
    </form>
  );
}
