import { supabase } from "@/integrations/supabase/client";

export const ESCROW_COMMISSION_PCT = 0.03;

export interface ServiceAgreement {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  job_title: string;
  job_description: string | null;
  price: number;
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
  order_id: string | null;
  kind: "service" | "product";
  customer_id: string;
  professional_id: string;
  conversation_id: string | null;
  agreement_id: string | null;
  product_id: string | null;
  quantity: number | null;
  title: string;
  amount_ngn: number;
  labor_amount?: number | null;
  materials_amount?: number | null;
  commission_amount: number;
  payout_amount: number;
  status: EscrowStatus;
  payment_ref: string | null;
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

type EscrowJoinedOrderRow = {
  id?: string;
  customer_id?: string;
  provider_id?: string;
  service_title?: string;
  amount?: number;
  payment_ref?: string | null;
  created_at?: string;
  escrow?: Partial<EscrowOrder> | Partial<EscrowOrder>[] | null;
};

export function escrowFromJoinedOrder(row: unknown): EscrowOrder | null {
  const orderRow = row as EscrowJoinedOrderRow | null;
  const escrowRow = Array.isArray(orderRow?.escrow) ? orderRow.escrow[0] : orderRow?.escrow;
  if (!orderRow || !escrowRow?.id) return null;

  return {
    ...escrowRow,
    order_id: escrowRow.order_id ?? orderRow.id ?? null,
    customer_id: escrowRow.customer_id ?? orderRow.customer_id ?? "",
    professional_id: escrowRow.professional_id ?? orderRow.provider_id ?? "",
    title: escrowRow.title ?? orderRow.service_title ?? "Order",
    amount_ngn: Number(escrowRow.amount_ngn ?? orderRow.amount ?? 0),
    payment_ref: escrowRow.payment_ref ?? orderRow.payment_ref ?? null,
    created_at: escrowRow.created_at ?? orderRow.created_at ?? "",
  } as EscrowOrder;
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