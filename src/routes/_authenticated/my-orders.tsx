import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, formatNgn, type Order } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Star } from "lucide-react";
import { ReviewOrderDialog } from "@/components/ReviewOrderDialog";

export const Route = createFileRoute("/_authenticated/my-orders")({
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewedProviders, setReviewedProviders] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Order | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: orderData }, { data: revData }] = await Promise.all([
        supabase
          .from("orders")
          .select("*, provider:provider_id(id, full_name, username, avatar_url)")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("professional_id")
          .eq("reviewer_id", user.id),
      ]);
      if (cancelled) return;
      setOrders((orderData as Order[]) ?? []);
      setReviewedProviders(
        new Set(((revData as { professional_id: string }[]) ?? []).map((r) => r.professional_id)),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-tri">My Orders</h1>
      <p className="text-sm text-muted-foreground">Track services you've booked.</p>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
              <Star className="h-5 w-5" />
            </div>
            No bookings yet. <Link to="/shop" className="text-primary font-medium">Browse the shop</Link> to find professionals.
          </div>
        ) : (
          orders.map((o) => {
            const name = o.provider?.full_name || o.provider?.username || "Provider";
            const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={o.id} className="rounded-2xl glass-card p-4 flex items-center gap-4 lift-hover hover:-translate-y-0.5 hover:border-primary/50">
                <Link to="/profile/$id" params={{ id: o.provider_id }}>
                  <span className="avatar-ring">
                    <Avatar className="h-12 w-12 border-2 border-background">
                      <AvatarImage src={o.provider?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                    </Avatar>
                  </span>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{o.service_title}</div>
                  <div className="text-xs text-muted-foreground">{name} · {new Date(o.created_at).toLocaleDateString()}</div>
                  {o.payment_ref && (
                    <div className="text-[10px] text-muted-foreground truncate">Ref: {o.payment_ref}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-gradient-brand">{formatNgn(o.amount)}</div>
                  <span className={`status-pill status-${o.status} capitalize mt-1`}>{o.status}</span>
                </div>
                {o.status === "completed" && (
                  reviewedProviders.has(o.provider_id) ? (
                    <div className="ml-auto sm:ml-0 sm:basis-full text-xs text-accent font-medium mt-1">
                      ✓ Thanks for your review!
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="ml-auto sm:ml-0 sm:basis-full rounded-full bg-gradient-brand glow-primary mt-1"
                      onClick={(e) => { e.preventDefault(); setReviewing(o); }}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" /> Leave a Review
                    </Button>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
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