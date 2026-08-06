import { createFileRoute } from "@tanstack/react-router";

/**
 * Flutterwave webhook receiver. Verifies the `verif-hash` header against
 * FLUTTERWAVE_WEBHOOK_SECRET (server-only) before touching any data.
 */
export const Route = createFileRoute("/api/public/flutterwave-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["FLUTTERWAVE_WEBHOOK_SECRET"];
        const signature = request.headers.get("verif-hash");
        if (!secret || !signature || signature !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const payload = (await request.json().catch(() => null)) as {
          event?: string;
          data?: { status?: string; tx_ref?: string; id?: number; amount?: number };
        } | null;

        const tx = payload?.data;
        if (payload?.event !== "charge.completed" || tx?.status !== "successful" || !tx.tx_ref) {
          return new Response("OK", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = supabaseAdmin as any;
        const txRef = tx.tx_ref;

        try {
          if (txRef.startsWith("escrow_")) {
            await admin
              .from("escrow")
              .update({ status: "holding", paid_at: new Date().toISOString() })
              .eq("payment_ref", txRef)
              .eq("status", "pending_payment");
            await admin
              .from("orders")
              .update({ payment_status: "paid" })
              .eq("payment_ref", txRef)
              .neq("payment_status", "paid");
          } else if (txRef.startsWith("shop_") || txRef.startsWith("product_")) {
            await admin
              .from("orders")
              .update({ payment_status: "paid", status: "confirmed" })
              .eq("payment_ref", txRef)
              .neq("payment_status", "paid");
          }
        } catch (e) {
          console.error("[flutterwave-webhook] update failed", e);
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
});