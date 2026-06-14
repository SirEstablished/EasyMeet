import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn, type Order } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Star, CheckCircle2, XCircle, Shield } from "lucide-react";
import { ReviewOrderDialog } from "@/components/ReviewOrderDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveData } from "@/hooks/use-live-data";
import { toast } from "sonner";
import { type EscrowOrder } from "@/lib/escrow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/my-orders")({
  component: MyOrdersPage,
});

type OrderWithEscrow = Order & { escrow?: EscrowOrder | null };
type JoinedOrder = Order & {
  escrow?: EscrowOrder | EscrowOrder[] | null;
  customer?: Order["customer"];
};

function MyOrdersPage() {
  const { user, profile } = useAuth();
  const isCustomer = profile?.role === "customer";
  const [outgoing, setOutgoing] = useState<OrderWithEscrow[]>([]);
  const [incoming, setIncoming] = useState<OrderWithEscrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewedProviders, setReviewedProviders] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Order | null>(null);
  const [completing, setCompleting] = useState<OrderWithEscrow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [
        { data: outData, error: outError },
        inResult,
        { data: revData, error: revError },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("*, provider:provider_id(id, full_name, username, avatar_url), escrow(*)")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        isCustomer
          ? Promise.resolve({ data: [] as Order[] })
          : supabase
              .from("orders")
              .select(
                "*, customer:customer_id(id, full_name, username, avatar_url), provider:provider_id(id, full_name, username, avatar_url), escrow(*)",
              )
              .eq("provider_id", user.id)
              .order("created_at", { ascending: false }),
        supabase.from("reviews").select("professional_id").eq("reviewer_id", user.id),
      ]);
      if (outError) throw outError;
      if ("error" in inResult && inResult.error) throw inResult.error;
      if (revError) throw revError;
      const inData = inResult.data;

      const mapOrders = (data: JoinedOrder[] | null) =>
        (data ?? []).map((o) => ({
          ...o,
          escrow: Array.isArray(o.escrow) ? (o.escrow[0] ?? null) : (o.escrow ?? null),
        })) as OrderWithEscrow[];

      const outgoingOrders = mapOrders(outData);
      const incomingOrders = mapOrders(inData);
      setOutgoing(outgoingOrders);
      setIncoming(incomingOrders);
      const escrowOrders = [...outgoingOrders, ...incomingOrders].filter((order) => {
        const escrow = order.escrow;
        return (
          escrow &&
          ((order as OrderWithEscrow & { escrow_status?: string }).escrow_status !==
            escrow.status ||
            (order as OrderWithEscrow & { escrow_stage?: string }).escrow_stage !== escrow.stage)
        );
      });
      await Promise.all(
        escrowOrders.map(async (order) => {
          const escrow = order.escrow;
          if (!escrow) return;
          const { error } = await supabase
            .from("orders")
            .update({ escrow_status: escrow.status, escrow_stage: escrow.stage })
            .eq("id", order.id);
          if (error) throw error;
        }),
      );
      setReviewedProviders(
        new Set(((revData as { professional_id: string }[]) ?? []).map((r) => r.professional_id)),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [user, isCustomer]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);

  useLiveData(["orders", "reviews", "escrow"], load);

  const updateStatus = async (o: Order, status: Order["status"]) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) return toast.error(error.message);
    setIncoming((cur) => cur.map((x) => (x.id === o.id ? { ...x, status } : x)));
    toast.success(`Marked as ${status}`);
  };

  const markEscrowComplete = async (o: OrderWithEscrow) => {
    if (!o.escrow || !user) return;
    setBusyId(o.id);
    try {
      const laborAmount = o.escrow.labor_amount ?? 0;
      const commission = laborAmount >= 5000 ? Math.round(laborAmount * 0.03 * 100) / 100 : 0;
      const payout = Math.round((o.escrow.amount_ngn - commission) * 100) / 100;
      const { data: releasedEscrow, error: escrowError } = await supabase
        .from("escrow")
        .update({
          status: "released",
          stage: "completed",
          commission_amount: commission,
          payout_amount: payout,
          released_at: new Date().toISOString(),
        })
        .eq("id", o.escrow.id)
        .eq("customer_id", user.id)
        .eq("status", "holding")
        .eq("stage", "work_in_progress")
        .select("id")
        .maybeSingle();
      if (escrowError || !releasedEscrow) {
        throw new Error(escrowError?.message || "Escrow is no longer ready for release");
      }
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          status: "completed",
          escrow_status: "released",
          escrow_stage: "completed",
          commission_amount: commission,
          payout_amount: payout,
        })
        .eq("id", o.id);
      if (orderError) throw orderError;

      toast.success("Marked complete — payment released to seller");
      setCompleting(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release payment");
    } finally {
      setBusyId(null);
    }
  };

  const title = isCustomer ? "My Orders" : "Orders";
  const subtitle = isCustomer
    ? "Track services and products you've ordered."
    : "Orders coming in and your own purchases.";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-tri">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="incoming" className="mt-6">
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
            <TabsTrigger value="outgoing">My Purchases ({outgoing.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="incoming" className="mt-4">
            <OrderList
              orders={incoming}
              direction="incoming"
              reviewedProviders={reviewedProviders}
              onReview={setReviewing}
              onUpdateStatus={updateStatus}
              onMarkComplete={setCompleting}
              busyId={busyId}
            />
          </TabsContent>
          <TabsContent value="outgoing" className="mt-4">
            <OrderList
              orders={outgoing}
              direction="outgoing"
              reviewedProviders={reviewedProviders}
              onReview={setReviewing}
              onMarkComplete={setCompleting}
              busyId={busyId}
            />
          </TabsContent>
        </Tabs>
      )}

      {reviewing && (
        <ReviewOrderDialog
          open={!!reviewing}
          onOpenChange={(v) => !v && setReviewing(null)}
          providerId={reviewing.provider_id}
          providerName={reviewing.provider?.full_name || reviewing.provider?.username || "Provider"}
          orderId={reviewing.id}
          onSubmitted={() =>
            setReviewedProviders((cur) => new Set(cur).add(reviewing.provider_id))
          }
        />
      )}

      <Dialog open={Boolean(completing)} onOpenChange={(open) => !open && setCompleting(null)}>
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
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Go Back
            </Button>
            <Button
              onClick={() => completing && markEscrowComplete(completing)}
              disabled={!completing || busyId === completing?.id}
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

