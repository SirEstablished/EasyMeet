// Flutterwave inline checkout (v3). Only the PUBLIC key is used here.
// Secret / encryption / webhook keys never touch client code.
const SCRIPT_SRC = "https://checkout.flutterwave.com/v3.js";

export const FLUTTERWAVE_PUBLIC_KEY =
  (import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY as string | undefined) ||
  "FLWPUBK_TEST-32c06e65af5a8824826cb4fa2a5f126e-X";

if (typeof window !== "undefined") {
  // Masked diagnostic — never log the full key.
  console.log(
    "[flw] public key:",
    FLUTTERWAVE_PUBLIC_KEY
      ? `${FLUTTERWAVE_PUBLIC_KEY.slice(0, 10)}… (loaded)`
      : "MISSING (VITE_FLUTTERWAVE_PUBLIC_KEY not set)",
  );
}

export function isPaymentConfigured() {
  return Boolean(FLUTTERWAVE_PUBLIC_KEY);
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).FlutterwaveCheckout) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Could not load the payment window — check your connection"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Unique transaction reference: {flow}_{userId}_{timestamp} */
export function generateTransactionRef(flow: string, userId: string): string {
  const safeUser = String(userId || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `${flow}_${safeUser}_${Date.now()}`;
}

export interface FlutterwaveArgs {
  email: string;
  name?: string;
  phone?: string;
  amountNgn: number;
  /** Flow prefix used to build tx_ref, e.g. "escrow", "shop", "boost". */
  flow: string;
  userId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  txRef?: string;
}

export interface FlutterwaveResult {
  /** tx_ref — stored as payment_ref throughout the app */
  reference: string;
  /** Flutterwave transaction id, used for server-side verification */
  transactionId: string;
  status?: string;
}

/**
 * Open the Flutterwave modal and resolve once the customer pays.
 * Rejects with "Payment cancelled" when the modal is closed unpaid.
 */
export async function payWithFlutterwave(args: FlutterwaveArgs): Promise<FlutterwaveResult> {
  if (!FLUTTERWAVE_PUBLIC_KEY) {
    console.error("[flw] payment aborted: VITE_FLUTTERWAVE_PUBLIC_KEY is not set");
    throw new Error("Payment not configured");
  }
  await loadScript();
  return new Promise<FlutterwaveResult>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkout = (window as any).FlutterwaveCheckout;
    if (!checkout)
      return reject(new Error("Could not load the payment window — check your connection"));
    const txRef = args.txRef || generateTransactionRef(args.flow, args.userId);
    let paid = false;
    checkout({
      public_key: FLUTTERWAVE_PUBLIC_KEY,
      tx_ref: txRef,
      amount: Math.round(args.amountNgn * 100) / 100,
      currency: "NGN",
      payment_options: "card,ussd,banktransfer",
      customer: {
        email: args.email,
        name: args.name ?? "",
        phone_number: args.phone ?? "",
      },
      meta: args.metadata ?? {},
      customizations: {
        title: "EasyMeet",
        description: args.description ?? "EasyMeet payment",
        logo: "https://easymeet.com.ng/logo.png",
      },
      callback: (response: { status?: string; transaction_id?: number | string; tx_ref?: string }) => {
        paid = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).FlutterwaveCheckout?.close?.();
        closePaymentModal();
        if (response?.status === "successful" || response?.status === "completed") {
          resolve({
            reference: response.tx_ref || txRef,
            transactionId: String(response.transaction_id ?? ""),
            status: response.status,
          });
        } else {
          reject(new Error("Payment was not successful"));
        }
      },
      onclose: () => {
        setTimeout(() => {
          if (!paid) reject(new Error("Payment cancelled"));
        }, 400);
      },
    });
  });
}

/** Close any open Flutterwave modal. */
export function closePaymentModal() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("iframe[name='checkout']").forEach((el) => el.remove());
  document.body.style.removeProperty("overflow");
}