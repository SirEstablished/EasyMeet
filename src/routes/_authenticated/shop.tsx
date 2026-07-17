import { createFileRoute, Link } from "@tanstack/react-router";
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
import { ReviewOrderDialog } from "@/components/ReviewOrderDialog";
import { RequestRefundDialog } from "@/components/RequestRefundDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { computePaystackFee } from "@/lib/paystackFees";
import { useLiveData } from "@/hooks/use-live-data";
import {
  Search,
  Loader2,
  ShoppingBag,
  Star,
  Handshake,
  Share2,
  X,
  MessageSquare,
  ShieldAlert,
  RotateCcw,
  User as UserIcon,
  Calendar,
  Hash,
  Wallet,
  Shield,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
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
  const search = Route.useSearch();
  const [tab, setTab] = useState<"products" | "orders">(
    search.tab === "orders" ? "orders" : "products",
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-5 pb-24">
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded-2xl bg-gradient-brand grid place-items-center text-white">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Shop</h1>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "products" | "orders")}
        className="mt-5"
      >
        <TabsList className="w-full sm:max-w-md h-12 p-1 rounded-2xl bg-muted/70 grid grid-cols-2">
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
  customer?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
  product?: { id: string; title: string; image_urls: string[] | null } | null;
};

function OrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProductOrder | null>(null);
  const [reviewing, setReviewing] = useState<ProductOrder | null>(null);
  const [refunding, setRefunding] = useState<ProductOrder | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "service" | "product">("all");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data as Order[]) ?? [];

      const partyIds = [
        ...new Set(
          rows.flatMap((o) => [o.provider_id, o.customer_id]).filter(Boolean) as string[],
        ),
      ];
      const productIds = [...new Set(rows.map((o) => o.product_id).filter(Boolean) as string[])];

      const [{ data: parties }, { data: products }, { data: myReviews }] = await Promise.all([
        partyIds.length
          ? supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", partyIds)
          : Promise.resolve({ data: [] as any[] }),
        productIds.length
          ? (supabase.from("products") as any).select("id, title, image_urls").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("product_reviews").select("product_id").eq("reviewer_id", user.id),
      ]);

      const partyMap = new Map(((parties as any[]) ?? []).map((p) => [p.id, p]));
      const prodMap = new Map(((products as any[]) ?? []).map((p) => [p.id, p]));

      const enriched = rows.map((o) => ({
          ...o,
          provider: partyMap.get(o.provider_id) ?? null,
          customer: partyMap.get(o.customer_id) ?? null,
          product: (o.product_id && prodMap.get(o.product_id)) || null,
      }));
      setOrders(enriched);
      setSelected((cur) => (cur ? enriched.find((o) => o.id === cur.id) ?? null : cur));
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

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "service") return orders.filter((o) => o.kind === "service" || !o.kind);
    return orders.filter((o) => o.kind === "product");
  }, [orders, filter]);

  const FilterTabs = (
    <div className="mb-4 inline-flex items-center gap-1 p-1 rounded-full bg-muted/70">
      {(["all", "service", "product"] as const).map((k) => {
        const active = filter === k;
        const label = k === "all" ? "All" : k === "service" ? "Services" : "Products";
        return (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={
              "px-4 h-8 rounded-full text-xs font-semibold transition " +
              (active
                ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div>
        {FilterTabs}
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="No orders yet"
          body="Start exploring! 🛍️"
        />
      </div>
    );
  }

  return (
    <div>
      {FilterTabs}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="No orders in this filter"
          body="Try a different tab."
        />
      ) : (
      <div className="space-y-3">
      {filtered.map((o) => {
        const cover = o.product?.image_urls?.[0];
        const isSeller = o.provider_id === user?.id;
        const counterparty = isSeller ? o.customer : o.provider;
        const counterpartyLabel = isSeller ? "Buyer" : "Seller";
        const kindLabel = o.kind === "product" ? "Product" : "Service";
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
              onClick={() => setSelected(o)}
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
                  {counterpartyLabel}: {counterparty?.full_name || counterparty?.username || "—"}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-gradient-brand">{formatNgn(o.amount)}</span>
                  <Badge className={`${statusColor} border-transparent capitalize`}>{o.status}</Badge>
                  <Badge variant="outline" className="capitalize">{kindLabel}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </button>
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
          onSubmitted={() => {
            if (reviewing.product_id) {
              setReviewed((cur) => new Set(cur).add(reviewing.product_id!));
            }
            setReviewing(null);
          }}
        />
      )}
      </div>
      )}

      <OrderDetailSheet
        order={selected}
        currentUserId={user?.id ?? null}
        reviewed={reviewed}
        onClose={() => setSelected(null)}
        onReview={(o) => {
          setSelected(null);
          setReviewing(o);
        }}
        onRefund={(o) => {
          setSelected(null);
          setRefunding(o);
        }}
      />

      {refunding && (
        <RequestRefundDialog
          open={!!refunding}
          onOpenChange={(v) => !v && setRefunding(null)}
          orderId={refunding.id}
          amount={refunding.amount}
          onSubmitted={() => setRefunding(null)}
        />
      )}
    </div>
  );
}

function OrderDetailSheet({
  order,
  currentUserId,
  reviewed,
  onClose,
  onReview,
  onRefund,
}: {
  order: ProductOrder | null;
  currentUserId: string | null;
  reviewed: Set<string>;
  onClose: () => void;
  onReview: (o: ProductOrder) => void;
  onRefund: (o: ProductOrder) => void;
}) {
  const open = !!order;
  if (!order) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="bottom" className="p-0" />
      </Sheet>
    );
  }

  const isSeller = order.provider_id === currentUserId;
  const counterparty = isSeller ? order.customer : order.provider;
  const counterpartyLabel = isSeller ? "Buyer" : "Seller";
  const isService = order.kind !== "product";
  const kindLabel = isService ? "Service Agreement" : "Product Order";

  const statusTone =
    order.status === "completed"
      ? "bg-emerald-500 text-white"
      : order.status === "cancelled"
        ? "bg-rose-500 text-white"
        : "bg-sky-500 text-white";
  const statusText =
    order.status === "completed"
      ? "Completed"
      : order.status === "cancelled"
        ? "Cancelled"
        : order.status === "confirmed"
          ? "In Escrow"
          : order.status.charAt(0).toUpperCase() + order.status.slice(1);

  const paystackFee = computePaystackFee(order.amount);
  const inEscrow = order.status === "confirmed" || order.escrow_stage === "work_in_progress";

  const stageOrder = ["pending_payment", "work_in_progress", "completed"] as const;
  const currentStageIdx = Math.max(
    0,
    stageOrder.indexOf((order.escrow_stage as (typeof stageOrder)[number]) || "pending_payment"),
  );

  const handleShare = async () => {
    const payload = {
      title: "EasyMeet",
      text: "I just completed a deal on EasyMeet! 🤝",
      url: "https://easymeet.com.ng",
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
        toast.success("Link copied to clipboard");
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="p-0 border-0 rounded-t-3xl max-h-[92vh] overflow-hidden bg-gradient-to-b from-background to-card [&>button]:hidden"
      >
        {/* Watermark */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.04]">
          <Handshake className="h-[80vw] w-[80vw] max-h-[500px] max-w-[500px] text-primary" />
        </div>

        {/* Grabber */}
        <div className="relative pt-3 flex justify-center">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Top action row */}
        <div className="relative flex items-center justify-end gap-2 px-4 pt-2">
          <button
            type="button"
            onClick={handleShare}
            className="h-9 w-9 rounded-full bg-card border border-border/60 grid place-items-center text-foreground/70 hover:text-primary hover:border-primary/40 transition"
            aria-label="Share"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-card border border-border/60 grid place-items-center text-foreground/70 hover:text-rose-500 hover:border-rose-400/40 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative overflow-y-auto max-h-[calc(92vh-56px)] px-5 pb-8 pt-3 space-y-5">
          {/* Status */}
          <div>
            <span className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-bold ${statusTone}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {statusText}
            </span>
          </div>

          {/* Title */}
          <div>
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight">
              {order.service_title}
            </h2>
            <div className="mt-2">
              <Badge variant="outline" className="rounded-full">
                {kindLabel}
              </Badge>
            </div>
          </div>

          <Divider />

          {/* Counterparty / date / ref */}
          <div className="space-y-3">
            <DetailRow icon={<UserIcon className="h-4 w-4" />} label={counterpartyLabel}>
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={counterparty?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">
                    {(counterparty?.full_name || counterparty?.username || "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold truncate">
                  {counterparty?.full_name || counterparty?.username || "—"}
                </span>
              </div>
            </DetailRow>
            <DetailRow icon={<Calendar className="h-4 w-4" />} label="Date">
              <span className="font-semibold">
                {new Date(order.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </DetailRow>
            <DetailRow icon={<Hash className="h-4 w-4" />} label="Reference">
              <span className="font-mono text-xs break-all">
                {order.payment_ref || "—"}
              </span>
            </DetailRow>
          </div>

          <Divider />

          {/* Money breakdown */}
          <div className="space-y-3">
            <DetailRow icon={<Wallet className="h-4 w-4" />} label="Amount">
              <span className="font-extrabold text-gradient-brand">{formatNgn(order.amount)}</span>
            </DetailRow>
            {order.commission_amount > 0 && (
              <DetailRow icon={<Shield className="h-4 w-4" />} label="EasyMeet Protection Fee">
                <span className="font-semibold">{formatNgn(order.commission_amount)}</span>
              </DetailRow>
            )}
            {paystackFee > 0 && (
              <DetailRow icon={<CreditCard className="h-4 w-4" />} label="Paystack Fee">
                <span className="font-semibold">{formatNgn(paystackFee)}</span>
              </DetailRow>
            )}
            {order.payout_amount > 0 && (
              <DetailRow icon={<CheckCircle2 className="h-4 w-4" />} label={isSeller ? "You Received" : "Professional Received"}>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatNgn(order.payout_amount)}
                </span>
              </DetailRow>
            )}
          </div>

          {isService && order.escrow_stage && (
            <>
              <Divider />
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Escrow Stage
                </div>
                <div className="flex items-center gap-2">
                  {stageOrder.map((s, i) => {
                    const active = i <= currentStageIdx;
                    return (
                      <div key={s} className="flex-1 flex items-center gap-2">
                        <div
                          className={`h-2 flex-1 rounded-full ${active ? "bg-gradient-brand" : "bg-muted"}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs font-semibold capitalize">
                  {(order.escrow_stage || "pending_payment").replaceAll("_", " ")}
                </div>
              </div>
            </>
          )}

          <Divider />

          {/* Actions */}
          <div className="grid grid-cols-1 gap-2 pt-1">
            {!isSeller &&
              order.status === "completed" &&
              order.product_id &&
              !reviewed.has(order.product_id) && (
                <Button
                  onClick={() => onReview(order)}
                  className="h-11 rounded-full bg-gradient-brand"
                >
                  <Star className="h-4 w-4 mr-2" /> Leave a Review
                </Button>
              )}
            {inEscrow && (
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-full border-amber-400/60 text-amber-600 hover:text-amber-700"
              >
                <Link to="/admin/disputes">
                  <ShieldAlert className="h-4 w-4 mr-2" /> Open Dispute
                </Link>
              </Button>
            )}
            {!isSeller && order.status === "cancelled" && order.payment_ref && (
              <Button
                onClick={() => onRefund(order)}
                variant="outline"
                className="h-11 rounded-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" /> Request Refund
              </Button>
            )}
            {isService && (
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-full"
              >
                <Link to="/messages">
                  <MessageSquare className="h-4 w-4 mr-2" /> View in Messages
                </Link>
              </Button>
            )}
            {!isService && order.product_id && (
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-full"
              >
                <Link to="/product/$id" params={{ id: order.product_id }}>
                  View product
                </Link>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Divider() {
  return <div className="h-px bg-border/60" />;
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
          {label}
        </div>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
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