import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase, formatNgn, type Product, type Order, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationTicks } from "@/components/VerificationTicks";
import { StarRating } from "@/components/StarRating";
import { ReviewOrderDialog } from "@/components/ReviewOrderDialog";
import { useLiveData } from "@/hooks/use-live-data";
import { Search, Loader2, ShoppingBag, ChevronDown, Star } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ tab: z.enum(["products", "orders"]).optional() });

export const Route = createFileRoute("/_authenticated/shop")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ShopPage,
});

const CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Food",
  "Beauty",
  "Services",
  "Digital",
  "Other",
] as const;
type Category = (typeof CATEGORIES)[number];

type ProductWithSeller = Product & {
  seller?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url" | "role" | "blue_tick" | "white_tick" | "gold_tick"> | null;
};

function matchCategory(product: Product, cat: Category): boolean {
  if (cat === "All") return true;
  const c = (product.category || "").toLowerCase();
  if (cat === "Digital") return product.product_type === "digital";
  if (cat === "Electronics") return c.includes("electronic") || c.includes("gadget");
  if (cat === "Fashion") return c.includes("fashion") || c.includes("clothing");
  if (cat === "Food") return c.includes("food") || c.includes("grocer");
  if (cat === "Beauty") return c.includes("beauty") || c.includes("cosmetic");
  if (cat === "Services") return c.includes("service");
  if (cat === "Other") return !c;
  return true;
}

