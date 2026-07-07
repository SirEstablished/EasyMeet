import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SupabaseClient } from "@supabase/supabase-js";

export interface AdminDisputeRow {
  id: string;
  order_id: string | null;
  customer_id: string;
  provider_id: string;
  conversation_id: string | null;
  amount: number;
  status: string;
  dispute_reason: string | null;
  dispute_evidence: string[] | null;
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
    const db = context.supabase as SupabaseClient;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as SupabaseClient;

    const { data: roleData, error: roleError } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!roleData) throw new Error("Unauthorized: admins only");

    const { data: escrowRows, error } = await adminDb
      .from("escrow")
      .select("*")
      .eq("status", "disputed")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (escrowRows as any[]) ?? [];
    if (rows.length === 0) return [];

    const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
    const userIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.customer_id, r.professional_id ?? r.provider_id])
          .filter(Boolean),
      ),
    );

    let ordersData: any[] = [];
    let profilesData: any[] = [];

    if (orderIds.length > 0) {
      const { data, error: oErr } = await adminDb
        .from("orders")
        .select("id, service_title, amount")
        .in("id", orderIds);
      if (oErr) throw oErr;
      ordersData = (data as any[]) ?? [];
    }

    if (userIds.length > 0) {
      const { data, error: pErr } = await adminDb
        .from("profiles")
        .select("id, full_name, username, email")
        .in("id", userIds);
      if (pErr) throw pErr;
      profilesData = (data as any[]) ?? [];
    }

    const oMap = new Map(ordersData.map((o) => [o.id, o]));
    const pMap = new Map(profilesData.map((p) => [p.id, p]));
    const nameOf = (id: string) => {
      const p = pMap.get(id);
      return p?.full_name || p?.username || p?.email || "Unknown";
    };

    return rows.map((r) => {
      const o = oMap.get(r.order_id);
      const providerId = r.professional_id ?? r.provider_id;
      const amount = Number(
        o?.amount ?? r.amount_ngn ?? r.amount ?? 0,
      );
      return {
        id: r.id,
        order_id: r.order_id,
        customer_id: r.customer_id,
        provider_id: providerId,
        conversation_id: r.conversation_id ?? null,
        amount,
        status: r.status,
        dispute_reason: r.dispute_reason,
        dispute_evidence: Array.isArray(r.dispute_evidence) ? r.dispute_evidence : null,
        created_at: r.created_at,
        payment_ref: r.payment_ref ?? null,
        paystack_reference: r.payment_ref ?? r.paystack_reference ?? null,
        service_title: o?.service_title ?? "Order",
        order_amount: amount,
        customer_name: nameOf(r.customer_id),
        provider_name: providerId ? nameOf(providerId) : "Unknown",
      };
    });
  },
);
