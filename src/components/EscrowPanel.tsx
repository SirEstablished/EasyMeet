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
} from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { detectEscrowRoles, suggestAgreement } from "@/lib/escrow-ai.functions";

interface Props {
  conversationId: string;
  meId: string;
  myEmail: string;
  other: Profile | null | undefined;
  meRole: string | undefined;
  refreshKey?: number;
}

const STAGES = [
  "Negotiate",
  "Agreement",
  "Pay into Escrow",
  "Work in Progress",
  "Mark Complete",
  "Released",
];

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
    title: (row.title as string | undefined) ?? (row.service_title as string | undefined) ?? "Order",
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
  const [hidden, setHidden] = useState(false);
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
  const readFreshAfter = (): number => {
    if (typeof window === "undefined") return 0;
    const v = window.localStorage.getItem(freshDealKey);
    const n = v ? Date.parse(v) : 0;
    return Number.isFinite(n) ? n : 0;
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
      const [{ data: ag }, { data: latestEscrow }] = await Promise.all([
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
      const agObj = (ag as ServiceAgreement) ?? null;
      const escrowRaw = latestEscrow as Record<string, unknown> | null;
      let odObj = escrowFromLatestRow(escrowRaw);

      // Fix #1: ignore any escrow record that predates a "fresh deal" cutoff
      // (set when Start New Deal is clicked) OR that was superseded by a
      // newer service_agreement. An old cancelled/released escrow must not
      // bleed through onto a brand-new deal.
      if (odObj) {
        const freshAfter = readFreshAfter();
        const escrowTs = Date.parse(
          (escrowRaw?.cancelled_at as string | undefined) ??
            (escrowRaw?.released_at as string | undefined) ??
            odObj.created_at ??
            "",
        );
        const agTs = agObj ? Date.parse(agObj.created_at) : 0;
        const terminal =
          odObj.status === "cancelled" ||
          odObj.status === "released" ||
          odObj.status === "completed" ||
          odObj.status === "refunded";
        const supersededByAgreement = terminal && agTs > 0 && escrowTs > 0 && agTs > escrowTs;
        const supersededByFreshDeal = freshAfter > 0 && escrowTs > 0 && freshAfter >= escrowTs;
        // Never suppress a cancelled escrow — it is the source of truth and
        // MUST render for both parties (Realtime + page refresh) regardless
        // of any local "Start New Deal" cutoff one side may have set.
        if (odObj.status !== "cancelled" && (supersededByAgreement || supersededByFreshDeal)) {
          odObj = null;
        }
      }

      latestEscrowStatusRef.current = odObj?.status ?? null;
      setLoadedConversationId(conversationId);

      if (odObj?.status === "cancelled") {
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
        setAgreement(agObj);
        setOrder(odObj);
        setLoading(false);
        return;
      }

      // Gate the agreement by the fresh-deal cutoff so a stale cancelled
      // agreement (pre-payment cancel path) doesn't reappear after refresh.
      let nextAgreement = agObj && agObj.id === dismissedAgreementIdRef.current ? null : agObj;
      if (nextAgreement && nextAgreement.status === "cancelled") {
        const freshAfter = readFreshAfter();
        const agTs = Date.parse(nextAgreement.created_at);
        if (freshAfter > 0 && agTs > 0 && freshAfter >= agTs) nextAgreement = null;
      }
      setAgreement(nextAgreement);
      setOrder((prev) => {
        const next = odObj && odObj.id === dismissedOrderIdRef.current ? null : odObj;
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
  }, [agreement, conversationId, loadedConversationId, loading, meId, meRole, order?.status, other, roleRefreshKey]);

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
      window.localStorage.setItem(freshDealKey, new Date().toISOString());
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

  const payEscrow = async () => {
    setPaying(true);
    try {
      const paymentAgreement = await getLatestAcceptedAgreement();
      if (!paymentAgreement) {
        toast.error("No accepted agreement found for this conversation");
        return;
      }
      const reference = await payWithPaystack({
        email: myEmail,
        amountNgn: paymentAgreement.price,
        metadata: { agreement_id: paymentAgreement.id, kind: "escrow_service" },
      });
      const p_conversation_id = conversationId;
      const p_agreement_id = paymentAgreement.id;
      const p_customer_id = meId;
      const p_provider_id = paymentAgreement.sender_id;
      const p_amount = paymentAgreement.price;
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
        payout_amount: paymentAgreement.price,
        status: "holding",
        stage: "work_in_progress",
        payment_ref: reference.reference,
        paystack_reference: reference.reference,
      };
      setShowSummary(false);
      setHidden(false);
      setAgreement(paymentAgreement);
      setOrder(paidOrder);

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: `💳 Payment of ${formatNgn(paymentAgreement.price)} placed in escrow. Work can begin.`,
      });
      if (messageError) console.error("Escrow payment message failed", messageError);
      toast.success("Payment held in escrow successfully");
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
      const result = (rpcResult ?? {}) as {
        ok?: boolean;
        commission?: number;
        payout?: number;
        already_released?: boolean;
      };
      const commission = Number(result.commission ?? 0);
      const payout = Number(result.payout ?? order.amount_ngn - commission);
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
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: `✅ Marked as complete. ${formatNgn(payout)} released to professional${commission > 0 ? " (3% labor commission held by EasyMeet)" : ""}.`,
      });
      if (messageError) console.error("Completion message failed", messageError);
      toast.success("Payment released");
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
        : (other?.full_name || other?.username || "the other party");
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
            This deal was cancelled by{" "}
            <span className="font-semibold">{cancellerName}</span>.
          </p>
          {cancelledDate && (
            <p className="text-xs text-muted-foreground mt-1">{cancelledDate}</p>
          )}
          <Button
            size="sm"
            onClick={startNewDeal}
            className="bg-gradient-brand mt-3 w-full sm:w-auto"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Start New Deal
          </Button>
        </div>
      </div>
    );
  }

  if (hidden) {
    return (
      <div className="border-t border-border bg-card/60 backdrop-blur p-3 flex justify-center">
        <Button size="sm" onClick={startNewDeal} className="bg-gradient-brand">
          <Sparkles className="h-3.5 w-3.5 mr-1" /> Start New Deal
        </Button>
      </div>
    );
  }

  if (showSummary && order) {
    return (
      <div className="border-t border-border bg-card/60 backdrop-blur p-3">
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-accent" />
            <span className="font-bold text-sm">Deal Complete!</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount paid</span>
              <span className="font-semibold">{formatNgn(order.amount_ngn)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">EasyMeet commission</span>
              <span className="font-semibold">{formatNgn(order.commission_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Professional received</span>
              <span className="font-semibold text-accent">{formatNgn(order.payout_amount)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                : (other?.full_name || other?.username || "the other party")}
            </span>.
          </p>
          {(order as unknown as { cancelled_at?: string | null })?.cancelled_at && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(
                (order as unknown as { cancelled_at: string }).cancelled_at,
              ).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
          <Button
            size="sm"
            onClick={startNewDeal}
            className="bg-gradient-brand mt-3 w-full sm:w-auto"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Start New Deal
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">

        {/* Stage 2 — provider sends agreement (AI-detected role) */}
        {!isCancelled &&
          iAmProvider === true &&
          !order &&
          (!agreement || agreement.status === "rejected" || agreement.status === "cancelled") && (
            <Button size="sm" onClick={() => setSendOpen(true)} className="bg-gradient-brand">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Send Agreement
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
          <Button size="sm" onClick={payEscrow} disabled={paying} className="bg-gradient-brand">
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
        {!isCancelled && order && (order.status === "holding" || order.status === "in_progress") && (
          <Button size="sm" variant="outline" onClick={() => setDisputeOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-1" /> Open Dispute
          </Button>
        )}

        {(order?.status === "released" || order?.status === "completed") && (
          <span className="text-xs text-accent flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Released {formatNgn(order.payout_amount)}{" "}
            (commission {formatNgn(order.commission_amount)})
          </span>
        )}

        {order?.status === "disputed" && (
          <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Dispute Under Review</span>
            <span className="text-destructive/80">— EasyMeet admin will review within 24–48 hours.</span>
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
          onOpenChange={setSendOpen}
          conversationId={conversationId}
          professionalId={meId}
          customerId={other.id}
          onSent={load}
        />
      )}
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
    </div>
  );
}

function SendAgreementDialog({
  open,
  onOpenChange,
  conversationId,
  professionalId,
  customerId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  professionalId: string;
  customerId: string;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Auto-fill the agreement form from the conversation on open.
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
        setPrice((cur) => cur || (suggestion.price ? String(suggestion.price) : ""));
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

  const submit = async () => {
    const jobTitle = title.trim();
    const jobDescription = description.trim();
    const priceNum = Number(price);
    if (!jobTitle) return toast.error("Job title is required");
    if (!jobDescription) return toast.error("Job description is required");
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      return toast.error("Enter a valid price greater than 0");
    }
    setBusy(true);
    const { error } = await supabase.from("service_agreements").insert({
      conversation_id: conversationId,
      sender_id: professionalId,
      receiver_id: customerId,
      job_title: jobTitle,
      job_description: jobDescription,
      price: priceNum,
      terms: terms.trim() || null,
      status: "pending",
    });
    if (!error) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: professionalId,
        body: `📄 Agreement sent: "${jobTitle}" — ${formatNgn(priceNum)}. Please review and accept.`,
      });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Agreement sent");
    onSent();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Send Service Agreement
            {suggesting && (
              <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI drafting…
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>
              Job title <span className="text-destructive">*</span>
            </Label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div>
            <Label>
              Job description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div>
            <Label>
              Price (NGN) <span className="text-destructive">*</span>
            </Label>
            <Input
              required
              type="number"
              min="1"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <Label>Terms (optional)</Label>
            <Textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-gradient-brand">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
