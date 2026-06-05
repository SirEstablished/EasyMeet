import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, formatNgn, type Order, type OrderStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-bookings")({
  component: MyBookingsPage,
});

function MyBookingsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "customer") navigate({ to: "/dashboard" });
  }, [profile, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("orders")
      .select("*, customer:customer_id(id, full_name, username, avatar_url)")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setOrders((data as Order[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const update = async (o: Order, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) return toast.error(error.message);
    setOrders((cur) => cur.map((x) => (x.id === o.id ? { ...x, status } : x)));
    toast.success(`Marked as ${status}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-tri">My Bookings</h1>
      <p className="text-sm text-muted-foreground">Bookings customers have placed with you.</p>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            No bookings yet.
          </div>
        ) : (
          orders.map((o) => {
            const name = o.customer?.full_name || o.customer?.username || "Customer";
            const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={o.id} className="rounded-2xl glass-card p-4 lift-hover hover:-translate-y-0.5 hover:border-primary/50">
                <div className="flex items-center gap-4">
                  <Link to="/profile/$id" params={{ id: o.customer_id }}>
                    <span className="avatar-ring">
                      <Avatar className="h-12 w-12 border-2 border-background">
                        <AvatarImage src={o.customer?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                      </Avatar>
                    </span>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to="/profile/$id" params={{ id: o.customer_id }} className="font-semibold hover:text-primary truncate block">
                      {name}
                    </Link>
                    <div className="text-sm truncate">{o.service_title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-gradient-brand">{formatNgn(o.amount)}</div>
                    <span className={`status-pill status-${o.status} capitalize mt-1`}>{o.status}</span>
                  </div>
                </div>
                {o.notes && (
                  <div className="mt-3 text-sm rounded-xl glass-card p-3">
                    <span className="font-medium">Notes:</span> {o.notes}
                  </div>
                )}
                {(o.status === "confirmed" || o.status === "pending") && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => update(o, "completed")} className="rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Completed
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => update(o, "cancelled")} className="text-destructive">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}