function ShopPage() {
  const search = useSearch({ from: "/_authenticated/shop" });
  const navigate = useNavigate({ from: "/_authenticated/shop" });
  const initialTab = search.tab === "orders" ? "orders" : "products";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 lg:px-12 pt-5 pb-24">
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded-2xl bg-gradient-brand grid place-items-center text-white">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Shop</h1>
      </div>

      <Tabs
        value={initialTab}
        onValueChange={(v) => navigate({ search: { tab: v as "products" | "orders" } })}
        className="mt-5"
      >
        <TabsList className="w-full h-12 p-1 rounded-2xl bg-muted/70 grid grid-cols-2">
          <TabsTrigger
            value="products"
            className="rounded-xl h-full text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] text-muted-foreground"
          >
            Products
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="rounded-xl h-full text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] text-muted-foreground"
          >
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-5 focus-visible:outline-none data-[state=inactive]:hidden animate-in fade-in slide-in-from-right-2 duration-300">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-5 focus-visible:outline-none data-[state=inactive]:hidden animate-in fade-in slide-in-from-left-2 duration-300">
          <OrdersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<ProductWithSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("All");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data as Product[]) ?? [];
    const sellerIds = [...new Set(rows.map((p) => p.seller_id))];
    let sellerMap = new Map<string, ProductWithSeller["seller"]>();
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick")
        .in("id", sellerIds);
      sellerMap = new Map(((sellers as any[]) ?? []).map((s) => [s.id, s]));
    }
    setProducts(rows.map((p) => ({ ...p, seller: sellerMap.get(p.seller_id) ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);
  useLiveData(["products"], load);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (!matchCategory(p, cat)) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        (p.description || "").toLowerCase().includes(needle) ||
        (p.category || "").toLowerCase().includes(needle)
      );
    });
  }, [products, q, cat]);

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
          className="h-12 pl-11 rounded-2xl bg-card border-border/60"
        />
      </div>

      <div className="mt-4 -mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 px-4 sm:px-0 min-w-max">
          {CATEGORIES.map((c) => {
            const active = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={
                  "px-4 h-9 rounded-full text-xs font-semibold whitespace-nowrap transition " +
                  (active
                    ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                    : "bg-card border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40")
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-6 w-6" />}
            title="No products found"
            body="Try a different category or search term."
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ p }: { p: ProductWithSeller }) {
  const cover = p.image_urls?.[0];
  return (
    <Link
      to="/product/$id"
      params={{ id: p.id }}
      className="group rounded-2xl overflow-hidden bg-card/80 backdrop-blur border border-border/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-20px_rgba(15,23,42,0.2)] hover:border-primary/40 hover:shadow-[0_20px_40px_-24px_color-mix(in_oklab,var(--primary)_45%,transparent)] hover:-translate-y-0.5 transition flex flex-col"
    >
      <div className="aspect-square bg-secondary overflow-hidden">
        {cover ? (
          <img src={cover} alt={p.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">{p.title}</h3>
        <div className="font-extrabold text-gradient-brand">{formatNgn(p.price)}</div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar className="h-5 w-5">
            <AvatarImage src={p.seller?.avatar_url ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {(p.seller?.full_name || p.seller?.username || "?").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-muted-foreground truncate flex-1">
            {p.seller?.full_name || p.seller?.username || "Seller"}
          </span>
          {p.seller && (
            <VerificationTicks
              role={p.seller.role}
              blue={p.seller.blue_tick}
              white={p.seller.white_tick}
              gold={p.seller.gold_tick}
              size="sm"
            />
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Star className="h-3 w-3 fill-current text-amber-500" />
          <span className="font-semibold text-foreground">
            {(p.avg_rating ?? 0).toFixed(1)}
          </span>
          <span>({p.review_count ?? 0})</span>
        </div>
        <Button size="sm" className="mt-1 h-8 rounded-full bg-gradient-brand text-xs">
          Buy Now
        </Button>
      </div>
    </Link>
  );
}

type ProductOrder = Order & {
  provider?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
  product?: { id: string; title: string; image_urls: string[] | null } | null;
};

function OrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ProductOrder | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", user.id)
        .eq("kind", "product")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data as Order[]) ?? [];

      const providerIds = [...new Set(rows.map((o) => o.provider_id))];
      const productIds = [...new Set(rows.map((o) => o.product_id).filter(Boolean) as string[])];

      const [{ data: providers }, { data: products }, { data: myReviews }] = await Promise.all([
        providerIds.length
          ? supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", providerIds)
          : Promise.resolve({ data: [] as any[] }),
        productIds.length
          ? (supabase.from("products") as any).select("id, title, image_urls").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("product_reviews").select("product_id").eq("reviewer_id", user.id),
      ]);

      const provMap = new Map(((providers as any[]) ?? []).map((p) => [p.id, p]));
      const prodMap = new Map(((products as any[]) ?? []).map((p) => [p.id, p]));

      setOrders(
        rows.map((o) => ({
          ...o,
          provider: provMap.get(o.provider_id) ?? null,
          product: (o.product_id && prodMap.get(o.product_id)) || null,
        })),
      );
      setReviewed(
        new Set(
          ((myReviews as { product_id: string | null }[]) ?? [])
            .map((r) => r.product_id)
            .filter((x): x is string => !!x),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);
  useLiveData(["orders", "product_reviews"], load);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6" />}
        title="No product orders yet"
        body="Start shopping! 🛍️"
      />
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const isOpen = expanded === o.id;
        const cover = o.product?.image_urls?.[0];
        const statusColor =
          o.status === "completed"
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : o.status === "cancelled"
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
        return (
          <div
            key={o.id}
            className="rounded-2xl bg-card/80 backdrop-blur border border-border/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-24px_rgba(15,23,42,0.25)] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : o.id)}
              className="w-full text-left p-3 flex items-center gap-3"
            >
              <div className="h-16 w-16 rounded-xl bg-secondary overflow-hidden shrink-0">
                {cover ? (
                  <img src={cover} alt={o.service_title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[10px] text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{o.service_title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {o.provider?.full_name || o.provider?.username || "Seller"}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-gradient-brand">{formatNgn(o.amount)}</span>
                  <Badge className={`${statusColor} border-transparent capitalize`}>{o.status}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="border-t border-border/60 px-3 py-3 space-y-2 text-xs">
                <Row label="Order ID" value={o.id} mono />
                <Row label="Payment Ref" value={o.payment_ref || "—"} mono />
                <Row label="Payment Status" value={o.payment_status} />
                <Row label="Delivery Status" value={o.status} />
                <Row label="Placed" value={new Date(o.created_at).toLocaleString()} />
                <div className="pt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild className="rounded-full">
                    <Link to="/product/$id" params={{ id: o.product_id || "" }}>View product</Link>
                  </Button>
                  {o.status === "completed" &&
                    o.product_id &&
                    !reviewed.has(o.product_id) && (
                      <Button
                        size="sm"
                        onClick={() => setReviewing(o)}
                        className="rounded-full bg-gradient-brand"
                      >
                        <Star className="h-3.5 w-3.5 mr-1" /> Leave a Review
                      </Button>
                    )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {reviewing && (
        <ReviewOrderDialog
          open={!!reviewing}
          onOpenChange={(v) => !v && setReviewing(null)}
          providerId={reviewing.provider_id}
          providerName={
            reviewing.provider?.full_name || reviewing.provider?.username || "Seller"
          }
          orderId={reviewing.id}
          productId={reviewing.product_id || undefined}
          onSubmitted={() => {
            if (reviewing.product_id) {
              setReviewed((cur) => new Set(cur).add(reviewing.product_id!));
            }
            setReviewing(null);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={`flex-1 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 backdrop-blur p-10 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
        {icon}
      </div>
      <div className="font-bold">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{body}</div>
    </div>
  );
}