function OrderList({
  orders,
  direction,
  reviewedProviders,
  onReview,
  onUpdateStatus,
  onMarkComplete,
  busyId,
}: {
  orders: OrderWithEscrow[];
  direction: "incoming" | "outgoing";
  reviewedProviders: Set<string>;
  onReview: (o: Order) => void;
  onUpdateStatus?: (o: Order, status: Order["status"]) => void;
  onMarkComplete: (o: OrderWithEscrow) => void;
  busyId: string | null;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
          <Star className="h-5 w-5" />
        </div>
        {direction === "outgoing" ? (
          <>
            No orders yet.{" "}
            <Link to="/shop" className="text-primary font-medium">Browse the shop</Link> to find professionals.
          </>
        ) : (
          <>No incoming orders yet.</>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const other = direction === "outgoing" ? o.provider : (o as any).customer;
        const otherId = direction === "outgoing" ? o.provider_id : o.customer_id;
        const name = other?.full_name || other?.username || (direction === "outgoing" ? "Provider" : "Customer");
        const initials = name.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
        
        const isEscrow = !!o.escrow;
        const escrowStatus = o.escrow?.status;
        const canMarkComplete =
          direction === "outgoing" &&
          isEscrow &&
          escrowStatus === "holding" &&
          o.escrow?.stage === "work_in_progress";

        return (
          <div key={o.id} className="rounded-2xl glass-card p-4 flex flex-wrap items-center gap-4 lift-hover hover:-translate-y-0.5 hover:border-primary/50">
            <Link to="/profile/$id" params={{ id: otherId }}>
              <span className="avatar-ring">
                <Avatar className="h-12 w-12 border-2 border-background">
                  <AvatarImage src={other?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
              </span>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="font-semibold truncate">{o.service_title}</div>
                {isEscrow && (
                  <span title="Escrow Protected">
                    <Shield className="h-3 w-3 text-primary flex-shrink-0" />
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">{name} · {new Date(o.created_at).toLocaleDateString()}</div>
              {o.payment_ref && (
                <div className="text-[10px] text-muted-foreground truncate">Ref: {o.payment_ref}</div>
              )}
            </div>
            <div className="text-right">
              <div className="font-extrabold text-gradient-brand">{formatNgn(o.amount)}</div>
              <span className={`status-pill status-${isEscrow ? (escrowStatus === 'released' || escrowStatus === 'completed' ? 'completed' : 'pending') : o.status} capitalize mt-1`}>
                {isEscrow ? (escrowStatus === 'released' || escrowStatus === 'completed' ? 'escrow released' : escrowStatus?.replace('_', ' ')) : o.status}
              </span>
            </div>
            
            {canMarkComplete && (
              <div className="basis-full">
                <Button 
                  size="sm" 
                  onClick={() => onMarkComplete(o)} 
                  disabled={busyId === o.id}
                  className="rounded-full bg-gradient-brand"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark as Complete
                </Button>
              </div>
            )}

            {direction === "incoming" && onUpdateStatus && !isEscrow && (o.status === "confirmed" || o.status === "pending") && (
              <div className="basis-full flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onUpdateStatus(o, "completed")} className="rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Completed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onUpdateStatus(o, "cancelled")} className="text-destructive">
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </div>
            )}
            
            {direction === "outgoing" && (o.status === "completed" || escrowStatus === "released" || escrowStatus === "completed") && (
              reviewedProviders.has(o.provider_id) ? (
                <div className="basis-full text-xs text-accent font-medium">
                  ✓ Thanks for your review!
                </div>
              ) : (
                <Button
                  size="sm"
                  className="basis-full sm:basis-auto rounded-full bg-gradient-brand glow-primary"
                  onClick={(e) => { e.preventDefault(); onReview(o); }}
                >
                  <Star className="h-3.5 w-3.5 mr-1" /> Leave a Review
                </Button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
