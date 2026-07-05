import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn, type Order } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Star, CheckCircle2, XCircle, Shield } from "lucide-react";
import { ReviewOrderDialog } from "@/components/ReviewOrderDialog";
import { RequestRefundDialog } from "@/components/RequestRefundDialog";
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

type OrderWithEscrow = Order & {
  escrow?: EscrowOrder | null;
  customer?: Order["customer"];
};

function MyOrdersPage() {
  const { user, profile } = useAuth();
  const isCustomer = profile?.role === "customer";
  const [outgoing, setOutgoing] = useState<OrderWithEscrow[]>([]);
  const [incoming, setIncoming] = useState<OrderWithEscrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Order | null>(null);
  const [completing, setCompleting] = useState<OrderWithEscrow | null>(null);
  const [refunding, setRefunding] = useState<OrderWithEscrow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [
        { data: allData, error: allError },
        { data: revData, error: revError },
        { data: prodRevData, error: prodRevError },
      ] = await Promise.all([
          supabase
            .from("orders")
            .select("*")
            .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
            .order("created_at", { ascending: false }),
          supabase.from("reviews").select("order_id").eq("reviewer_id", user.id),
          supabase.from("product_reviews").select("product_id").eq("reviewer_id", user.id),
        ]);
      if (allError) throw allError;
      if (revError) throw revError;
      if (prodRevError) throw prodRevError;
      const rows = (allData ?? []) as Order[];
      const outData = rows.filter((o) => o.customer_id === user.id);
      const inData = isCustomer ? [] : rows.filter((o) => o.provider_id === user.id);

      const outOrderIds = (outData ?? []).map((o) => o.id);
      const inOrderIds = (inData ?? []).map((o) => o.id);
      const allOrderIds = [...new Set([...outOrderIds, ...inOrderIds])];
      const allProviderIds = [
        ...new Set([...(outData ?? []).map((o) => o.provider_id), ...(inData ?? []).map((o) => o.provider_id)]),
      ];
      const allCustomerIds = [
        ...new Set([...(outData ?? []).map((o) => o.customer_id), ...(inData ?? []).map((o) => o.customer_id)]),
      ];

      const [{ data: providers }, { data: customers }, { data: escrowData }] = await Promise.all([
        allProviderIds.length > 0
          ? supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", allProviderIds)
          : Promise.resolve({ data: [] }),
        allCustomerIds.length > 0
          ? supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", allCustomerIds)
          : Promise.resolve({ data: [] }),
        allOrderIds.length > 0
          ? supabase.from("escrow").select("*").in("order_id", allOrderIds)
          : Promise.resolve({ data: [] }),
      ]);

      const providerMap = new Map((providers ?? []).map((p: any) => [p.id, p]));
      const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
      const escrowMap = new Map((escrowData ?? []).map((e: any) => [e.order_id, e]));

      const enrich = (o: Order): OrderWithEscrow => ({
        ...o,
        provider: providerMap.get(o.provider_id) ?? null,
        customer: customerMap.get(o.customer_id) ?? null,
        escrow: escrowMap.get(o.id) ?? null,
      });

      const outgoingOrders = (outData ?? []).map(enrich);
      const incomingOrders = (inData ?? []).map(enrich);
      setOutgoing(outgoingOrders);
      setIncoming(incomingOrders);

      // Best-effort: keep order.escrow_status in sync. RLS may block this for
      // some roles (e.g. customers) so failures must NOT crash the page.
      const escrowOrders = [...outgoingOrders, ...incomingOrders].filter((order) => {
        const escrow = order.escrow;
        return (
          escrow &&
          ((order as OrderWithEscrow & { escrow_status?: string }).escrow_status !== escrow.status ||
            (order as OrderWithEscrow & { escrow_stage?: string }).escrow_stage !== escrow.stage)
        );
      });
      void Promise.allSettled(
        escrowOrders.map(async (order) => {
          const escrow = order.escrow;
          if (!escrow) return;
          await supabase
            .from("orders")
            .update({ escrow_status: escrow.status, escrow_stage: escrow.stage })
            .eq("id", order.id);
        }),
      );
      const reviewedOrderIds = new Set<string>(
        ((revData as { order_id: string | null }[]) ?? [])
          .map((r) => r.order_id)
          .filter((id): id is string => !!id),
      );
      const reviewedProductIds = new Set<string>(
        ((prodRevData as { product_id: string | null }[]) ?? [])
          .map((r) => r.product_id)
          .filter((id): id is string => !!id),
      );
      for (const o of outgoingOrders) {
        if (o.product_id && reviewedProductIds.has(o.product_id)) {
          reviewedOrderIds.add(o.id);
        }
      }
      setReviewedOrders(reviewedOrderIds);
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
      const { error: rpcError } = await supabase.rpc("release_escrow_payment" as never, {
        p_escrow_id: o.escrow.id,
        p_order_id: o.id,
      } as never);
      if (rpcError) throw rpcError;

      const patchOrder = (x: OrderWithEscrow): OrderWithEscrow =>
        x.id === o.id
          ? {
              ...x,
              status: "completed",
              escrow_status: "released",
              escrow_stage: "completed",
              escrow: x.escrow
                ? { ...x.escrow, status: "released", stage: "completed" }
                : x.escrow,
            }
          : x;
      setOutgoing((cur) => cur.map(patchOrder));
      setIncoming((cur) => cur.map(patchOrder));
      setCompleting(null);
      toast.success("Payment released successfully! 🎉");
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
        <Tabs defaultValue={isCustomer ? "outgoing" : "incoming"} className="mt-6">
          <TabsList className={`grid w-full sm:w-auto ${isCustomer ? "grid-cols-1" : "grid-cols-2"}`}>
            {!isCustomer && (
              <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
            )}
            <TabsTrigger value="outgoing">My Purchases ({outgoing.length})</TabsTrigger>
          </TabsList>
          {!isCustomer && (
            <TabsContent value="incoming" className="mt-4">
              <OrderList
                orders={incoming}
                direction="incoming"
                reviewedOrders={reviewedOrders}
                onReview={setReviewing}
                onUpdateStatus={updateStatus}
                onMarkComplete={setCompleting}
                busyId={busyId}
                currentUserId={user?.id ?? null}
              />
            </TabsContent>
          )}
          <TabsContent value="outgoing" className="mt-4">
            <OrderList
              orders={outgoing}
              direction="outgoing"
              reviewedOrders={reviewedOrders}
              onReview={setReviewing}
              onMarkComplete={setCompleting}
              onRequestRefund={setRefunding}
              busyId={busyId}
              currentUserId={user?.id ?? null}
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
          onSubmitted={() => setReviewedOrders((cur) => new Set(cur).add(reviewing.id))}
        />
      )}

      {refunding && refunding.escrow && (
        <RequestRefundDialog
          open={!!refunding}
          onOpenChange={(v) => !v && setRefunding(null)}
          orderId={refunding.id}
          escrowId={refunding.escrow.id}
          amount={Number(refunding.escrow.amount_ngn ?? refunding.amount ?? 0)}
          serviceTitle={refunding.service_title}
          customerName={
            refunding.customer?.full_name || refunding.customer?.username || profile?.full_name || "Customer"
          }
          onSubmitted={() => {
            setOutgoing((cur) =>
              cur.map((x) =>
                x.id === refunding.id
                  ? {
                      ...x,
                      status: "refund_requested" as unknown as Order["status"],
                      escrow: x.escrow ? { ...x.escrow, refund_status: "processing" } : x.escrow,
                    }
                  : x,
              ),
            );
          }}
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
  reviewedOrders,
  onReview,
  onUpdateStatus,
  onMarkComplete,
  onRequestRefund,
  busyId,
  currentUserId,
}: {
  orders: OrderWithEscrow[];
  direction: "incoming" | "outgoing";
  reviewedOrders: Set<string>;
  onReview: (o: Order) => void;
  onUpdateStatus?: (o: Order, status: Order["status"]) => void;
  onMarkComplete: (o: OrderWithEscrow) => void;
  onRequestRefund?: (o: OrderWithEscrow) => void;
  busyId: string | null;
  currentUserId: string | null;
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
            <Link to="/explore" className="text-primary font-medium">
              Browse professionals
            </Link>{" "}
            to get started.
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
        const other = direction === "outgoing" ? o.provider : o.customer;
        const otherId = direction === "outgoing" ? o.provider_id : o.customer_id;
        const name =
          other?.full_name ||
          other?.username ||
          (direction === "outgoing" ? "Provider" : "Customer");
        const initials = name
          .split(" ")
          .map((s: string) => s[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();

        const isEscrow = !!o.escrow;
        const escrowStatus = o.escrow?.status;
        const orderStatus = o.status as unknown as string;
        const orderEscrowStatus = (o as OrderWithEscrow & { escrow_status?: string }).escrow_status;
        const alreadyRequested =
          orderStatus === "refund_requested" ||
          (!!o.escrow?.refund_status && o.escrow.refund_status !== "none");
        const isCancelled =
          escrowStatus === "cancelled" ||
          orderEscrowStatus === "cancelled" ||
          orderStatus === "cancelled";
        const hasPayment = !!o.escrow?.payment_ref || !!o.payment_ref;
        const canRequestRefund =
          direction === "outgoing" &&
          !!currentUserId &&
          o.customer_id === currentUserId &&
          isCancelled &&
          hasPayment &&
          !alreadyRequested;
        const canMarkComplete =
          direction === "outgoing" &&
          !!currentUserId &&
          o.customer_id === currentUserId &&
          isEscrow &&
          escrowStatus === "holding" &&
          o.escrow?.stage === "work_in_progress";

        const showLeaveReview =
          direction === "outgoing" &&
          !canMarkComplete &&
          (o.status === "completed" || escrowStatus === "released");

        return (
          <div
            key={o.id}
            className="rounded-2xl glass-card p-4 flex flex-wrap items-center gap-4 lift-hover hover:-translate-y-0.5 hover:border-primary/50"
          >
            <Link to="/profile/$id" params={{ id: otherId }}>
              <span className="avatar-ring">
                <Avatar className="h-12 w-12 border-2 border-background">
                  <AvatarImage src={other?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
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
              <div className="text-xs text-muted-foreground truncate">
                {name} · {new Date(o.created_at).toLocaleDateString()}
              </div>
              {o.payment_ref && (
                <div className="text-[10px] text-muted-foreground truncate">
                  Ref: {o.payment_ref}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-extrabold text-gradient-brand">{formatNgn(o.amount)}</div>
              {(() => {
                const effective =
                  escrowStatus === "cancelled" || o.status === "cancelled"
                    ? "cancelled"
                    : escrowStatus === "released" || escrowStatus === "completed" || o.status === "completed"
                      ? "completed"
                      : escrowStatus === "holding" || escrowStatus === "in_progress" || o.status === "confirmed"
                        ? "in_escrow"
                        : escrowStatus === "disputed"
                          ? "disputed"
                          : escrowStatus === "refunded"
                            ? "refunded"
                            : "pending";
                const label =
                  effective === "in_escrow"
                    ? "In Escrow"
                    : effective === "completed"
                      ? "Completed"
                      : effective === "cancelled"
                        ? "Cancelled"
                        : effective === "disputed"
                          ? "Disputed"
                          : effective === "refunded"
                            ? "Refunded"
                            : "Pending";
                const cls =
                  effective === "in_escrow"
                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                    : effective === "completed"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : effective === "cancelled"
                        ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                        : effective === "disputed"
                          ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                          : effective === "refunded"
                            ? "bg-muted text-muted-foreground border border-border"
                            : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30";
                return (
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
                    {label}
                  </span>
                );
              })()}
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

            {canRequestRefund && onRequestRefund && (
              <div className="basis-full">
                <Button
                  size="sm"
                  onClick={() => onRequestRefund(o)}
                  className="rounded-full bg-gradient-brand"
                >
                  Request Refund
                </Button>
              </div>
            )}

            {direction === "outgoing" && alreadyRequested && (
              <div className="basis-full text-xs text-muted-foreground">
                Refund requested — Paystack fee will be deducted. 3–5 business days.
              </div>
            )}

            {direction === "incoming" &&
              onUpdateStatus &&
              !isEscrow &&
              (o.status === "confirmed" || o.status === "pending") && (
                <div className="basis-full flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUpdateStatus(o, "completed")}
                    className="rounded-full"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Completed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onUpdateStatus(o, "cancelled")}
                    className="text-destructive"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                </div>
              )}

            {showLeaveReview &&
              (reviewedOrders.has(o.id) ? (
                <div className="basis-full text-xs text-accent font-medium">
                  ✓ Thanks for your review!
                </div>
              ) : (
                <Button
                  size="sm"
                  className="basis-full sm:basis-auto rounded-full bg-gradient-brand glow-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    onReview(o);
                  }}
                >
                  <Star className="h-3.5 w-3.5 mr-1" /> Leave a Review
                </Button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
