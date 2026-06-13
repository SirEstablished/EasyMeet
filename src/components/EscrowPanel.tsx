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
import {
  Loader2,
  Shield,
  FileText,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";
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
    if (!other) return;
    // Customers can NEVER be the service provider.
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
        if (result.providerId && result.confidence >= 0.6) {
          setIAmProvider(result.providerId === meId);
        } else {
          setAskRoleOpen(true);
        }
      } catch {
        if (!cancelled) setAskRoleOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, meId, meRole, other]);

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
      let v: Awaited<ReturnType<typeof verifyPaystackTransaction>>;
      try {
        v = await verifyPaystackTransaction({
          data: { reference: res.reference, expectedAmountNgn: agreement.price },
        });
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Verification request failed");
      }
      if (!v.ok) {
        toast.error(v.message || "Payment not verified");
        return;
      }
      // Single RPC call atomically creates the order + escrow row and notifies
      // the provider. Commission remains zero until the customer completes the job.
      const { data: insertedEscrow, error } = await supabase.rpc("create_escrow_payment", {
        p_conversation_id: conversationId,
        p_agreement_id: agreement.id,
        p_customer_id: meId,
        p_provider_id: agreement.sender_id,
        p_amount: agreement.price,
        p_payment_ref: res.reference,
      });
      if (error || !insertedEscrow) {
        console.error("create_escrow_payment failed", error);
        toast.error(
          error?.message
            ? `Payment received but escrow record failed: ${error.message}`
            : "Payment received but escrow record failed. Contact support.",
        );
        return;
      }
      // Optimistically reflect new state so the Pay button hides immediately
      // and Mark Complete / Open Dispute appear without waiting for refetch.
      const optimisticOrder = Array.isArray(insertedEscrow) ? insertedEscrow[0] : insertedEscrow;
      if (!optimisticOrder) throw new Error("Escrow payment was created without a record");
      const paidOrder = {
        ...(optimisticOrder as EscrowOrder),
        commission_amount: 0,
        payout_amount: agreement.price,
        status: "holding" as const,
      };
      setOrder(paidOrder);
      const { error: escrowResetError } = await supabase
        .from("escrow")
        .update({ commission_amount: 0, payout_amount: agreement.price })
        .eq("id", paidOrder.id);
      if (escrowResetError) console.error("Could not reset escrow commission", escrowResetError);
      if (paidOrder.order_id) {
        const { error: orderResetError } = await supabase
          .from("orders")
          .update({ commission_amount: 0 })
          .eq("id", paidOrder.order_id);
        if (orderResetError) console.error("Could not reset order commission", orderResetError);
      }

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: `💳 Payment of ${formatNgn(agreement.price)} placed in escrow. Work can begin.`,
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
      const laborAmount =
        order.labor_amount ?? Math.max(order.amount_ngn - (order.materials_amount ?? 0), 0);
      const commission = Math.round(laborAmount * 0.03 * 100) / 100;
      const payout = Math.round((order.amount_ngn - commission) * 100) / 100;
      const completedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("escrow")
        .update({
          status: "completed",
          commission_amount: commission,
          payout_amount: payout,
          released_at: completedAt,
        })
        .eq("id", order.id)
        .eq("customer_id", meId)
        .in("status", ["holding", "in_progress"])
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message || "Could not release payment");
      if (order.order_id) {
        const { error: orderError } = await supabase
          .from("orders")
          .update({ status: "completed", commission_amount: commission })
          .eq("id", order.order_id);
        if (orderError) throw orderError;
      }
      const completed = data as EscrowOrder;
      setOrder(completed);
      setCompleteOpen(false);
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: meId,
        body: `✅ Marked as complete. ${formatNgn(completed.payout_amount)} released to professional (3% labor commission held by EasyMeet).`,
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

      {agreement && (
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

      <div className="flex flex-wrap gap-2">
        {/* Stage 2 — provider sends agreement (AI-detected role) */}
        {iAmProvider === true &&
          !order &&
          (!agreement || agreement.status === "rejected" || agreement.status === "cancelled") && (
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
            {paying ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-1" />
            )}
            Pay into Escrow ({formatNgn(agreement.price)})
          </Button>
        )}

        {/* Stage 5 — customer marks complete */}
        {order &&
          order.customer_id === meId &&
          (order.status === "holding" || order.status === "in_progress") && (
            <Button
              size="sm"
              onClick={() => setCompleteOpen(true)}
              disabled={busy}
              className="bg-gradient-brand"
            >
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
            <CheckCircle2 className="h-3.5 w-3.5" /> Released {formatNgn(order.payout_amount)}{" "}
            (commission {formatNgn(order.commission_amount)})
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
      {askRoleOpen && other && (
        <AskRoleDialog
          open={askRoleOpen}
          onOpenChange={setAskRoleOpen}
          otherName={other.full_name ?? other.username ?? "the other person"}
          onChoose={(role) => {
            setIAmProvider(role === "provider");
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
            Are you sure this job has been completed to your satisfaction? Please note that EasyMeet
            will not be held responsible if you mark a job as complete without verifying the work
            first. Once confirmed, payment will be released to the professional immediately and
            cannot be reversed.
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
