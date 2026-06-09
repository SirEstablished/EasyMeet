import { supabase } from "@/integrations/supabase/client";

export const ESCROW_COMMISSION_PCT = 0.03;

export interface ServiceAgreement {
  id: string;
  conversation_id: string;
  professional_id: string;
  customer_id: string;
  title: string;
  description: string | null;
  price_ngn: number;
  terms: string | null;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  accepted_at: string | null;
  created_at: string;
}

export type EscrowStatus =
  | "pending_payment"
  | "holding"
  | "in_progress"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled";

export interface EscrowOrder {
  id: string;
  kind: "service" | "product";
  customer_id: string;
  professional_id: string;
  conversation_id: string | null;
  agreement_id: string | null;
  product_id: string | null;
  quantity: number | null;
  title: string;
  amount_ngn: number;
  commission_amount: number;
  payout_amount: number;
  status: EscrowStatus;
  paystack_reference: string | null;
  paid_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  refund_status: "processing" | "succeeded" | "failed" | null;
  refund_amount: number | null;
  created_at: string;
}

export interface EscrowDispute {
  id: string;
  order_id: string;
  opened_by: string;
  reason: string;
  status: "open" | "resolved_release" | "resolved_refund";
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function computeCommission(amount: number) {
  const commission = Math.round(amount * ESCROW_COMMISSION_PCT * 100) / 100;
  const payout = Math.round((amount - commission) * 100) / 100;
  return { commission, payout };
}

export function escrowStage(o: EscrowOrder | null, a: ServiceAgreement | null): number {
  if (!o && (!a || a.status === "pending")) return a ? 2 : 1;
  if (!o && a?.status === "accepted") return 3;
  if (!o) return 1;
  if (o.status === "pending_payment") return 3;
  if (o.status === "holding" || o.status === "in_progress") return 4;
  if (o.status === "completed" || o.status === "refunded") return 6;
  if (o.status === "disputed") return 5;
  return 1;
}

export async function snapshotChatToEvidence(
  disputeId: string,
  conversationId: string,
  uploadedBy: string,
) {
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  await supabase.from("escrow_dispute_evidence").insert({
    dispute_id: disputeId,
    uploaded_by: uploadedBy,
    note: "Chat history snapshot",
    is_chat_snapshot: true,
    payload: { messages: data ?? [] },
  });
}