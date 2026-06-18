import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  reference: z
    .string()
    .min(6)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  expectedAmountNgn: z.number().positive().max(10_000_000),
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
  .middleware([requireSupabaseAuth])
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

const RefundSchema = z.object({
  reference: z
    .string()
    .min(6)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  amountNgn: z.number().positive().max(10_000_000).optional(),
});

export interface RefundResult {
  ok: boolean;
  message?: string;
  refundAmountNgn?: number;
  status?: string;
}

/**
 * Server-side Paystack refund. Initiates a refund for the given reference.
 * If amountNgn is omitted the entire transaction is refunded.
 */
export const refundPaystackTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RefundSchema.parse(data))
  .handler(async ({ data, context }): Promise<RefundResult> => {
    // Authorize: only admins OR the customer who owns the escrow for this payment ref
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      const { data: escrowRow } = await supabase
        .from("escrow")
        .select("customer_id")
        .eq("payment_ref", data.reference)
        .maybeSingle();
      if (!escrowRow || escrowRow.customer_id !== userId) {
        return { ok: false, message: "Not authorized to refund this payment" };
      }
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false, message: "Server not configured" };
    const body: Record<string, unknown> = { transaction: data.reference };
    if (data.amountNgn) body.amount = Math.round(data.amountNgn * 100);
    let res: Response;
    try {
      res = await fetch("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error("Paystack refund network error", e);
      return { ok: false, message: "Refund unavailable" };
    }
    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { amount?: number; status?: string };
    } | null;
    if (!res.ok || !json?.status) {
      return { ok: false, message: json?.message || `Refund failed (${res.status})` };
    }
    return {
      ok: true,
      refundAmountNgn: json.data?.amount ? json.data.amount / 100 : undefined,
      status: json.data?.status,
    };
  });
