import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase, formatNgn, SERVICE_CATEGORIES, type Service, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Loader2, MessageCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { VerificationTicks } from "@/components/VerificationTicks";
import { payWithPaystack } from "@/lib/paystack";
import { toast } from "sonner";
import { getOrCreateConversation } from "@/lib/conversations";

export const Route = createFileRoute("/_authenticated/shop")({
  component: ShopPage,
});

type SortKey = "newest" | "price_asc" | "price_desc" | "top";

function ShopPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [booking, setBooking] = useState<Service | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("services")
      .select("*, owner:owner_id(id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick, avg_rating, review_count)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setServices((data as Service[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = services.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (!needle) return true;
      return (
        s.title.toLowerCase().includes(needle) ||
        (s.category || "").toLowerCase().includes(needle) ||
        (s.description || "").toLowerCase().includes(needle)
      );
    });
    if (sort === "price_asc") arr = [...arr].sort((a, b) => a.price_ngn - b.price_ngn);
    else if (sort === "price_desc") arr = [...arr].sort((a, b) => b.price_ngn - a.price_ngn);
    else if (sort === "top") arr = [...arr].sort((a, b) => ((b.owner as Profile | undefined)?.avg_rating ?? 0) - ((a.owner as Profile | undefined)?.avg_rating ?? 0));
    return arr;
  }, [services, q, cat, sort]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold">Shop</h1>
      <p className="text-sm text-muted-foreground">Discover and book services from verified pros.</p>

      <div className="mt-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services by title or category…" className="pl-9 h-11" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={cat === "all" ? "default" : "outline"} className={cat === "all" ? "bg-gradient-brand" : ""} onClick={() => setCat("all")}>All Categories</Button>
        {SERVICE_CATEGORIES.map((c) => (
          <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} className={cat === c ? "bg-gradient-brand" : ""} onClick={() => setCat(c)}>{c}</Button>
        ))}
        <div className="ml-auto w-48">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
              <SelectItem value="top">Top Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No services found.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => (
              <ServiceCard key={s.id} service={s} onBook={() => setBooking(s)} />
            ))}
          </div>
        )}
      </div>

      <BookingModal service={booking} onClose={() => setBooking(null)} />
    </div>
  );
}

function ServiceCard({ service, onBook }: { service: Service; onBook: () => void }) {
  const owner = service.owner;
  const initials = (owner?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="aspect-video bg-secondary">
        {service.image_url ? (
          <img src={service.image_url} alt={service.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold truncate">{service.title}</h3>
          {service.category && <Badge variant="outline">{service.category}</Badge>}
        </div>
        <div className="text-primary font-bold mt-1">{formatNgn(service.price_ngn)}</div>
        {owner && (
          <Link to="/profile/$id" params={{ id: owner.id }} className="mt-3 flex items-center gap-2 group">
            <Avatar className="h-7 w-7">
              <AvatarImage src={owner.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate group-hover:text-primary">{owner.full_name || owner.username}</span>
            <VerificationTicks blue={owner.blue_tick} white={owner.white_tick} gold={owner.gold_tick} size="sm" />
          </Link>
        )}
        <Button onClick={onBook} className="mt-4 bg-gradient-brand">Book Now</Button>
      </div>
    </div>
  );
}

function BookingModal({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ providerId: string; providerName: string } | null>(null);

  useEffect(() => {
    if (!service) { setNotes(""); setDone(null); }
  }, [service]);

  if (!service) return null;

  const owner = service.owner;
  const providerName = owner?.full_name || owner?.username || "Professional";

  const pay = async () => {
    if (!user || !profile) return;
    if (user.id === service.owner_id) return toast.error("You can't book your own service");
    setPaying(true);
    try {
      const res = await payWithPaystack({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: service.price_ngn,
        metadata: { service_id: service.id, kind: "order" },
      });
      const { error } = await supabase.from("orders").insert({
        customer_id: user.id,
        provider_id: service.owner_id,
        service_id: service.id,
        service_title: service.title,
        amount: service.price_ngn,
        notes: notes.trim() || null,
        payment_ref: res.reference,
        payment_status: "paid",
        status: "confirmed",
      });
      if (error) throw error;
      setDone({ providerId: service.owner_id, providerName });
      toast.success("Booking confirmed! The professional will be in touch.");
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled") {
        toast.message("Payment cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Payment failed");
      }
    } finally {
      setPaying(false);
    }
  };

  const message = async () => {
    if (!user || !done) return;
    try {
      const cid = await getOrCreateConversation(user.id, done.providerId);
      onClose();
      navigate({ to: "/messages", search: { c: cid } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open chat");
    }
  };

  return (
    <Dialog open={!!service} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? "Booking confirmed 🎉" : "Book service"}</DialogTitle>
          <DialogDescription>
            {done ? `Your booking with ${done.providerName} is confirmed.` : `${service.title} with ${providerName}`}
          </DialogDescription>
        </DialogHeader>
        {!done ? (
          <>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-primary">{formatNgn(service.price_ngn)}</span>
            </div>
            <div>
              <label className="text-sm font-medium">Any special requirements?</label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for the professional" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={pay} disabled={paying} className="bg-gradient-brand">
                {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Proceed to Pay
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={message} className="bg-gradient-brand">
              <MessageCircle className="h-4 w-4 mr-2" /> Message {done.providerName}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}