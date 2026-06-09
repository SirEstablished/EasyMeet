import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  reference: z.string().min(6).max(128).regex(/^[a-zA-Z0-9_\-]+$/),
  expectedAmountNgn: z.number().int().positive().max(10_000_000),
});

export interface VerifyResult {
  ok: boolean;
  reference: string;
  amountNgn?: number;
  message?: string;
}

/**
 * Server-side Paystack transaction verification. Calls the Paystack Verify
 * Transaction API with the secret key and confirms status === "success" and
 * amount matches the expected NGN amount.
 */
export const verifyPaystackTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<VerifyResult> => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return { ok: false, reference: data.reference, message: "Server not configured" };
    }

    let res: Response;
    try {
      res = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
    } catch (e) {
      console.error("Paystack verify network error", e);
      return { ok: false, reference: data.reference, message: "Verification unavailable" };
    }

    if (!res.ok) {
      console.error("Paystack verify HTTP", res.status, await res.text().catch(() => ""));
      return { ok: false, reference: data.reference, message: "Verification failed" };
    }

    const json = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string; reference?: string };
    };

    const tx = json?.data;
    if (!json?.status || !tx || tx.status !== "success") {
      return { ok: false, reference: data.reference, message: "Payment not successful" };
    }
    if (tx.currency && tx.currency !== "NGN") {
      return { ok: false, reference: data.reference, message: "Wrong currency" };
    }
    const paidKobo = typeof tx.amount === "number" ? tx.amount : 0;
    const expectedKobo = Math.round(data.expectedAmountNgn * 100);
    if (paidKobo < expectedKobo) {
      return { ok: false, reference: data.reference, message: "Amount mismatch" };
    }

    return { ok: true, reference: tx.reference || data.reference, amountNgn: paidKobo / 100 };
  });