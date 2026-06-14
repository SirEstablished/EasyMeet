import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { type EscrowOrder, escrowFromJoinedOrder, snapshotChatToEvidence } from "@/lib/escrow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, CheckCircle2, AlertTriangle, RefreshCcw, Loader2 } from "lucide-react";
import { refundPaystackTransaction } from "@/lib/paystack.functions";

const STAGE_LABEL: Record<EscrowOrder["status"], string> = {
  pending_payment: "Awaiting payment",
  holding: "In escrow",
  in_progress: "In progress",
  released: "Released",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export function EscrowOrdersSection() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<EscrowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [disputing, setDisputing] = useState<EscrowOrder | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [completing, setCompleting] = useState<EscrowOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("orders")
      .select("*, escrow!inner(*)")
      .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    setOrders(((data ?? []).map(escrowFromJoinedOrder).filter(Boolean) as EscrowOrder[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
    const ch = supabase
      .channel(`escrow-my-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, load]);

  const markComplete = async (o: EscrowOrder) => {
    setBusyId(o.id);
    try {
      const laborAmount = o.labor_amount ?? Math.max(o.amount_ngn - (o.materials_amount ?? 0), 0);
      const commission = laborAmount >= 5000 ? Math.round(laborAmount * 0.03 * 100) / 100 : 0;
      const payout = Math.round((o.amount_ngn - commission) * 100) / 100;
      const { error } = await supabase
        .from("escrow")
        .update({
          status: "completed",
          commission_amount: commission,
          payout_amount: payout,
          released_at: new Date().toISOString(),
        })
        .eq("id", o.id)
        .eq("customer_id", user?.id ?? "")
        .in("status", ["holding", "in_progress"]);
      if (error) throw error;
      if (o.order_id) {
        const { error: orderError } = await supabase
          .from("orders")
          .update({ status: "completed", commission_amount: commission })
          .eq("id", o.order_id);
        if (orderError) throw orderError;
      }
      setOrders((current) =>
        current.map((item) =>
          item.id === o.id
            ? {
                ...item,
                status: "completed",
                commission_amount: commission,
                payout_amount: payout,
                released_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      setCompleting(null);
      toast.success("Marked complete — payment released to seller");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release payment");
    } finally {
      setBusyId(null);
    }
  };

  const startRefund = async (o: EscrowOrder) => {
    if (!o.paystack_reference) return toast.error("No payment reference");
    setBusyId(o.id);
    const r = await refundPaystackTransaction({
      data: { reference: o.paystack_reference, amountNgn: o.amount_ngn },
    });
    if (!r.ok) {
      setBusyId(null);
      return toast.error(r.message || "Refund failed");
    }
    await supabase
      .from("escrow")
      .update({
        refund_status: "processing",
        refund_amount: r.refundAmountNgn ?? o.amount_ngn,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", o.id);
    setBusyId(null);
    setRefundOpen(true);
    load();
  };

  if (loading) return null;
  if (orders.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-gradient-tri">Escrow Orders</h2>
      </div>
      <div className="space-y-3">
        {orders.map((o) => {
          const isCustomer = user?.id === o.customer_id;
          const refundEligible =
            isCustomer && o.status === "cancelled" && !o.refund_status && !!o.paystack_reference;
          return (
            <div key={o.id} className="rounded-2xl glass-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{o.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.kind} · {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-gradient-brand">
                    {formatNgn(o.amount_ngn)}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {STAGE_LABEL[o.status]}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isCustomer && (o.status === "holding" || o.status === "in_progress") && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setCompleting(o)}
                      disabled={busyId === o.id}
                      className="bg-gradient-brand"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Complete
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDisputing(o)}>
                      <AlertTriangle className="h-4 w-4 mr-1" /> Open Dispute
                    </Button>
                  </>
                )}
                {!isCustomer && (o.status === "holding" || o.status === "in_progress") && (
                  <Button size="sm" variant="outline" onClick={() => setDisputing(o)}>
                    <AlertTriangle className="h-4 w-4 mr-1" /> Open Dispute
                  </Button>
                )}
                {refundEligible && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startRefund(o)}
                    disabled={busyId === o.id}
                  >
                    {busyId === o.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4 mr-1" />
                    )}
                    Request Refund
                  </Button>
                )}
                {o.status === "completed" && !isCustomer && (
                  <span className="text-xs text-accent">
                    Payout {formatNgn(o.payout_amount)} (commission {formatNgn(o.commission_amount)}
                    )
                  </span>
                )}
                {o.refund_status && (
                  <span className="text-xs text-muted-foreground capitalize">
                    Refund: {o.refund_status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {disputing && (
        <DisputeDialog order={disputing} onClose={() => setDisputing(null)} onOpened={load} />
      )}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund processing</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Your refund is being processed. Please note that a small percentage will be deducted as
            per Paystack and EasyMeet policy. Refunds take 3-5 business days.
          </p>
          <DialogFooter>
            <Button onClick={() => setRefundOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(completing)} onOpenChange={(open) => !open && setCompleting(null)}>
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
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Go Back
            </Button>
            <Button
              onClick={() => completing && markComplete(completing)}
              disabled={!completing || busyId === completing.id}
              className="bg-gradient-brand"
            >
              {completing && busyId === completing.id && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Yes, Release Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DisputeDialog({
  order,
  onClose,
  onOpened,
}: {
  order: EscrowOrder;
  onClose: () => void;
  onOpened: () => void;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user || reason.trim().length < 10)
      return toast.error("Please describe the issue (10+ chars)");
    setBusy(true);
    const { data: dispute, error } = await supabase
      .from("escrow_disputes")
      .insert({ order_id: order.id, opened_by: user.id, reason: reason.trim() })
      .select("id")
      .single();
    if (error || !dispute) {
      setBusy(false);
      return toast.error(error?.message || "Could not open dispute");
    }
    await supabase.from("escrow").update({ status: "disputed" }).eq("id", order.id);
    if (evidence.trim()) {
      await supabase.from("escrow_dispute_evidence").insert({
        dispute_id: (dispute as { id: string }).id,
        uploaded_by: user.id,
        note: evidence.trim(),
      });
    }
    if (order.conversation_id) {
      await snapshotChatToEvidence((dispute as { id: string }).id, order.conversation_id, user.id);
    }
    setBusy(false);
    toast.success("Dispute opened");
    onOpened();
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open Dispute</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Evidence (optional)</Label>
            <Textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={3}
              placeholder="Paste links or notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="bg-destructive text-destructive-foreground"
          >
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
