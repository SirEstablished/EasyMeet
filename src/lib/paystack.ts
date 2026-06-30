const SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";
export const PAYSTACK_PUBLIC_KEY = "pk_test_3a48db3a209941e7c355296cc906ee620d1825e8";

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).PaystackPop) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Failed to load Paystack"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface PaystackArgs {
  email: string;
  amountNgn: number;
  metadata?: Record<string, unknown>;
  reference?: string;
}

export interface PaystackResult {
  reference: string;
  status?: string;
  trans?: string;
  transaction?: string;
}

/**
 * Open the Paystack inline popup and resolve with the result.
 * Rejects if user closes the popup without paying.
 */
export async function payWithPaystack(args: PaystackArgs): Promise<PaystackResult> {
  await loadScript();
  return new Promise<PaystackResult>((resolve, reject) => {
    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) return reject(new Error("Paystack not loaded"));
    let paid = false;
    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: args.email,
      amount: Math.round(args.amountNgn * 100), // kobo
      currency: "NGN",
      ref: args.reference || `em_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      metadata: args.metadata ?? {},
      callback: (response: PaystackResult) => {
        console.log("[paystack] callback fired", response);
        paid = true;
        resolve(response);
      },
      onClose: () => {
        console.log("[paystack] onClose fired, paid=", paid);
        // Defer so a callback firing right after close still wins
        setTimeout(() => {
          if (!paid) reject(new Error("Payment cancelled"));
        }, 400);
      },
    });
    handler.openIframe();
  });
}