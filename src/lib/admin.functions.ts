import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminDisputeRow {
  id: string;
  order_id: string | null;
  customer_id: string;
  provider_id: string;
  amount: number;
  status: string;
  dispute_reason: string | null;
  dispute_evidence: unknown;
  created_at: string;
  payment_ref: string | null;
  paystack_reference: string | null;
  service_title: string;
  order_amount: number;
  customer_name: string;
  provider_name: string;
}

export const getDisputedEscrows = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(
  async ({ context }): Promise<AdminDisputeRow[]> => {
    // Verify the caller is an admin using the user's own client (RLS applies).
    const { data: roleData, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!roleData) throw new Error("Unauthorized: admins only");

    // Use the admin client so the full set of disputed escrow records is visible
    // regardless of any party-scoped RLS policies on the escrow table.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: escrowRows, error } = await supabaseAdmin
      .from("escrow")
      .select("*")
      .eq("status", "disputed")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (escrowRows as any[]) ?? [];
    if (rows.length === 0) return [];

    const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
    const userIds = Array.from(
      new Set(rows.flatMap((r) => [r.customer_id, r.provider_id]).filter(Boolean)),
    );

    const [ordersRes, profilesRes] = await Promise.all([
      orderIds.length
        ? supabaseAdmin.from("orders").select("id, service_title, amount").in("id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, username, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const oMap = new Map(((ordersRes.data as any[]) ?? []).map((o) => [o.id, o]));
    const pMap = new Map(((profilesRes.data as any[]) ?? []).map((p) => [p.id, p]));
    const nameOf = (id: string) => {
      const p = pMap.get(id);
      return p?.full_name || p?.username || p?.email || "Unknown";
    };

    return rows.map((r) => {
      const o = oMap.get(r.order_id);
      return {
        id: r.id,
        order_id: r.order_id,
        customer_id: r.customer_id,
        provider_id: r.provider_id,
        amount: Number(r.amount_ngn ?? r.amount ?? o?.amount ?? 0),
        status: r.status,
        dispute_reason: r.dispute_reason,
        dispute_evidence: r.dispute_evidence,
        created_at: r.created_at,
        payment_ref: r.payment_ref ?? null,
        paystack_reference: r.payment_ref ?? r.paystack_reference ?? null,
        service_title: o?.service_title ?? "Order",
        order_amount: Number(o?.amount ?? r.amount_ngn ?? r.amount ?? 0),
        customer_name: nameOf(r.customer_id),
        provider_name: nameOf(r.provider_id),
      };
    });
  },
);
