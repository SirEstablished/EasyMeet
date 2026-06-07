import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, formatNgn, type Order } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Star, CheckCircle2, XCircle } from "lucide-react";
import { ReviewOrderDialog } from "@/components/ReviewOrderDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveData } from "@/hooks/use-live-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-orders")({
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const { user, profile } = useAuth();
  const isCustomer = profile?.role === "customer";
  const [outgoing, setOutgoing] = useState<Order[]>([]);
  const [incoming, setIncoming] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewedProviders, setReviewedProviders] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Order | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: outData }, { data: inData }, { data: revData }] = await Promise.all([
      supabase
        .from("orders")
        .select("*, provider:provider_id(id, full_name, username, avatar_url)")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
      isCustomer
        ? Promise.resolve({ data: [] as Order[] })
        : supabase
            .from("orders")
            .select("*, customer:customer_id(id, full_name, username, avatar_url), provider:provider_id(id, full_name, username, avatar_url)")
            .eq("provider_id", user.id)
            .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("professional_id")
        .eq("reviewer_id", user.id),
    ]);
    setOutgoing((outData as Order[]) ?? []);
    setIncoming((inData as Order[]) ?? []);
    setReviewedProviders(
      new Set(((revData as { professional_id: string }[]) ?? []).map((r) => r.professional_id)),
    );
    setLoading(false);
  }, [user, isCustomer]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);

  useLiveData(["orders", "reviews"], load);

  const updateStatus = async (o: Order, status: Order["status"]) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) return toast.error(error.message);
    setIncoming((cur) => cur.map((x) => (x.id === o.id ? { ...x, status } : x)));
    toast.success(`Marked as ${status}`);
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
      ) : isCustomer ? (
        <OrderList
          orders={outgoing}
          direction="outgoing"
          reviewedProviders={reviewedProviders}
          onReview={setReviewing}
        />
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
            />
          </TabsContent>
          <TabsContent value="outgoing" className="mt-4">
            <OrderList
              orders={outgoing}
              direction="outgoing"
              reviewedProviders={reviewedProviders}
              onReview={setReviewing}
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
    </div>
  );
}

function OrderList({
  orders,
  direction,
  reviewedProviders,
  onReview,
  onUpdateStatus,
}: {
  orders: Order[];
  direction: "incoming" | "outgoing";
  reviewedProviders: Set<string>;
  onReview: (o: Order) => void;
  onUpdateStatus?: (o: Order, status: Order["status"]) => void;
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
              <div className="font-semibold truncate">{o.service_title}</div>
              <div className="text-xs text-muted-foreground truncate">{name} · {new Date(o.created_at).toLocaleDateString()}</div>
              {o.payment_ref && (
                <div className="text-[10px] text-muted-foreground truncate">Ref: {o.payment_ref}</div>
              )}
            </div>
            <div className="text-right">
              <div className="font-extrabold text-gradient-brand">{formatNgn(o.amount)}</div>
              <span className={`status-pill status-${o.status} capitalize mt-1`}>{o.status}</span>
            </div>
            {direction === "incoming" && onUpdateStatus && (o.status === "confirmed" || o.status === "pending") && (
              <div className="basis-full flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onUpdateStatus(o, "completed")} className="rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Completed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onUpdateStatus(o, "cancelled")} className="text-destructive">
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </div>
            )}
            {direction === "outgoing" && o.status === "completed" && (
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