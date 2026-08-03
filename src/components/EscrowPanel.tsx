import { useEffect, useRef, useState } from "react";
import { supabase, formatNgn, type Profile } from "@/integrations/supabase/client";
import {
  type EscrowOrder,
  type ServiceAgreement,
  escrowStage,
  snapshotChatToEvidence,
} from "@/lib/escrow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Shield,
  FileText,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Sparkles,
  XCircle,
  Wallet,
  // Percent, User removed with the in-panel completion summary.
  Handshake,
  ArrowLeft,
  X,
  Package,
  Wrench,
  Truck,
  Briefcase,
} from "lucide-react";
import { payWithFlutterwave } from "@/lib/flutterwave";
import { verifyFlutterwavePayment } from "@/lib/flutterwave.functions";
import { computeGatewayFee } from "@/lib/fees";
import { detectEscrowRoles, suggestAgreement } from "@/lib/escrow-ai.functions";
import { encodeCard } from "@/components/EscrowChatCards";

const AGREEMENT_TYPES = [
  { value: "service", label: "Service Agreement" },
  { value: "product_sale", label: "Product Sale Agreement" },
  { value: "material_labor", label: "Material + Labor Agreement" },
  { value: "delivery", label: "Delivery Agreement" },
] as const;

// Fee math — commission and the gateway (Flutterwave) fee are always
// calculated separately internally, then shown to the customer as a single
// "EasyMeet Protection Fee" line.
// - commission: comes from the tiered `calculate_commission` RPC on the
//   labor/service amount ONLY. Never includes materials, gateway fee, or
//   contingency. Passed in from the caller.
// - gateway fee: 1.4% + ₦100 (max ₦2,000) on the amount the customer is
//   actually charged BEFORE the gateway fee itself is added. It never
//   feeds back into commission.
export function computeAgreementFees(
  materials: number,
  labor: number,
  contingency: number,
  commission: number = 0,
) {
  const m = Math.max(0, Number(materials) || 0);
  const l = Math.max(0, Number(labor) || 0);
  const c = Math.max(0, Number(contingency) || 0);
  const comm = Math.max(0, Number(commission) || 0);
  const subtotal = m + l + c;
  const preFeeTotal = subtotal + comm;
  const paystackFee = preFeeTotal > 0 ? computeGatewayFee(preFeeTotal) : 0;
  const totalPaid = preFeeTotal + paystackFee;
  // Materials pay 0 commission; only labor/service is commissionable.
  const professionalReceives = Math.max(0, m + l - comm);
  return {
    materials: m,
    labor: l,
    contingency: c,
    subtotal,
    commission: comm,
    paystackFee,
    totalPaid,
    professionalReceives,
  };
}

interface Props {
  conversationId: string;
  meId: string;
  myEmail: string;
  other: Profile | null | undefined;
  meRole: string | undefined;
  refreshKey?: number;
}

const STAGES = [
  "Negotiating",
  "Agreement Sent",
  "Agreement Accepted",
  "Paid into Escrow",
  "Mark as Complete",
  "Released",
];

type AgreementRow = ServiceAgreement & {
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
};

