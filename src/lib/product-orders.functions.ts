import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  productId: z.string().uuid(),
  reference: z
    .string()
    .min(6)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export interface RecordResult {
  ok: boolean;
  orderId?: string;
  message?: string;
}

/**
 * Verifies a Paystack transaction and inserts a completed product order.
 * Uses supabaseAdmin to bypass the buyer-side insert guards which force
 * payment_status to 'pending'.
 */
export const recordProductOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<RecordResult> => {
    const { userId, supabase } = context;

    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, seller_id, title, price, stock_count, product_type, is_active")
      .eq("id", data.productId)
      .maybeSingle();
    if (prodErr || !product) return { ok: false, message: "Product not found" };
    if (!product.is_active) return { ok: false, message: "Product unavailable" };
    if (product.seller_id === userId) return { ok: false, message: "Cannot buy your own product" };

    const price = Number(product.price ?? 0);
    if (price <= 0) return { ok: false, message: "Invalid product price" };

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false, message: "Server not configured" };

    let res: Response;
    try {
      res = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
    } catch {
      return { ok: false, message: "Verification unavailable" };
    }
    if (!res.ok) return { ok: false, message: "Verification failed" };
    const json = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string };
    };
    const tx = json?.data;
    if (!json?.status || !tx || tx.status !== "success") {
      return { ok: false, message: "Payment not successful" };
    }
    if (tx.currency && tx.currency !== "NGN") return { ok: false, message: "Wrong currency" };
    const paidKobo = typeof tx.amount === "number" ? tx.amount : 0;
    if (paidKobo < Math.round(price * 100)) return { ok: false, message: "Amount mismatch" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotency: if the reference is already recorded, return that order.
    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("payment_ref", data.reference)
      .maybeSingle();
    if (existing?.id) return { ok: true, orderId: existing.id };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: userId,
        provider_id: product.seller_id,
        product_id: product.id,
        service_title: product.title,
        amount: price,
        currency: "NGN",
        kind: "product",
        payment_ref: data.reference,
        payment_status: "paid",
        status: "completed",
      })
      .select("id")
      .single();
    if (insErr || !inserted) return { ok: false, message: insErr?.message || "Could not save order" };

    // Decrement stock for physical products (best-effort)
    if (product.product_type === "physical" && typeof product.stock_count === "number") {
      await supabaseAdmin
        .from("products")
        .update({ stock_count: Math.max(0, product.stock_count - 1) })
        .eq("id", product.id);
    }

    return { ok: true, orderId: inserted.id };
  });