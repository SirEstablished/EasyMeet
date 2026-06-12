import { useEffect, useState } from "react";
import { supabase, formatNgn, type Profile } from "@/integrations/supabase/client";
import {
  type EscrowOrder,
  type ServiceAgreement,
  escrowFromJoinedOrder,
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
import { Loader2, Shield, FileText, CheckCircle2, AlertTriangle, CreditCard, Sparkles } from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";
import { detectEscrowRoles, suggestAgreement } from "@/lib/escrow-ai.functions";

interface Props {
  conversationId: string;
  meId: string;
  myEmail: string;
  other: Profile | null | undefined;
  meRole: string | undefined;
}

const STAGES = [
  "Negotiate",
  "Agreement",
  "Pay into Escrow",
  "Work in Progress",
  "Mark Complete",
  "Released",
];

export function EscrowPanel({ conversationId, meId, myEmail, other, meRole }: Props) {
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

  const load = async () => {
    const [{ data: ag }, { data: od }] = await Promise.all([
      supabase
        .from("service_agreements")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("*, escrow!inner(*)")
        .eq("escrow.conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setAgreement((ag as ServiceAgreement) ?? null);
    setOrder(escrowFromJoinedOrder(od));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    const ch = supabase
      .channel(`escrow-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_agreements", filter: `conversation_id=eq.${conversationId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "escrow", filter: `conversation_id=eq.${conversationId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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

  const payEscrow = async () => {
    if (!agreement) return;
    setPaying(true);
    try {
      const res = await payWithPaystack({
        email: myEmail,
        amountNgn: agreement.price,
        metadata: { agreement_id: agreement.id, kind: "escrow_service" },
      });
      const v = await verifyPaystackTransaction({
        data: { reference: res.reference, expectedAmountNgn: agreement.price },
      });
      if (!v.ok) {
        toast.error(v.message || "Payment not verified");
        return;
      }
      const { commission, payout } = computeCommission(agreement.price);
      // 1) Insert into orders first to get the order id
      const { data: orderRow, error: orderErr } = await supabase.from("orders").insert({
        customer_id: meId,
        provider_id: agreement.sender_id,
        product_id: null,
        service_id: null,
        kind: "service",
        service_title: agreement.job_title,
        amount: agreement.price,
        commission_amount: commission,
        currency: "NGN",
        notes: agreement.job_description ?? null,
        payment_ref: res.reference,
        payment_status: "paid",
        status: "pending",
      } as never).select("id").single();
      if (orderErr || !orderRow) {
        console.error("orders insert failed", orderErr);
        toast.error(
          orderErr?.message
            ? `Payment received but order record failed: ${orderErr.message}`
            : "Payment received but order record failed. Contact support.",
        );
        return;
      }

      // 2) Insert into escrow with link to the order
      const { data: insertedEscrow, error } = await supabase
        .from("escrow")
        .insert({
          order_id: (orderRow as { id: string }).id,
          kind: "service",
          customer_id: meId,
          professional_id: agreement.sender_id,
          conversation_id: conversationId,
          agreement_id: agreement.id,
          title: agreement.job_title,
          amount_ngn: agreement.price,
          commission_amount: commission,
          payout_amount: payout,
          status: "holding",
          payment_ref: res.reference,
          paystack_reference: res.reference,
          paid_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error || !insertedEscrow) {
        console.error("escrow insert failed", error);
        toast.error(
          error?.message
            ? `Payment received but escrow record failed: ${error.message}`
            : "Payment received but escrow record failed. Contact support.",
        );
        return;
      }
      // Optimistically reflect new state so the Pay button hides immediately
      setOrder(insertedEscrow as EscrowOrder);

      // Notify professional
      const { error: notifyErr } = await supabase.from("notifications").insert({
        user_id: agreement.sender_id,
        recipient_id: agreement.sender_id,
        sender_id: meId,
        type: "escrow_payment_received",
        title: "Payment held in escrow",
        message: `Payment of ${formatNgn(agreement.price)} for "${agreement.job_title}" is held in escrow. You can start the work.`,
        body: `Payment of ${formatNgn(agreement.price)} for "${agreement.job_title}" is held in escrow. You can start the work.`,
        read: false,
      } as never);
      if (notifyErr) console.warn("professional notification failed", notifyErr);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: `💳 Payment of ${formatNgn(agreement.price)} placed in escrow. Work can begin.`,
      });
      toast.success("Funds held in escrow");
      load();
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled") toast.message("Payment cancelled");
      else toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const markComplete = async () => {
    if (!order) return;
    setBusy(true);
    const { error } = await supabase
      .from("escrow")
      .update({ status: "completed", released_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: meId,
      body: `✅ Marked as complete. ${formatNgn(order.payout_amount)} released to professional (3% commission held by EasyMeet).`,
    });
    toast.success("Payment released");
    load();
  };

  if (loading) return null;

  return (
    <div className="border-t border-border bg-card/60 backdrop-blur p-3">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-gradient-tri">
          Escrow — Stage {stage}/6: {STAGES[stage - 1]}
        </span>
        {order && (
          <Badge variant="outline" className="ml-auto text-[10px] capitalize">{order.status.replace("_", " ")}</Badge>
        )}
      </div>

      {agreement && (
        <div className="rounded-lg border border-border/60 p-3 mb-2 bg-background/40">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{agreement.job_title}</div>
              {agreement.job_description && (
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{agreement.job_description}</p>
              )}
              {agreement.terms && (
                <p className="text-[11px] text-muted-foreground mt-1 italic">Terms: {agreement.terms}</p>
              )}
              <div className="mt-1 font-bold text-gradient-brand">{formatNgn(agreement.price)}</div>
            </div>
            <Badge variant="secondary" className="capitalize text-[10px]">{agreement.status}</Badge>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Stage 2 — provider sends agreement (AI-detected role) */}
        {iAmProvider === true && !order && (!agreement || agreement.status === "rejected" || agreement.status === "cancelled") && (
          <Button size="sm" onClick={() => setSendOpen(true)} className="bg-gradient-brand">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Send Agreement
          </Button>
        )}

        {/* Stage 2 — buyer accepts */}
        {iAmProvider === false && agreement?.status === "pending" && !order && (
          <Button size="sm" onClick={acceptAgreement} disabled={busy} className="bg-gradient-brand">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Accept Agreement
          </Button>
        )}

        {/* Stage 3 — pay into escrow */}
        {iAmProvider === false && agreement?.status === "accepted" && !order && (
          <Button size="sm" onClick={payEscrow} disabled={paying} className="bg-gradient-brand">
            {paying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
            Pay into Escrow ({formatNgn(agreement.price)})
          </Button>
        )}

        {/* Stage 5 — customer marks complete */}
        {order && order.customer_id === meId && (order.status === "holding" || order.status === "in_progress") && (
          <Button size="sm" onClick={markComplete} disabled={busy} className="bg-gradient-brand">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Complete & Release
          </Button>
        )}

        {/* Dispute */}
        {order && (order.status === "holding" || order.status === "in_progress") && (
          <Button size="sm" variant="outline" onClick={() => setDisputeOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-1" /> Open Dispute
          </Button>
        )}

        {order?.status === "completed" && (
          <span className="text-xs text-accent flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Released {formatNgn(order.payout_amount)} (commission {formatNgn(order.commission_amount)})
          </span>
        )}

        {order?.status === "disputed" && (
          <span className="text-xs text-destructive">Dispute is under admin review.</span>
        )}

        {order?.status === "refunded" && (
          <span className="text-xs text-muted-foreground">Refunded to customer.</span>
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
          <DialogTitle>Send Service Agreement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Job title <span className="text-destructive">*</span></Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Job description <span className="text-destructive">*</span></Label>
            <Textarea required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
          </div>
          <div>
            <Label>Price (NGN) <span className="text-destructive">*</span></Label>
            <Input required type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label>Terms (optional)</Label>
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={1000} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-gradient-brand">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Send
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
    const { data: dispute, error } = await supabase
      .from("escrow_disputes")
      .insert({ order_id: orderId, opened_by: meId, reason: reason.trim() })
      .select("id")
      .single();
    if (error || !dispute) {
      setBusy(false);
      return toast.error(error?.message || "Could not open dispute");
    }
    await supabase.from("escrow").update({ status: "disputed" }).eq("id", orderId);
    if (evidence.trim()) {
      await supabase.from("escrow_dispute_evidence").insert({
        dispute_id: (dispute as { id: string }).id,
        uploaded_by: meId,
        note: evidence.trim(),
      });
    }
    if (conversationId) {
      await snapshotChatToEvidence((dispute as { id: string }).id, conversationId, meId);
    }
    setBusy(false);
    toast.success("Dispute opened. Admin will review.");
    onOpened();
    onOpenChange(false);
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
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Explain what went wrong" />
          </div>
          <div>
            <Label>Evidence (optional — paste links or notes)</Label>
            <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} maxLength={2000} />
          </div>
          <p className="text-[11px] text-muted-foreground">Chat history will be attached automatically.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-destructive text-destructive-foreground">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit Dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}