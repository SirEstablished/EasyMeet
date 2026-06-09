import { useEffect, useState } from "react";
import { supabase, formatNgn, type Profile } from "@/integrations/supabase/client";
import {
  type EscrowOrder,
  type ServiceAgreement,
  computeCommission,
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
import { Loader2, Shield, FileText, CheckCircle2, AlertTriangle, CreditCard } from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";

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

  const isProfessional = meRole === "professional" || meRole === "business";
  const otherIsCustomer = other?.role === "customer";

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
        .from("escrow_orders")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setAgreement((ag as ServiceAgreement) ?? null);
    setOrder((od as EscrowOrder) ?? null);
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
        { event: "*", schema: "public", table: "escrow_orders", filter: `conversation_id=eq.${conversationId}` },
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
        amountNgn: agreement.price_ngn,
        metadata: { agreement_id: agreement.id, kind: "escrow_service" },
      });
      const v = await verifyPaystackTransaction({
        data: { reference: res.reference, expectedAmountNgn: agreement.price_ngn },
      });
      if (!v.ok) {
        toast.error(v.message || "Payment not verified");
        return;
      }
      const { commission, payout } = computeCommission(agreement.price_ngn);
      const { error } = await supabase.from("escrow_orders").insert({
        kind: "service",
        customer_id: meId,
        professional_id: agreement.professional_id,
        conversation_id: conversationId,
        agreement_id: agreement.id,
        title: agreement.title,
        amount_ngn: agreement.price_ngn,
        commission_amount: commission,
        payout_amount: payout,
        status: "holding",
        paystack_reference: res.reference,
        paid_at: new Date().toISOString(),
      });
      if (error) {
        toast.error("Payment received but escrow record failed. Contact support.");
        return;
      }
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: `💳 Payment of ${formatNgn(agreement.price_ngn)} placed in escrow. Work can begin.`,
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
      .from("escrow_orders")
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
              <div className="font-semibold text-sm">{agreement.title}</div>
              {agreement.description && (
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{agreement.description}</p>
              )}
              {agreement.terms && (
                <p className="text-[11px] text-muted-foreground mt-1 italic">Terms: {agreement.terms}</p>
              )}
              <div className="mt-1 font-bold text-gradient-brand">{formatNgn(agreement.price_ngn)}</div>
            </div>
            <Badge variant="secondary" className="capitalize text-[10px]">{agreement.status}</Badge>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Stage 2 — professional sends agreement */}
        {isProfessional && otherIsCustomer && !order && (!agreement || agreement.status === "rejected" || agreement.status === "cancelled") && (
          <Button size="sm" onClick={() => setSendOpen(true)} className="bg-gradient-brand">
            <FileText className="h-4 w-4 mr-1" /> Send Agreement
          </Button>
        )}

        {/* Stage 2 — customer accepts */}
        {!isProfessional && agreement?.status === "pending" && !order && (
          <Button size="sm" onClick={acceptAgreement} disabled={busy} className="bg-gradient-brand">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Accept Agreement
          </Button>
        )}

        {/* Stage 3 — pay into escrow */}
        {!isProfessional && agreement?.status === "accepted" && !order && (
          <Button size="sm" onClick={payEscrow} disabled={paying} className="bg-gradient-brand">
            {paying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
            Pay into Escrow ({formatNgn(agreement.price_ngn)})
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
    const p = Number(price);
    if (!title.trim() || !(p > 0)) return toast.error("Enter title and a valid price");
    setBusy(true);
    const { error } = await supabase.from("service_agreements").insert({
      conversation_id: conversationId,
      professional_id: professionalId,
      customer_id: customerId,
      title: title.trim(),
      description: description.trim() || null,
      price_ngn: p,
      terms: terms.trim() || null,
      status: "pending",
    });
    if (!error) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: professionalId,
        body: `📄 Agreement sent: "${title.trim()}" — ${formatNgn(p)}. Please review and accept.`,
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
            <Label>Job title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Details</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
          </div>
          <div>
            <Label>Price (NGN)</Label>
            <Input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} />
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
    await supabase.from("escrow_orders").update({ status: "disputed" }).eq("id", orderId);
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