function parseTime(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function latestTime(row: Record<string, unknown> | null | undefined, fields: string[]) {
  if (!row) return 0;
  return Math.max(...fields.map((field) => parseTime(row[field])));
}

function escrowFromLatestRow(row: Record<string, unknown> | null): EscrowOrder | null {
  if (!row?.id) return null;

  const status = (row.status as EscrowOrder["status"] | undefined) ?? "pending_payment";
  const stage =
    (row.stage as EscrowOrder["stage"] | undefined) ??
    (status === "holding" || status === "in_progress"
      ? "work_in_progress"
      : status === "released" || status === "completed"
        ? "completed"
        : status === "cancelled"
          ? "cancelled"
          : status === "disputed"
            ? "disputed"
            : status === "refunded"
              ? "refunded"
              : "pending_payment");

  const amount = Number(row.amount_ngn ?? row.amount ?? 0);
  const commission = Number(row.commission_amount ?? 0);

  return {
    ...(row as unknown as EscrowOrder),
    id: row.id as string,
    order_id: (row.order_id as string | null) ?? null,
    kind: ((row.kind as EscrowOrder["kind"] | undefined) ?? "service") as EscrowOrder["kind"],
    customer_id: (row.customer_id as string | undefined) ?? "",
    professional_id:
      (row.professional_id as string | undefined) ?? (row.provider_id as string | undefined) ?? "",
    conversation_id: (row.conversation_id as string | null) ?? null,
    agreement_id: (row.agreement_id as string | null) ?? null,
    product_id: (row.product_id as string | null) ?? null,
    quantity: (row.quantity as number | null) ?? null,
    title:
      (row.title as string | undefined) ?? (row.service_title as string | undefined) ?? "Order",
    amount_ngn: amount,
    commission_amount: commission,
    payout_amount: Number(row.payout_amount ?? amount - commission),
    status,
    stage,
    payment_ref: (row.payment_ref as string | null) ?? null,
    paystack_reference: (row.paystack_reference as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    released_at: (row.released_at as string | null) ?? null,
    refunded_at: (row.refunded_at as string | null) ?? null,
    refund_status: (row.refund_status as EscrowOrder["refund_status"]) ?? null,
    refund_amount: (row.refund_amount as number | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? "",
  };
}

export function EscrowPanel({
  conversationId,
  meId,
  myEmail,
  other,
  meRole,
  refreshKey = 0,
}: Props) {
  const [agreement, setAgreement] = useState<ServiceAgreement | null>(null);
  const [order, setOrder] = useState<EscrowOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  // iAmProvider: true = I send agreements, false = I accept. null = not resolved yet.
  const [iAmProvider, setIAmProvider] = useState<boolean | null>(null);
  const [askRoleOpen, setAskRoleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [payBreakdownOpen, setPayBreakdownOpen] = useState(false);
  const [payAgreement, setPayAgreement] = useState<ServiceAgreement | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [initialType, setInitialType] = useState<string>("service");
  const [editAgreementId, setEditAgreementId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  // True once the user explicitly starts a new deal in this conversation.
  const [dealFlowActive, setDealFlowActive] = useState(false);
  const [roleRefreshKey, setRoleRefreshKey] = useState(0);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const dismissedOrderIdRef = useRef<string | null>(null);
  const dismissedAgreementIdRef = useRef<string | null>(null);
  const latestEscrowStatusRef = useRef<EscrowOrder["status"] | null>(null);
  const latestEscrowIsCancelled = () => latestEscrowStatusRef.current === "cancelled";

  // Per-conversation, per-user keys for fix #1 (fresh-deal cutoff) and
  // fix #2 (sticky role choice so the popup never re-appears).
  const freshDealKey = `escrow_fresh_after_${conversationId}_${meId}`;
  const roleKey = `escrow_role_${conversationId}_${meId}`;
  // Shared (per-conversation) fresh-deal cutoff so BOTH parties skip a
  // stale cancelled escrow after either side clicks "Start New Deal".
  const sharedFreshDealKey = `new_deal_started_${conversationId}`;
  const readFreshAfter = (): number => {
    if (typeof window === "undefined") return 0;
    const a = window.localStorage.getItem(freshDealKey);
    const b = window.localStorage.getItem(sharedFreshDealKey);
    const na = a ? Date.parse(a) : 0;
    const nb = b ? Date.parse(b) : 0;
    return Math.max(Number.isFinite(na) ? na : 0, Number.isFinite(nb) ? nb : 0);
  };
  const readSavedRole = (): boolean | null => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(roleKey);
    if (v === "provider") return true;
    if (v === "buyer") return false;
    return null;
  };

  const load = async () => {
    try {
      const [{ data: ag, error: agError }, { data: latestEscrow, error: escrowError }] =
        await Promise.all([
          supabase
            .from("service_agreements")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("escrow")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (agError) throw new Error(agError.message);
      if (escrowError) throw new Error(escrowError.message);

      const agObj = (ag as AgreementRow) ?? null;
      const escrowRaw = latestEscrow as Record<string, unknown> | null;
      const odObj = escrowFromLatestRow(escrowRaw);
      const freshAfter = readFreshAfter();
      const agreementCreatedAt = parseTime(agObj?.created_at);
      const agreementUpdatedAt = Math.max(agreementCreatedAt, parseTime(agObj?.updated_at));
      const escrowCreatedAt = parseTime(odObj?.created_at);
      const escrowCancelledAt = latestTime(escrowRaw, ["cancelled_at", "updated_at", "created_at"]);
      const escrowReleasedAt = latestTime(escrowRaw, ["released_at", "updated_at", "created_at"]);
      const newestRecordAt = Math.max(
        agreementUpdatedAt,
        latestTime(escrowRaw, [
          "created_at",
          "updated_at",
          "cancelled_at",
          "released_at",
          "refunded_at",
        ]),
      );

      let nextAgreement: AgreementRow | null = null;
      let nextOrder: EscrowOrder | null = null;

      // A user-initiated new deal is the strongest signal. If it is newer
      // than every loaded record, every previous stage is stale.
      if (freshAfter > 0 && newestRecordAt > 0 && freshAfter >= newestRecordAt) {
        nextAgreement = null;
        nextOrder = null;
      } else if (
        odObj?.status === "cancelled" &&
        !(agObj && agreementCreatedAt > escrowCancelledAt)
      ) {
        // Cancelled escrow wins over an older accepted agreement, so refreshes
        // can never fall back to a previous deal's Pay into Escrow button.
        nextAgreement = agObj;
        nextOrder = odObj;
      } else if (
        (odObj?.status === "released" ||
          odObj?.status === "completed" ||
          odObj?.status === "refunded") &&
        !(agObj && agreementCreatedAt > escrowReleasedAt)
      ) {
        nextAgreement = agObj;
        nextOrder = odObj;
      } else if (odObj?.status === "holding" || odObj?.status === "in_progress") {
        nextAgreement = agObj;
        nextOrder = odObj;
      } else if (odObj?.status === "disputed" && !(agObj && agreementCreatedAt > escrowCreatedAt)) {
        nextAgreement = agObj;
        nextOrder = odObj;
      } else if (
        agObj?.status === "accepted" &&
        (!odObj || escrowCreatedAt < agreementCreatedAt || odObj.status === "pending_payment")
      ) {
        nextAgreement = agObj;
        nextOrder = null;
      } else if (agObj?.status === "pending") {
        nextAgreement = agObj;
        nextOrder = null;
      } else if (
        agObj?.status === "cancelled" &&
        (!odObj || escrowCreatedAt <= agreementCreatedAt)
      ) {
        nextAgreement = agObj;
        nextOrder = null;
      }

      latestEscrowStatusRef.current = nextOrder?.status ?? null;
      setLoadedConversationId(conversationId);

      if (nextOrder?.status === "cancelled") {
        setAskRoleOpen(false);
        setSendOpen(false);
        setDisputeOpen(false);
        setCompleteOpen(false);
        setCancelOpen(false);
        setShowSummary(false);
        setHidden(false);
        // A cancelled latest record is the source of truth. Ignore any
        // dismissed-ref filtering so the cancelled UI always renders
        // on page load for BOTH parties.
        dismissedOrderIdRef.current = null;
        dismissedAgreementIdRef.current = null;
        setAgreement(nextAgreement);
        setOrder(nextOrder);
        setLoading(false);
        return;
      }

      const visibleAgreement =
        nextAgreement && nextAgreement.id === dismissedAgreementIdRef.current
          ? null
          : nextAgreement;
      setAgreement(visibleAgreement);
      setOrder((prev) => {
        const next = nextOrder && nextOrder.id === dismissedOrderIdRef.current ? null : nextOrder;
        // Only keep an optimistic payment row before the database has returned
        // that same latest escrow. Never fall back to an older escrow record.
        if (!next && prev && paying) return prev;
        return next;
      });
    } catch (e) {
      console.error("EscrowPanel load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setLoadedConversationId(null);
    setDealFlowActive(false);
    // Fix #2: hydrate the saved role choice before load() runs so the
    // popup never re-appears for a conversation the user already answered.
    setIAmProvider(readSavedRole());
    load();
    const ch = supabase
      .channel(`escrow-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_agreements",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "escrow",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (refreshKey > 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Resolve who is the provider (seller) in this conversation.
  useEffect(() => {
    if (loading) return;
    if (loadedConversationId !== conversationId) return;
    if (!other) return;
    if (
      order?.status === "cancelled" ||
      latestEscrowIsCancelled() ||
      (!order && agreement?.status === "cancelled")
    ) {
      setAskRoleOpen(false);
      return;
    }
    // Fix #2: if the user already picked a role for this conversation, use
    // it and never show the popup again (until Start New Deal).
    const saved = readSavedRole();
    if (saved !== null) {
      setIAmProvider(saved);
      setAskRoleOpen(false);
      return;
    }
    // Never ask when a deal already exists (active or completed) for this
    // conversation — the roles are already fixed by the escrow record.
    if (order) {
      setIAmProvider(order.professional_id === meId);
      setAskRoleOpen(false);
      return;
    }
    // If we already have an agreement, the roles are fixed:
    // sender = provider (seller), receiver = buyer. This works for ANY
    // role combination (customer/professional/business in any direction)
    // and removes the need for AI/role-popup before payment.
    if (agreement) {
      if (agreement.sender_id === meId) setIAmProvider(true);
      else if (agreement.receiver_id === meId) setIAmProvider(false);
      setAskRoleOpen(false);
      return;
    }
    // No agreement yet — fall back to role hints for who can SEND an agreement.
    // Customers can NEVER be the service provider (sender of agreement).
    if (meRole === "customer") {
      setIAmProvider(false);
      return;
    }
    if (other.role === "customer") {
      setIAmProvider(true);
      return;
    }
    // Only ask when BOTH sides are non-customer roles.
    if (!meRole || !other.role) {
      setAskRoleOpen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("sender_id, body")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(60);
      if (cancelled) return;
      if (latestEscrowIsCancelled()) {
        setAskRoleOpen(false);
        return;
      }
      if (!msgs || msgs.length < 2) {
        setAskRoleOpen(true);
        return;
      }
      try {
        const result = await detectEscrowRoles({
          data: {
            messages: msgs.map((m) => ({
              sender_id: m.sender_id as string,
              body: (m.body as string) ?? "",
            })),
            meId,
            otherId: other.id,
          },
        });
        if (cancelled) return;
        if (latestEscrowIsCancelled()) {
          setAskRoleOpen(false);
          return;
        }
        if (result.providerId && result.confidence >= 0.6) {
          setIAmProvider(result.providerId === meId);
        } else {
          setAskRoleOpen(true);
        }
      } catch {
        if (!cancelled && !latestEscrowIsCancelled()) setAskRoleOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    agreement,
    conversationId,
    loadedConversationId,
    loading,
    meId,
    meRole,
    order?.status,
    other,
    roleRefreshKey,
  ]);

  // Stage 6 → show completion summary for 5s, then hide the panel entirely.
  useEffect(() => {
    if (!order) return;
    if (order.status !== "released" && order.status !== "completed") return;
    // Use released_at as the persistent reference so the summary doesn't
    // show again after a page refresh — if >30s elapsed, jump straight to
    // the "Start New Deal" button.
    const releasedAt = order.released_at ? new Date(order.released_at).getTime() : Date.now();
    const elapsed = Date.now() - releasedAt;
    if (elapsed > 30_000) {
      setShowSummary(false);
      setHidden(true);
      return;
    }
    setShowSummary(true);
    setHidden(false);
    const remaining = Math.max(0, 5000 - elapsed);
    const t = setTimeout(() => {
      setShowSummary(false);
      setHidden(true);
    }, remaining);
    return () => clearTimeout(t);
  }, [order?.id, order?.status]);

  const startNewDeal = () => {
    if (order) dismissedOrderIdRef.current = order.id;
    if (agreement) dismissedAgreementIdRef.current = agreement.id;
    // Fix #1: persist a cutoff so older escrow/agreement rows are ignored
    // even after a hard refresh, on every load() for this user+conversation.
    // Fix #2: clear the saved role so a new deal can re-detect it.
    if (typeof window !== "undefined") {
      const nowIso = new Date().toISOString();
      window.localStorage.setItem(freshDealKey, nowIso);
      window.localStorage.setItem(sharedFreshDealKey, nowIso);
      window.localStorage.removeItem(roleKey);
    }
    setOrder(null);
    setAgreement(null);
    setShowSummary(false);
    setHidden(false);
    setIAmProvider(null);
    latestEscrowStatusRef.current = null;
    setRoleRefreshKey((k) => k + 1);
  };

  // Listen for "Edit" clicks fired from agreement chat cards.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ agreement_id: string; conversation_id?: string }>;
      const detail = ce.detail;
      if (!detail?.agreement_id) return;
      if (detail.conversation_id && detail.conversation_id !== conversationId) return;
      setEditAgreementId(detail.agreement_id);
      setSendOpen(true);
    };
    window.addEventListener("escrow:edit-agreement", handler);
    return () => window.removeEventListener("escrow:edit-agreement", handler);
  }, [conversationId]);

  // Listen for "Start Protected Deal" clicks fired from the chat banner.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ conversation_id?: string }>;
      if (ce.detail?.conversation_id && ce.detail.conversation_id !== conversationId) return;
      if (meRole === "customer") return;
      startNewDeal();
      setDealFlowActive(true);
      setEditAgreementId(null);
      if (other && other.role !== "customer") {
        setAskRoleOpen(true);
        return;
      }
      setTypePickerOpen(true);
    };
    window.addEventListener("escrow:new-deal", handler);
    return () => window.removeEventListener("escrow:new-deal", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, meRole, other]);

  const openNewDealFlow = () => {
    // Full reset, then STEP 1 only: ask for the role when both sides are
    // non-customers and no role has been chosen yet. The agreement type
    // picker must never open at the same time as the role popup.
    startNewDeal();
    setDealFlowActive(true);
    setEditAgreementId(null);
    const bothNonCustomer = meRole !== "customer" && !!other && other.role !== "customer";
    if (bothNonCustomer) {
      setAskRoleOpen(true);
      return;
    }
    setTypePickerOpen(true);
  };
  const openSendFlow = () => {
    setEditAgreementId(null);
    setTypePickerOpen(true);
  };

  const cancelDeal = async (reason: string) => {
    const trimmed = reason.trim();
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      // Resolve cancelling party's display name for the auto chat message.
      let myName = "a participant";
      try {
        const { data: me } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", meId)
          .maybeSingle();
        const m = me as { full_name?: string | null; username?: string | null } | null;
        myName = m?.full_name || m?.username || myName;
      } catch {
        /* best-effort */
      }
      const cancelBody = `❌ This deal has been cancelled by ${myName}.`;
      if (order) {
        // Cancel escrow on both sides — status flips to 'cancelled' and
        // Realtime broadcasts to the other party instantly.
        const { error: escrowErr } = await supabase
          .from("escrow")
          .update({
            status: "cancelled",
            cancelled_by: meId,
            cancelled_at: nowIso,
            cancellation_reason: trimmed || null,
          })
          .eq("id", order.id);
        if (escrowErr) throw new Error(escrowErr.message);
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: meId,
          body: cancelBody,
        });
        setOrder({
          ...order,
          status: "cancelled",
          ...({
            cancelled_by: meId,
            cancelled_at: nowIso,
            cancellation_reason: trimmed || null,
          } as Partial<EscrowOrder>),
        });
        toast.success("Deal cancelled");
      } else {
        // Pre-payment: cancel the agreement (if any) and end the deal.
        if (agreement) {
          await supabase
            .from("service_agreements")
            .update({ status: "cancelled" })
            .eq("id", agreement.id);
        }
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: meId,
          body: cancelBody,
        });
        toast.success("Deal cancelled");
        startNewDeal();
      }
      setCancelOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel deal");
    } finally {
      setBusy(false);
    }
  };

  // Either party (customer OR provider) on the escrow can cancel.
  const isPartyOnOrder = order
    ? meId === order.customer_id || meId === order.professional_id
    : true;
  const canCancel =
    !!(agreement || order) &&
    isPartyOnOrder &&
    (!order ||
      order.status === "pending_payment" ||
      order.status === "holding" ||
      order.status === "in_progress");
  const cancelAfterPayment = !!order;
  const isCancelled = order?.status === "cancelled";

  const stage = escrowStage(order, agreement);

  const acceptAgreement = async () => {
    if (!agreement) return;
    setBusy(true);
    const { error } = await supabase
      .from("service_agreements")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", agreement.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Agreement accepted");
    load();
  };

  const getLatestAcceptedAgreement = async () => {
    const { data, error } = await supabase
      .from("service_agreements")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ServiceAgreement) ?? null;
  };

  const openPayBreakdown = async () => {
    setPaying(true);
    try {
      const paymentAgreement = await getLatestAcceptedAgreement();
      if (!paymentAgreement) {
        toast.error("No accepted agreement found for this conversation");
        return;
      }
      setPayAgreement(paymentAgreement);
      setPayBreakdownOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load agreement");
    } finally {
      setPaying(false);
    }
  };

  const payEscrow = async () => {
    if (!payAgreement) return;
    const paymentAgreement = payAgreement;
    setPaying(true);
    try {
      const ag = paymentAgreement as ServiceAgreement & {
        materials_cost?: number | null;
        labor_cost?: number | null;
        contingency_cost?: number | null;
        total_amount?: number | null;
        paystack_fee?: number | null;
        commission_amount?: number | null;
        agreement_type?: string | null;
      };
      const materialsCost = Number(ag.materials_cost ?? 0);
      const laborCost = Number(ag.labor_cost ?? 0);
      const contingencyCost = Number(ag.contingency_cost ?? 0);
      const subtotal = Number(ag.total_amount ?? paymentAgreement.price);
      const agreementType = (ag as { agreement_type?: string | null }).agreement_type ?? "service";
      // Commissionable = labor only. Products/delivery/materials never
      // contribute to commission.
      const commissionable =
        agreementType === "service"
          ? laborCost || subtotal
          : agreementType === "material_labor"
            ? laborCost
            : 0;
      const commission =
        ag.commission_amount != null
          ? Number(ag.commission_amount)
          : await fetchTieredCommission(commissionable);
      // Paystack fee is a separate calculation on (subtotal + commission).
      // It never influences commission.
      const fees = computeAgreementFees(materialsCost, laborCost, contingencyCost, commission);
      let paystackFee = fees.paystackFee;
      let chargeAmount = fees.totalPaid;
      // Service Agreement fee tiers:
      //  - labor > ₦5,000: customer pays labor + commission (Paystack absorbed by EasyMeet).
      //  - labor ≤ ₦5,000: commission=0, customer pays labor + Paystack fee.
      if (agreementType === "service") {
        if (laborCost > 5000) {
          chargeAmount = laborCost + commission;
          paystackFee = computeGatewayFee(chargeAmount);
        } else {
          const zeroCommissionCharge = laborCost;
          paystackFee = computeGatewayFee(zeroCommissionCharge);
          chargeAmount = zeroCommissionCharge + paystackFee;
        }
      }
      setPayBreakdownOpen(false);
      const reference = await payWithFlutterwave({
        email: myEmail,
        amountNgn: chargeAmount,
        flow: "escrow",
        userId: meId,
        description: paymentAgreement.job_title || "EasyMeet protected deal",
        metadata: {
          agreement_id: paymentAgreement.id,
          kind: "escrow_service",
          materials_cost: materialsCost,
          labor_cost: laborCost,
          gateway_fee: paystackFee,
        },
      });
      // Server-side verification before any escrow record is created.
      const verified = await verifyFlutterwavePayment({
        data: { transactionId: reference.transactionId, expectedAmountNgn: chargeAmount },
      });
      if (!verified.verified) {
        toast.error(verified.message || "Payment could not be verified");
        return;
      }
      const p_conversation_id = conversationId;
      const p_agreement_id = paymentAgreement.id;
      const p_customer_id = meId;
      const p_provider_id = paymentAgreement.sender_id;
      const p_amount = subtotal;
      const p_payment_ref = reference.reference;
      console.log("[escrow] create_escrow_payment params:", {
        p_conversation_id,
        p_agreement_id,
        p_customer_id,
        p_provider_id,
        p_amount,
        p_payment_ref,
      });
      const missing = Object.entries({
        p_conversation_id,
        p_agreement_id,
        p_customer_id,
        p_provider_id,
        p_amount,
        p_payment_ref,
      })
        .filter(([, val]) => val === null || val === undefined || val === "")
        .map(([k]) => k);
      if (missing.length) {
        console.error("[escrow] missing RPC params", missing);
        toast.error(`Payment saved but escrow failed: missing ${missing.join(", ")}`);
        return;
      }
      const { data: insertedEscrow, error } = await supabase.rpc("create_escrow_payment", {
        p_conversation_id,
        p_agreement_id,
        p_customer_id,
        p_provider_id,
        p_amount,
        p_payment_ref,
      });
      console.log("[escrow] create_escrow_payment result:", { data: insertedEscrow, error });
      if (error) {
        console.error("[escrow] create_escrow_payment failed", error);
        toast.error("Payment saved but escrow failed: " + error.message);
        return;
      }
      // Optimistically reflect new state so the Pay button hides immediately
      // and Mark Complete / Open Dispute appear without waiting for refetch.
      const raw = Array.isArray(insertedEscrow) ? insertedEscrow[0] : insertedEscrow;
      const base = (raw ?? {}) as Partial<EscrowOrder> & Record<string, unknown>;
      const paidOrder: EscrowOrder = {
        ...(base as EscrowOrder),
        commission_amount: 0,
        payout_amount: subtotal,
        status: "holding",
        stage: "work_in_progress",
        payment_ref: reference.reference,
        paystack_reference: reference.reference,
      };
      setShowSummary(false);
      setHidden(false);
      setAgreement(paymentAgreement);
      setOrder(paidOrder);

      // Persist split amounts + release materials immediately on the escrow row.
      const escrowId = (base.id as string | undefined) ?? paidOrder.id;
      const nowIso = new Date().toISOString();
      const escrowUpdate: Record<string, unknown> = {
        materials_amount: materialsCost,
        labor_amount: laborCost,
      };
      if (materialsCost > 0) {
        escrowUpdate.materials_released = true;
        escrowUpdate.materials_released_at = nowIso;
      }
      if (escrowId) {
        const { error: updErr } = await supabase
          .from("escrow")
          .update(escrowUpdate as never)
          .eq("id", escrowId);
        if (updErr) console.error("[escrow] split-amount update failed", updErr);
      }

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: encodeCard(
          "payment",
          {
            escrow_id: escrowId ?? undefined,
            order_id: paidOrder.order_id ?? undefined,
            amount: chargeAmount,
            materials_released: materialsCost,
            release_condition:
              (paymentAgreement as unknown as { agreement_type?: string } | null)
                ?.agreement_type === "delivery"
                ? "Funds are released to the professional after the customer confirms delivery."
                : "Funds are released to the professional when the customer marks the job as complete.",
          },
          materialsCost > 0
            ? `💳 Payment of ${formatNgn(chargeAmount)} placed in escrow. ${formatNgn(materialsCost)} for materials released to professional.`
            : `💳 Payment of ${formatNgn(chargeAmount)} placed in escrow.`,
        ),
      });
      if (messageError) console.error("Escrow payment message failed", messageError);

      // Notify professional about material release.
      if (materialsCost > 0) {
        const { error: notifErr } = await supabase.from("notifications").insert({
          user_id: paymentAgreement.sender_id,
          title: "Materials released",
          message: `${formatNgn(materialsCost)} for materials has been released to your account. Begin work!`,
          type: "escrow",
        } as never);
        if (notifErr) console.error("Material release notification failed", notifErr);
      }

      // Payment confirmation appears as a rich chat card in the conversation
      // (see the encodeCard("payment", ...) insert above) — no popup/toast.
      void load();
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled")
        toast.message("Payment cancelled");
      else toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const markComplete = async () => {
    if (!order) return;
    setBusy(true);
    try {
      if (!order.order_id) throw new Error("Missing order reference for this escrow");
      // Server-side RPC computes commission and payout atomically to prevent
      // client tampering with platform fees.
      const { data: rpcResult, error: rpcError } = await supabase.rpc("release_escrow_payment", {
        p_escrow_id: order.id,
        p_order_id: order.order_id,
      });
      if (rpcError) throw new Error(rpcError.message || "Could not release payment");
      const releaseResult = (rpcResult ?? {}) as {
        ok?: boolean;
        commission?: number;
        payout?: number;
        amount?: number;
        professional_id?: string;
        already_released?: boolean;
      };
      const commission = Number(releaseResult.commission ?? 0);
      const payout = Number(releaseResult.payout ?? order.amount_ngn - commission);
      const grossAmount = Number(releaseResult.amount ?? order.amount_ngn ?? 0);
      const professionalId = releaseResult.professional_id ?? order.professional_id;

      // Credit the professional's EasyMeet Wallet. release_escrow_payment
      // intentionally no longer credits internally so we can pair the credit
      // with a notification + realtime refresh here. Skip when the RPC
      // reports `already_released` — the wallet was credited on the first
      // successful call and we must not double-credit.
      if (!releaseResult.already_released && professionalId) {
        console.log("[wallet] release result:", releaseResult);
        console.log("[wallet] crediting", {
          amount: payout,
          commission: commission,
        });
        const { error: creditError } = await supabase.rpc("credit_wallet_after_release", {
          p_user_id: professionalId,
          p_amount: payout, // NET amount professional receives
          p_commission: commission, // commission EasyMeet took
          p_order_id: order.order_id,
          p_escrow_id: order.id,
        });
        if (creditError) console.error("Wallet credit failed", creditError);
      }

      const completed: EscrowOrder = {
        ...order,
        status: "released",
        stage: "completed",
        commission_amount: commission,
        payout_amount: payout,
        released_at: new Date().toISOString(),
      };
      setOrder(completed);
      setCompleteOpen(false);
      const releasedAtIso = completed.released_at ?? new Date().toISOString();
      const paystackFeeApprox = (() => {
        const s = grossAmount;
        if (!s) return 0;
        return Math.min(2000, Math.round((s * 0.015 + (s >= 2500 ? 100 : 0)) * 100) / 100);
      })();
      // Paystack fee is calculated on the pre-fee amount the customer pays
      // (service amount + commission). It is never deducted from the professional.
      const paystackFee = computeGatewayFee(grossAmount + commission);
      // Only the permanent Deal Summary card is posted to chat — no
      // completion popup, toast, or extra chat notification.
      void paystackFeeApprox;
      // Persistent Deal Summary card (sole confirmation of completion).
      // The customer paid the service amount + protection fee + Paystack fee.
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: encodeCard(
          "deal_summary",
          {
            agreement_id: order.agreement_id ?? undefined,
            order_id: order.order_id ?? undefined,
            escrow_id: order.id,
            title: agreement?.job_title ?? order.title ?? "Deal",
            agreement_type:
              (agreement as unknown as { agreement_type?: string } | null)?.agreement_type ??
              order.agreement_type ??
              "service",
            total: grossAmount,
            protection_fee: commission,
            paystack_fee: paystackFee,
            released: payout,
            status: "completed",
            completed_at: releasedAtIso,
          },
          `Deal completed — ${formatNgn(payout)} released.`,
        ),
      });
      // Deal Summary card in chat is the only confirmation — no toast.
      // Wallet-credit notification to the professional.
      try {
        await supabase.from("notifications").insert({
          user_id: professionalId,
          title: "Wallet credited 🎉",
          message: `${formatNgn(payout)} has been added to your EasyMeet Wallet! 🎉`,
          type: "wallet",
        } as never);
      } catch (e) {
        console.error("Wallet notification failed", e);
      }
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release payment");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  // FIRST CHECK: if the latest escrow row OR the latest agreement says
  // cancelled, render the cancelled banner immediately and nothing else.
  // Works for every role combination (customer/professional/business in
  // either direction) because it relies only on the latest record's
  // status field — no role gating.
  const escrowCancelled = order?.status === "cancelled";
  const agreementCancelledNoOrder = !order && agreement?.status === "cancelled";
  if (escrowCancelled || agreementCancelledNoOrder) {
    const src = (escrowCancelled ? order : agreement) as unknown as {
      cancelled_by?: string | null;
      cancelled_at?: string | null;
      updated_at?: string | null;
    } | null;
    const cancelledBy = src?.cancelled_by ?? null;
    const cancelledAt = src?.cancelled_at ?? src?.updated_at ?? null;
    const cancellerName =
      cancelledBy && cancelledBy === meId
        ? "you"
        : other?.full_name || other?.username || "the other party";
    const cancelledDate = cancelledAt
      ? new Date(cancelledAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;
    return (
      <div className="border-t border-border bg-card/60 backdrop-blur p-3">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="font-bold text-sm">❌ Deal Cancelled</span>
            <Badge variant="outline" className="ml-auto text-[10px] capitalize">
              cancelled
            </Badge>
          </div>
          <p className="text-sm text-foreground">
            This deal was cancelled by <span className="font-semibold">{cancellerName}</span>.
          </p>
          {cancelledDate && <p className="text-xs text-muted-foreground mt-1">{cancelledDate}</p>}
          <Button
            size="sm"
            onClick={openNewDealFlow}
            className="bg-gradient-brand mt-3 w-full sm:w-auto"
          >
            <Handshake className="h-3.5 w-3.5 mr-1" /> Start New Deal
          </Button>
        </div>
      </div>
    );
  }

  // A user who explicitly chose "I'm the Buyer" for this conversation never
  // sees the 🤝 shield button — the provider starts the deal.
  const buyerLocked = iAmProvider === false && readSavedRole() === false && !order && !agreement;

  if (hidden) {
    return (
      <div className="border-t border-border bg-card/60 backdrop-blur p-3 flex justify-end relative">
        {meRole !== "customer" && !buyerLocked && <NewDealFab onClick={openNewDealFlow} />}
      </div>
    );
  }

  // No agreement, no escrow and no user-started deal → show nothing but the
  // single floating "New Deal" button. Never render a stage card here.
  if (!agreement && !order && !dealFlowActive) {
    return (
      <div className="border-t border-border bg-card/60 backdrop-blur p-3 flex justify-end relative">
        {meRole !== "customer" && !buyerLocked && <NewDealFab onClick={openNewDealFlow} />}
      </div>
    );
  }

  // Post-payment popup removed — payment/completion state is shown as
  // rich chat cards (payment card, completion card, permanent deal summary
  // card) inside the conversation instead of a separate summary panel.

  return (
    <div className="border-t border-border bg-card/60 backdrop-blur p-3">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-gradient-tri">
          Escrow — Stage {stage}/6: {STAGES[stage - 1]}
        </span>
        {order && (
          <Badge variant="outline" className="ml-auto text-[10px] capitalize">
            {order.status.replace("_", " ")}
          </Badge>
        )}
      </div>

      {agreement && !isCancelled && (
        <div className="rounded-lg border border-border/60 p-3 mb-2 bg-background/40">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{agreement.job_title}</div>
              {agreement.job_description && (
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                  {agreement.job_description}
                </p>
              )}
              {agreement.terms && (
                <p className="text-[11px] text-muted-foreground mt-1 italic">
                  Terms: {agreement.terms}
                </p>
              )}
              <div className="mt-1 font-bold text-gradient-brand">{formatNgn(agreement.price)}</div>
            </div>
            <Badge variant="secondary" className="capitalize text-[10px]">
              {agreement.status}
            </Badge>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 mb-2">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="font-bold text-sm">❌ Deal Cancelled</span>
          </div>
          <p className="text-sm text-foreground">
            This deal was cancelled by{" "}
            <span className="font-semibold">
              {(order as unknown as { cancelled_by?: string | null })?.cancelled_by === meId
                ? "you"
                : other?.full_name || other?.username || "the other party"}
            </span>
            .
          </p>
          {(order as unknown as { cancelled_at?: string | null })?.cancelled_at && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date((order as unknown as { cancelled_at: string }).cancelled_at).toLocaleString(
                undefined,
                { dateStyle: "medium", timeStyle: "short" },
              )}
            </p>
          )}
          <Button
            size="sm"
            onClick={openNewDealFlow}
            className="bg-gradient-brand mt-3 w-full sm:w-auto"
          >
            <Handshake className="h-3.5 w-3.5 mr-1" /> Start New Deal
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Stage 1 — buyer waits for the provider's agreement */}
        {!isCancelled && iAmProvider === false && !agreement && !order && (
          <p className="text-xs text-muted-foreground">
            Waiting for the service provider to send an agreement
          </p>
        )}
        {/* Stage 2 — provider sends agreement (AI-detected role) */}
        {!isCancelled &&
          iAmProvider === true &&
          !order &&
          (!agreement || agreement.status === "rejected" || agreement.status === "cancelled") && (
            <Button size="sm" onClick={openSendFlow} className="bg-gradient-brand shadow-lg shadow-primary/30">
              <Handshake className="h-3.5 w-3.5 mr-1" /> Send Agreement
            </Button>
          )}

        {/* Stage 2 — buyer accepts */}
        {!isCancelled && iAmProvider === false && agreement?.status === "pending" && !order && (
          <Button size="sm" onClick={acceptAgreement} disabled={busy} className="bg-gradient-brand">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Accept Agreement
          </Button>
        )}

        {/* Stage 3 — pay into escrow */}
        {!isCancelled && iAmProvider === false && agreement?.status === "accepted" && !order && (
          <Button
            size="sm"
            onClick={openPayBreakdown}
            disabled={paying}
            className="bg-gradient-brand"
          >
            {paying ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-1" />
            )}
            Pay into Escrow ({formatNgn(agreement.price)})
          </Button>
        )}

        {/* Stage 5 — customer marks complete */}
        {!isCancelled &&
          order &&
          order.customer_id === meId &&
          order.status === "holding" &&
          order.stage === "work_in_progress" && (
            <Button
              size="sm"
              onClick={() => setCompleteOpen(true)}
              disabled={busy}
              className="bg-gradient-brand"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Complete
            </Button>
          )}

        {/* Dispute */}
        {!isCancelled &&
          order &&
          (order.status === "holding" || order.status === "in_progress") && (
            <Button size="sm" variant="outline" onClick={() => setDisputeOpen(true)}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Open Dispute
            </Button>
          )}

        {/* In-panel "Deal Completed!" summary removed — the permanent
            Deal Summary chat card is the only completion confirmation. */}

        {order?.status === "disputed" && (
          <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Dispute Under Review</span>
            <span className="text-destructive/80">
              — EasyMeet admin will review within 24–48 hours.
            </span>
          </div>
        )}

        {order?.status === "refunded" && (
          <span className="text-xs text-muted-foreground">Refunded to customer.</span>
        )}

        {!isCancelled && canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCancelOpen(true)}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <XCircle className="h-4 w-4 mr-1" /> Cancel Deal
          </Button>
        )}
      </div>

      {sendOpen && other && (
        <SendAgreementDialog
          open={sendOpen}
          onOpenChange={(v) => {
            setSendOpen(v);
            if (!v) setEditAgreementId(null);
          }}
          conversationId={conversationId}
          professionalId={meId}
          customerId={other.id}
          initialType={initialType}
          editAgreementId={editAgreementId}
          onSent={load}
        />
      )}
      <AgreementTypeSheet
        open={typePickerOpen}
        onOpenChange={setTypePickerOpen}
        onPick={(t) => {
          setInitialType(t);
          setTypePickerOpen(false);
          setEditAgreementId(null);
          setSendOpen(true);
        }}
      />
      {askRoleOpen && other && !isCancelled && (
        <AskRoleDialog
          open={askRoleOpen}
          onOpenChange={setAskRoleOpen}
          otherName={other.full_name ?? other.username ?? "the other person"}
          onChoose={(role) => {
            const isProv = role === "provider";
            setIAmProvider(isProv);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(roleKey, isProv ? "provider" : "buyer");
            }
            setAskRoleOpen(false);
            if (isProv) {
              // Provider: dismiss popup and let them start the agreement from
              // the 🤝 shield button. Only open the type picker when they were
              // already in an explicit "new deal" flow.
              if (dealFlowActive) {
                setEditAgreementId(null);
                setTypePickerOpen(true);
              }
            } else {
              // Buyer: no type picker ever — just wait for the agreement.
              setTypePickerOpen(false);
            }
          }}
        />
      )}
      {disputeOpen && order && (
        <OpenDisputeDialog
          open={disputeOpen}
          onOpenChange={setDisputeOpen}
          orderId={order.id}
          conversationId={conversationId}
          meId={meId}
          onOpened={load}
        />
      )}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Job Completion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure this job has been completed to your satisfaction? EasyMeet will not be held
            responsible if you mark a job as complete without verifying the work first. Once
            confirmed, payment will be released immediately and cannot be reversed.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setCompleteOpen(false)} disabled={busy}>
              Go Back
            </Button>
            <Button onClick={markComplete} disabled={busy} className="bg-gradient-brand">
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Yes, Release Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CancelDealDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        afterPayment={cancelAfterPayment}
        busy={busy}
        onConfirm={cancelDeal}
      />
      <PaymentBreakdownDialog
        open={payBreakdownOpen}
        onOpenChange={(v) => {
          setPayBreakdownOpen(v);
          if (!v) setPayAgreement(null);
        }}
        agreement={payAgreement}
        paying={paying}
        onConfirm={payEscrow}
      />
    </div>
  );
}

// Client-side fallback that mirrors the DB `calculate_commission` tiers.
function fallbackCommission(labor: number): number {
  const n = Math.max(0, Number(labor) || 0);
  if (n < 5000) return 0;
  if (n <= 100_000) return Math.min(3000, Math.round(n * 0.03));
  if (n <= 500_000) return Math.min(10_000, Math.round(n * 0.02));
  if (n <= 2_000_000) return Math.min(30_000, Math.round(n * 0.015));
  if (n <= 10_000_000) return Math.min(100_000, Math.round(n * 0.01));
  return Math.max(100_000, Math.round(n * 0.001));
}

async function fetchTieredCommission(labor: number): Promise<number> {
  if (!labor || labor <= 0) return 0;
  try {
    const { data, error } = await supabase.rpc("calculate_commission" as never, {
      labor_amount: labor,
    } as never);
    if (error) throw error;
    const n = Number(data);
    if (Number.isFinite(n)) return n;
  } catch (e) {
    console.warn("calculate_commission RPC failed, using local fallback", e);
  }
  return fallbackCommission(labor);
}

function PaymentBreakdownDialog({
  open,
  onOpenChange,
  agreement,
  paying,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agreement: ServiceAgreement | null;
  paying: boolean;
  onConfirm: () => void;
}) {
  const ag = agreement as
    | (ServiceAgreement & {
        materials_cost?: number | null;
        labor_cost?: number | null;
        contingency_cost?: number | null;
        total_amount?: number | null;
        paystack_fee?: number | null;
        commission_amount?: number | null;
        agreement_type?: string | null;
      })
    | null;
  const materials = Number(ag?.materials_cost ?? 0);
  const labor = Number(ag?.labor_cost ?? 0);
  const subtotal =
    Number(ag?.total_amount ?? materials + labor) || Number(ag?.price ?? 0);
  const type = (ag?.agreement_type ?? "service") as
    | "service"
    | "material_labor"
    | "product_sale"
    | "delivery"
    | string;

  // Commissionable amount by agreement type.
  // Service: labor/subtotal. Material+Labor: labor. Delivery: fee (customer
  // pays commission on top so rider gets 100%). Product sale: 0.
  const commissionable =
    type === "service"
      ? labor || subtotal
      : type === "material_labor"
        ? labor
        : type === "delivery"
          ? labor || subtotal
          : 0;

  const [commission, setCommission] = useState<number>(
    Number(ag?.commission_amount ?? fallbackCommission(commissionable)),
  );
  const [commissionLoading, setCommissionLoading] = useState(false);

  useEffect(() => {
    if (!open || !ag) return;
    let cancelled = false;
    setCommissionLoading(true);
    fetchTieredCommission(commissionable)
      .then((c) => {
        if (!cancelled) setCommission(c);
      })
      .finally(() => {
        if (!cancelled) setCommissionLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, commissionable, ag?.id]);

  if (!agreement || !ag) return null;

  // Service Agreement fee tiers (₦5,000 threshold on Service Fee):
  //  - Above ₦5,000: customer pays labor + commission. Paystack fee absorbed by EasyMeet.
  //                  Professional receives labor - paystackFee.
  //  - ≤ ₦5,000: commission = 0. Customer pays labor + paystack fee.
  //              Professional receives full labor.
  const isService = type === "service";
  const serviceFee = labor || subtotal;
  const isServiceHighTier = isService && serviceFee > 5000;
  const isServiceLowTier = isService && serviceFee <= 5000;
  const serviceCommission = isServiceLowTier ? 0 : commission;
  const effectiveCommission = isService ? serviceCommission : commission;
  const preFeeTotal = isService
    ? serviceFee + effectiveCommission
    : subtotal + effectiveCommission;
  const rawPaystackFee = computeGatewayFee(
    isService ? serviceFee : preFeeTotal,
  );
  const paystackFee = rawPaystackFee;
  const total = isServiceHighTier
    ? preFeeTotal // customer never pays Paystack fee
    : isServiceLowTier
      ? serviceFee + paystackFee
      : preFeeTotal + paystackFee;
  const professionalReceives = isServiceHighTier
    ? Math.max(0, serviceFee - paystackFee)
    : isServiceLowTier
      ? serviceFee
      : Math.max(0, materials + labor - commission);

  const rows: Array<{ label: string; value: number; muted?: boolean }> = [];
  if (type === "service") {
    rows.push({ label: "Service Fee", value: labor || subtotal });
  } else if (type === "material_labor") {
    if (materials > 0) rows.push({ label: "Materials (released immediately)", value: materials });
    rows.push({ label: "Service Fee (held in escrow)", value: labor });
  } else if (type === "product_sale") {
    // Product price is stored in `labor_cost` (held in escrow until delivery
    // confirmed); delivery fee in `materials_cost` (released immediately).
    if (labor > 0)
      rows.push({ label: "Product Price — Held in escrow until delivery confirmed", value: labor });
    if (materials > 0)
      rows.push({ label: "Delivery Fee — Released immediately", value: materials });
  } else if (type === "delivery") {
    rows.push({ label: "Delivery Fee — Goes to rider in full", value: labor || subtotal });
  } else {
    rows.push({ label: "Escrow amount", value: subtotal });
  }

  const commissionLabel =
    commissionable > 0
      ? "EasyMeet Protection Fee"
      : "EasyMeet Protection Fee";

  const typeLabel =
    AGREEMENT_TYPES.find((t) => t.value === type)?.label ?? "Escrow Agreement";

  const iconFor = (label: string) => {
    if (/material|product/i.test(label)) return <Package className="h-4 w-4" />;
    if (/labor|service/i.test(label)) return <Briefcase className="h-4 w-4" />;
    if (/deliver/i.test(label)) return <Truck className="h-4 w-4" />;
    if (/conting/i.test(label)) return <Wallet className="h-4 w-4" />;
    return <Wallet className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 overflow-hidden max-w-full sm:max-w-md w-full
          sm:rounded-3xl rounded-t-[24px] rounded-b-none
          max-h-[92vh] flex flex-col
          data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8
          sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0
          fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0
          sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:bottom-auto sm:right-auto"
      >
        <div className="relative bg-gradient-to-br from-[#1a1030] via-[#2b1655] to-[#3b1e78] text-white px-5 pt-5 pb-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 transition"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[11px] font-semibold">
              <Shield className="h-3 w-3" /> {typeLabel}
            </span>
            <div className="h-9 w-9" />
          </div>
          <div className="mt-3">
            <DialogTitle className="text-lg font-extrabold tracking-tight text-white">
              Payment Breakdown
            </DialogTitle>
            {ag.job_title && (
              <p className="text-xs text-white/70 mt-0.5 truncate">{ag.job_title as string}</p>
            )}
          </div>
          <div className="sm:hidden absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/30" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-background">
          <div className="rounded-2xl border border-border/60 bg-card/60 divide-y divide-border/50">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  {iconFor(r.label)}
                </span>
                <span className="flex-1 text-sm text-foreground">{r.label}</span>
                <span className="font-semibold text-sm">{formatNgn(r.value)}</span>
              </div>
            ))}
            {!isServiceLowTier && (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-lg bg-accent/15 text-accent grid place-items-center">
                  <Shield className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm text-muted-foreground">
                  {commissionLabel}
                  {commissionLoading && " • calculating…"}
                </span>
                <span className="font-semibold text-sm">
                  {formatNgn(effectiveCommission)}
                </span>
              </div>
            )}
            {!isServiceHighTier && (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-lg bg-muted text-muted-foreground grid place-items-center">
                  <CreditCard className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm text-muted-foreground">Paystack fee</span>
                <span className="font-semibold text-sm">{formatNgn(paystackFee)}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total you pay</span>
              <span className="text-2xl font-extrabold text-gradient-brand">
                {formatNgn(total)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Professional receives</span>
              <span className="font-semibold text-accent">{formatNgn(professionalReceives)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border bg-card/80 backdrop-blur space-y-2">
          <Button
            onClick={onConfirm}
            disabled={paying}
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[#6C47FF] to-[#8E5BFF] hover:opacity-95 shadow-lg shadow-primary/30"
          >
            {paying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-2" />
            )}
            Confirm & Pay {formatNgn(total)}
          </Button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={paying}
            className="w-full text-sm text-muted-foreground hover:text-foreground py-1.5 disabled:opacity-50"
          >
            Go Back
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDealFab({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative">
      <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" aria-hidden />
      <button
        type="button"
        onClick={onClick}
        className="relative flex flex-col items-center justify-center gap-0.5 h-16 w-16 rounded-full
          bg-gradient-to-br from-[#6C47FF] to-[#8E5BFF] text-white shadow-xl shadow-primary/40
          hover:scale-105 active:scale-95 transition-transform"
        aria-label="Start new deal"
      >
        <Handshake className="h-6 w-6" strokeWidth={2.2} />
        <span className="text-[9px] font-semibold leading-none">New Deal</span>
      </button>
    </div>
  );
}

function AgreementTypeSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (type: string) => void;
}) {
  const cards = [
    {
      value: "service",
      label: "Service Agreement",
      desc: "Labor-only work, released after completion.",
      icon: <Briefcase className="h-5 w-5" />,
      accent: "from-primary/15 to-primary/5 text-primary",
    },
    {
      value: "product_sale",
      label: "Product Sale",
      desc: "Product + delivery, released on confirmation.",
      icon: <Package className="h-5 w-5" />,
      accent: "from-accent/15 to-accent/5 text-accent",
    },
    {
      value: "material_labor",
      label: "Material + Labor",
      desc: "Materials released now, labor after completion.",
      icon: <Wrench className="h-5 w-5" />,
      accent: "from-coral/15 to-coral/5 text-coral",
    },
    {
      value: "delivery",
      label: "Delivery Agreement",
      desc: "Delivery fee held until delivery confirmed.",
      icon: <Truck className="h-5 w-5" />,
      accent: "from-primary/15 to-accent/10 text-primary",
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 overflow-hidden max-w-full sm:max-w-md w-full
          sm:rounded-3xl rounded-t-[24px] rounded-b-none
          max-h-[85vh] flex flex-col
          data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8
          sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0
          fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0
          sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:bottom-auto sm:right-auto"
      >
        <div className="relative bg-gradient-to-br from-[#1a1030] via-[#2b1655] to-[#3b1e78] text-white px-5 pt-5 pb-5">
          <div className="sm:hidden absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/30" />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-white/80">
              Choose deal type
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <DialogTitle className="text-xl font-extrabold mt-3 text-white">
            Start a New Deal
          </DialogTitle>
          <p className="text-xs text-white/70 mt-1">
            Pick the agreement type that fits your work.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-background">
          {cards.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onPick(c.value)}
              className="text-left rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition group"
            >
              <div
                className={`h-10 w-10 rounded-xl bg-gradient-to-br ${c.accent} grid place-items-center mb-3`}
              >
                {c.icon}
              </div>
              <div className="font-semibold text-sm text-foreground">{c.label}</div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{c.desc}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendAgreementDialog({
  open,
  onOpenChange,
  conversationId,
  professionalId,
  customerId,
  initialType,
  editAgreementId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  professionalId: string;
  customerId: string;
  initialType?: string;
  editAgreementId?: string | null;
  onSent: () => void;
}) {
  const [agreementType, setAgreementType] = useState<string>(initialType ?? "service");
  useEffect(() => {
    if (open && initialType) setAgreementType(initialType);
  }, [open, initialType]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // material_labor
  const [materials, setMaterials] = useState("");
  const [labor, setLabor] = useState("");
  // service
  const [serviceFee, setServiceFee] = useState("");
  // product_sale
  const [productPrice, setProductPrice] = useState("");
  const [productDeliveryFee, setProductDeliveryFee] = useState("");
  // supply
  const [supplyCost, setSupplyCost] = useState("");
  const [supplyDeliveryFee, setSupplyDeliveryFee] = useState("");
  // delivery
  const [deliveryFee, setDeliveryFee] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  // milestone
  const [m1Desc, setM1Desc] = useState("");
  const [m1Amt, setM1Amt] = useState("");
  const [m2Desc, setM2Desc] = useState("");
  const [m2Amt, setM2Amt] = useState("");
  const [finalPayment, setFinalPayment] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Map per-type inputs -> (immediate-release, held-in-escrow, contingency).
  // Commission rule: 3% on labor/service only; 0% on materials/products/delivery.
  const mapped = (() => {
    const n = (v: string) => Math.max(0, Number(v) || 0);
    switch (agreementType) {
      case "service":
        return { immediate: 0, held: n(serviceFee), contingency: 0, commissionable: n(serviceFee) };
      case "material_labor":
        return {
          immediate: n(materials),
          held: n(labor),
          contingency: 0,
          commissionable: n(labor),
        };
      case "product_sale":
        return {
          // Product price → held (in escrow until delivery confirmed).
          // Delivery fee → immediate (released to seller on payment).
          immediate: n(productDeliveryFee),
          held: n(productPrice),
          contingency: 0,
          commissionable: 0,
        };
      case "supply":
        return {
          immediate: n(supplyCost) + n(supplyDeliveryFee),
          held: 0,
          contingency: 0,
          commissionable: 0,
        };
      case "delivery":
        // Delivery fee goes 100% to the rider; customer pays commission on top.
        return { immediate: 0, held: n(deliveryFee), contingency: 0, commissionable: n(deliveryFee) };
      case "milestone": {
        const held = n(m1Amt) + n(m2Amt) + n(finalPayment);
        return { immediate: 0, held, contingency: 0, commissionable: held };
      }
      default:
        return { immediate: 0, held: 0, contingency: 0, commissionable: 0 };
    }
  })();
  const [commission, setCommission] = useState<number>(
    fallbackCommission(mapped.commissionable),
  );
  const [commissionLoading, setCommissionLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCommissionLoading(true);
    fetchTieredCommission(mapped.commissionable)
      .then((c) => {
        if (!cancelled) setCommission(c);
      })
      .finally(() => {
        if (!cancelled) setCommissionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapped.commissionable]);
  // Paystack fee is computed inside computeAgreementFees on (subtotal +
  // commission) — never combined with commission itself.
  const fees = computeAgreementFees(
    mapped.immediate,
    mapped.held,
    mapped.contingency,
    commission,
  );
  // Service Agreement above ₦5,000: Paystack fee is absorbed by EasyMeet and
  // calculated on the service fee alone. The professional receives the service
  // fee minus that Paystack fee, never minus the protection fee.
  const serviceHighTierPaystackFee =
    agreementType === "service" && mapped.held > 5000
      ? computeGatewayFee(mapped.held)
      : fees.paystackFee;
  // For delivery, rider gets 100% of the delivery fee — commission is added
  // to the customer's total, not deducted from the rider's payout.
  const professionalReceives =
    agreementType === "service" && mapped.held > 5000
      ? Math.max(0, mapped.held - serviceHighTierPaystackFee)
      : agreementType === "delivery"
        ? mapped.held
        : fees.professionalReceives;
  const receiverLabel =
    agreementType === "delivery"
      ? "Rider receives (full — no deductions)"
      : agreementType === "product_sale"
        ? "Seller receives"
        : "Professional receives";

  // Auto-fill from chat history when dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setSuggesting(true);
      try {
        const { data: msgs } = await supabase
          .from("messages")
          .select("sender_id, body")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(60);
        if (cancelled || !msgs || msgs.length === 0) return;
        const suggestion = await suggestAgreement({
          data: {
            messages: msgs.map((m) => ({
              sender_id: m.sender_id as string,
              body: (m.body as string) ?? "",
            })),
          },
        });
        if (cancelled) return;
        setTitle((cur) => cur || suggestion.title);
        setDescription((cur) => cur || suggestion.description);
        const p = suggestion.price ? String(suggestion.price) : "";
        if (p) {
          setServiceFee((cur) => cur || p);
          setLabor((cur) => cur || p);
          setProductPrice((cur) => cur || p);
          setSupplyCost((cur) => cur || p);
          setDeliveryFee((cur) => cur || p);
        }
        setTerms((cur) => cur || suggestion.terms);
      } catch {
        // best-effort; ignore
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  // Prefill fields when editing an existing pending agreement.
  useEffect(() => {
    if (!open || !editAgreementId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("service_agreements")
        .select("*")
        .eq("id", editAgreementId)
        .maybeSingle();
      if (cancelled || !data) return;
      const a = data as Record<string, unknown>;
      const t = (a.agreement_type as string) ?? "service";
      setAgreementType(t);
      setTitle((a.job_title as string) ?? "");
      setDescription((a.job_description as string) ?? "");
      setTerms((a.terms as string) ?? "");
      const mat = Number(a.materials_cost ?? 0);
      const lab = Number(a.labor_cost ?? 0);
      const cont = Number(a.contingency_cost ?? 0);
      if (t === "service") setServiceFee(String(lab || Number(a.price ?? 0)));
      if (t === "material_labor") {
        setMaterials(String(mat));
        setLabor(String(lab));
      }
      if (t === "product_sale") {
        // Product price is stored in labor_cost; delivery fee in materials_cost.
        setProductPrice(String(lab || Number(a.price ?? 0)));
        setProductDeliveryFee(mat ? String(mat) : "");
      }
      if (t === "delivery") {
        setDeliveryFee(String(lab || Number(a.price ?? 0)));
        // Try to recover pickup/dropoff from terms lines.
        const terms = (a.terms as string) ?? "";
        const pu = terms.match(/Pickup:\s*(.+)/);
        const dp = terms.match(/Drop-off:\s*(.+)/);
        if (pu) setPickupLocation(pu[1].trim());
        if (dp) setDropoffLocation(dp[1].trim());
      }
      if (a.delivery_date) {
        const d = new Date(a.delivery_date as string).toISOString().slice(0, 10);
        setDeliveryDate(d);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editAgreementId]);

  const titleLabel = agreementType === "product_sale" ? "Product name" : "Job title";
  const descLabel =
    agreementType === "product_sale"
      ? "Product description"
      : agreementType === "delivery"
        ? "Item description"
        : "Description";
  const dateLabel =
    agreementType === "service" || agreementType === "material_labor"
      ? "Completion date"
      : "Delivery date";
  const showTitle = agreementType !== "delivery";

  const submit = async () => {
    const jobDescription = description.trim();
    const jobTitle = showTitle ? title.trim() : jobDescription.slice(0, 80);
    if (showTitle && !jobTitle) return toast.error(`${titleLabel} is required`);
    if (!jobDescription) return toast.error(`${descLabel} is required`);
    if (agreementType === "delivery") {
      if (!pickupLocation.trim()) return toast.error("Pickup location is required");
      if (!dropoffLocation.trim()) return toast.error("Delivery location is required");
    }
    if (fees.subtotal <= 0) return toast.error("Enter an amount greater than 0");
    if (!deliveryDate) return toast.error(`${dateLabel} is required`);
    setBusy(true);

    // Encode per-type extras into terms so no schema change is required.
    const extras: string[] = [];
    if (agreementType === "delivery") {
      extras.push(`Pickup: ${pickupLocation.trim()}`);
      extras.push(`Drop-off: ${dropoffLocation.trim()}`);
    }
    if (agreementType === "milestone") {
      if (m1Desc.trim() || m1Amt)
        extras.push(`Milestone 1: ${m1Desc.trim()} — ${formatNgn(Number(m1Amt) || 0)}`);
      if (m2Desc.trim() || m2Amt)
        extras.push(`Milestone 2: ${m2Desc.trim()} — ${formatNgn(Number(m2Amt) || 0)}`);
      if (finalPayment) extras.push(`Final payment: ${formatNgn(Number(finalPayment) || 0)}`);
    }
    const termsFinal = [terms.trim(), extras.join("\n")].filter(Boolean).join("\n\n") || null;

    const n = (v: string) => Math.max(0, Number(v) || 0);
    const totalAmount = fees.subtotal;
    const basePayload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_id: professionalId,
      receiver_id: customerId,
      job_title: jobTitle,
      job_description: jobDescription,
      terms: termsFinal,
      status: "pending",
      agreement_type: agreementType,
      delivery_date: deliveryDate,
      total_amount: totalAmount,
      paystack_fee: fees.paystackFee,
    };
    let typeFields: Record<string, unknown>;
    switch (agreementType) {
      case "service":
        typeFields = {
          labor_cost: n(serviceFee),
          materials_cost: 0,
          price: n(serviceFee),
          commission_amount: commission,
        };
        break;
      case "material_labor":
        typeFields = {
          materials_cost: n(materials),
          labor_cost: n(labor),
          price: totalAmount,
          commission_amount: commission,
        };
        break;
      case "product_sale":
        typeFields = {
          materials_cost: n(productDeliveryFee),
          labor_cost: n(productPrice),
          price: totalAmount,
          commission_amount: 0,
        };
        break;
      case "delivery":
        typeFields = {
          labor_cost: n(deliveryFee),
          materials_cost: 0,
          price: totalAmount,
          commission_amount: commission,
        };
        break;
      case "milestone": {
        const held = n(m1Amt) + n(m2Amt) + n(finalPayment);
        typeFields = {
          labor_cost: held,
          materials_cost: 0,
          price: totalAmount,
          commission_amount: commission,
        };
        break;
      }
      case "supply":
        typeFields = {
          materials_cost: n(supplyCost) + n(supplyDeliveryFee),
          labor_cost: 0,
          price: totalAmount,
          commission_amount: 0,
        };
        break;
      default:
        typeFields = {
          materials_cost: mapped.immediate,
          labor_cost: mapped.held,
          price: totalAmount,
          commission_amount: commission,
        };
    }
    const payload: Record<string, unknown> = { ...basePayload, ...typeFields };
    let inserted: { id: string } | null = null;
    let error: { message: string } | null = null;
    if (editAgreementId) {
      // Update in place — do not push a duplicate agreement card.
      const { error: upErr } = await supabase
        .from("service_agreements")
        .update(payload as never)
        .eq("id", editAgreementId);
      error = upErr as { message: string } | null;
      inserted = { id: editAgreementId };
    } else {
      const res = await supabase
        .from("service_agreements")
        .insert(payload as never)
        .select("id")
        .single();
      inserted = (res.data as { id: string } | null) ?? null;
      error = (res.error as { message: string } | null) ?? null;
    }
    if (!error && !editAgreementId) {
      const agreementId = (inserted as { id: string } | null)?.id ?? "";
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: professionalId,
        body: encodeCard(
          "agreement",
          {
            agreement_id: agreementId,
            title: jobTitle,
            agreement_type: agreementType,
            amount: fees.subtotal,
            sender_id: professionalId,
          },
          `📄 Agreement sent: "${jobTitle}" — ${formatNgn(fees.subtotal)}. Please review and accept.`,
        ),
      });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editAgreementId ? "Agreement updated" : "Agreement sent");
    onSent();
    onOpenChange(false);
  };

  const agreementLabel =
    AGREEMENT_TYPES.find((t) => t.value === agreementType)?.label ?? "Agreement";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 overflow-hidden max-w-full sm:max-w-lg
          w-full sm:rounded-3xl rounded-t-[24px] rounded-b-none
          max-h-[92vh] flex flex-col
          data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8
          sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0
          fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0
          sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:bottom-auto sm:right-auto"
      >
        {/* Dark premium header */}
        <div className="relative bg-gradient-to-br from-[#1a1030] via-[#2b1655] to-[#3b1e78] text-white px-5 pt-5 pb-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 transition"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[11px] font-semibold">
              <Shield className="h-3 w-3" /> {agreementLabel}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4">
            <DialogTitle className="text-xl font-extrabold tracking-tight text-white">
              {editAgreementId ? "Edit Agreement" : "New Escrow Agreement"}
            </DialogTitle>
            <p className="text-xs text-white/70 mt-1">
              Funds are held safely until the work is completed.
            </p>
            {suggesting && (
              <span className="mt-2 inline-flex text-[11px] font-medium text-white/80 items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI drafting from your chat…
              </span>
            )}
          </div>
          {/* subtle sheet handle */}
          <div className="sm:hidden absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/30" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-background">
          <div>
            <Label>Agreement type</Label>
            <Select value={agreementType} onValueChange={setAgreementType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGREEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showTitle && (
            <div>
              <Label>
                {titleLabel} <span className="text-destructive">*</span>
              </Label>
              <Input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>
          )}

          <div>
            <Label>
              {descLabel} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          {agreementType === "service" && (
            <div>
              <Label>
                Labor / Service fee (₦) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={serviceFee}
                onChange={(e) => setServiceFee(e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Released after job completion.
              </p>
            </div>
          )}

          {agreementType === "material_labor" && (
            <>
              <div>
                <Label>Materials cost (₦)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Released immediately upon acceptance.
                </p>
              </div>
              <div>
                <Label>Labor fee (₦)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={labor}
                  onChange={(e) => setLabor(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Released after job completion.
                </p>
              </div>
            </>
          )}

          {agreementType === "product_sale" && (
            <>
              <div>
                <Label>
                  Product price (₦) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Held in escrow until delivery is confirmed.
                </p>
              </div>
              <div>
                <Label>Delivery fee (₦)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={productDeliveryFee}
                  onChange={(e) => setProductDeliveryFee(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Released immediately.</p>
              </div>
            </>
          )}

          {agreementType === "supply" && (
            <>
              <div>
                <Label>
                  Supply / materials cost (₦) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={supplyCost}
                  onChange={(e) => setSupplyCost(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Released immediately.</p>
              </div>
              <div>
                <Label>Delivery fee (₦)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={supplyDeliveryFee}
                  onChange={(e) => setSupplyDeliveryFee(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Released immediately.</p>
              </div>
            </>
          )}

          {agreementType === "delivery" && (
            <>
              <div>
                <Label>
                  Pickup location <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <Label>
                  Delivery location <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={dropoffLocation}
                  onChange={(e) => setDropoffLocation(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <Label>
                  Delivery fee (₦) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Released after delivery confirmed.
                </p>
              </div>
            </>
          )}

          {agreementType === "milestone" && (
            <>
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <div>
                  <Label>Milestone 1 description</Label>
                  <Input
                    value={m1Desc}
                    onChange={(e) => setM1Desc(e.target.value)}
                    maxLength={160}
                  />
                </div>
                <div>
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={m1Amt}
                    onChange={(e) => setM1Amt(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <div>
                  <Label>Milestone 2 description</Label>
                  <Input
                    value={m2Desc}
                    onChange={(e) => setM2Desc(e.target.value)}
                    maxLength={160}
                  />
                </div>
                <div>
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={m2Amt}
                    onChange={(e) => setM2Amt(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label>Final payment (₦)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={finalPayment}
                  onChange={(e) => setFinalPayment(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Released after full completion.
                </p>
              </div>
            </>
          )}

          <div>
            <Label>
              {dateLabel} <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>

          {agreementType !== "delivery" && (
            <div>
              <Label>Terms (optional)</Label>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                maxLength={1000}
                rows={2}
              />
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-gradient-tri mb-1">
              Payment summary
            </div>
            {agreementType === "service" && mapped.held > 0 && (
              <SummaryRow label="💼 Service Fee" value={mapped.held} />
            )}
            {agreementType === "material_labor" && (
              <>
                {mapped.immediate > 0 && (
                  <SummaryRow label="🧱 Materials (released immediately)" value={mapped.immediate} />
                )}
                {mapped.held > 0 && <SummaryRow label="💼 Service Fee (held)" value={mapped.held} />}
              </>
            )}
            {agreementType === "product_sale" && (
              <>
                {mapped.held > 0 && (
                  <SummaryRow
                    label="📦 Product Price — Held in escrow until delivery confirmed"
                    value={mapped.held}
                  />
                )}
                {mapped.immediate > 0 && (
                  <SummaryRow
                    label="🚚 Delivery Fee — Released immediately"
                    value={mapped.immediate}
                  />
                )}
              </>
            )}
            {agreementType === "delivery" && mapped.held > 0 && (
              <SummaryRow
                label="🚚 Delivery Fee — Goes to rider in full"
                value={mapped.held}
              />
            )}
            {agreementType === "supply" && mapped.immediate > 0 && (
              <SummaryRow label="📦 Supply + Delivery" value={mapped.immediate} />
            )}
            {agreementType === "milestone" && mapped.held > 0 && (
              <SummaryRow label="💼 Milestone Payments (held)" value={mapped.held} />
            )}
            <SummaryRow
              label={"🛡️ EasyMeet Protection Fee" + (commissionLoading ? " • calculating…" : "")}
              value={commission}
              muted
            />
            <SummaryRow label="💳 Paystack Fee" value={fees.paystackFee} muted />
            <div className="border-t border-border/50 my-1" />
            <SummaryRow label="Total you pay" value={fees.totalPaid} bold />
            <SummaryRow label={receiverLabel} value={professionalReceives} accent />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border bg-card/80 backdrop-blur">
          <Button
            onClick={submit}
            disabled={busy}
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[#6C47FF] to-[#8E5BFF] hover:opacity-95 shadow-lg shadow-primary/30"
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editAgreementId ? "Save Changes" : "Send Agreement"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  bold,
  accent,
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`${bold ? "font-bold" : "font-semibold"} ${accent ? "text-accent" : ""}`}>
        {formatNgn(value)}
      </span>
    </div>
  );
}

function AskRoleDialog({
  open,
  onOpenChange,
  otherName,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  otherName: string;
  onChoose: (role: "provider" | "buyer") => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your role in this deal</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you the service provider/seller or the buyer in this conversation with {otherName}?
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onChoose("buyer")}>
            I'm the buyer
          </Button>
          <Button className="bg-gradient-brand" onClick={() => onChoose("provider")}>
            I'm the service provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpenDisputeDialog({
  open,
  onOpenChange,
  orderId,
  conversationId,
  meId,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  conversationId: string | null;
  meId: string;
  onOpened: () => void;
}) {
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 10) return toast.error("Please describe the issue (10+ chars)");
    setBusy(true);
    try {
      const evidenceText = evidence.trim();
      const { error: escrowErr } = await supabase
        .from("escrow")
        .update({
          status: "disputed",
          dispute_reason: reason.trim(),
          dispute_evidence: evidenceText ? [evidenceText] : null,
        })
        .eq("id", orderId);
      if (escrowErr) {
        toast.error(escrowErr.message || "Could not open dispute");
        return;
      }

      // Best-effort: also create a dispute record and attach evidence/snapshot.
      const { data: dispute } = await supabase
        .from("escrow_disputes")
        .insert({ order_id: orderId, opened_by: meId, reason: reason.trim() })
        .select("id")
        .single();
      const disputeId = (dispute as { id: string } | null)?.id;
      if (disputeId && evidenceText) {
        await supabase.from("escrow_dispute_evidence").insert({
          dispute_id: disputeId,
          uploaded_by: meId,
          note: evidenceText,
        });
      }
      if (disputeId && conversationId) {
        await snapshotChatToEvidence(disputeId, conversationId, meId);
      }

      // Auto chat message
      if (conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: meId,
          body: "⚠️ A dispute has been opened. EasyMeet admin will review within 24-48 hours.",
        });
      }

      // Notify admin
      await supabase.from("notifications").insert({
        user_id: "18f810c2-762f-4d66-93a2-48b1be211c8c",
        title: "New Dispute Opened",
        message: "A dispute has been opened for an escrow deal. Please review.",
        type: "dispute",
      });

      toast.success("Dispute submitted successfully");
      onOpened();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error)?.message || "Could not open dispute");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a Dispute</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Explain what went wrong"
            />
          </div>
          <div>
            <Label>Evidence (optional — paste links or notes)</Label>
            <Textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Chat history will be attached automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="bg-destructive text-destructive-foreground"
          >
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit Dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDealDialog({
  open,
  onOpenChange,
  afterPayment,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  afterPayment: boolean;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{afterPayment ? "Cancel & Open Dispute?" : "Cancel this deal?"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {afterPayment
            ? "Cancelling after payment will automatically open a dispute. EasyMeet admin will review and process your refund minus Paystack fees. Are you sure?"
            : "Are you sure you want to cancel this deal? This will end the agreement and both parties will need to start over."}
        </p>
        <div>
          <Label>Reason {afterPayment ? "" : "(optional)"}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Briefly explain why"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Go Back
          </Button>
          <Button
            onClick={() => onConfirm(reason)}
            disabled={busy || (afterPayment && reason.trim().length < 3)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {afterPayment ? "Yes, Open Dispute" : "Yes, Cancel Deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
