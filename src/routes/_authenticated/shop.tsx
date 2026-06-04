import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase, formatNgn, PRODUCT_CATEGORIES, type Product } from "@/integrations/supabase/client";
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
import { VerificationTicks } from "@/components/VerificationTicks";
import { payWithPaystack } from "@/lib/paystack";
import { toast } from "sonner";
import { getOrCreateConversation } from "@/lib/conversations";

export const Route = createFileRoute("/_authenticated/shop")({
  component: ShopPage,
});

type SortKey = "newest" | "price_asc" | "price_desc";

function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [buying, setBuying] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("products")
      .select("*, seller:seller_id(id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setProducts((data as Product[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        (p.category || "").toLowerCase().includes(needle) ||
        (p.description || "").toLowerCase().includes(needle)
      );
    });
    if (sort === "price_asc") arr = [...arr].sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") arr = [...arr].sort((a, b) => b.price - a.price);
    return arr;
  }, [products, q, cat, sort]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold">Shop</h1>
      <p className="text-sm text-muted-foreground">Discover products from verified sellers.</p>

      <div className="mt-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9 h-11" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={cat === "all" ? "default" : "outline"} className={cat === "all" ? "bg-gradient-brand" : ""} onClick={() => setCat("all")}>All Categories</Button>
        {PRODUCT_CATEGORIES.map((c) => (
          <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} className={cat === c ? "bg-gradient-brand" : ""} onClick={() => setCat(c)}>{c}</Button>
        ))}
        <div className="ml-auto w-48">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
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
            No products found.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onBuy={() => setBuying(p)} />
            ))}
          </div>
        )}
      </div>

      <PurchaseModal product={buying} onClose={() => setBuying(null)} />
    </div>
  );
}

function ProductCard({ product, onBuy }: { product: Product; onBuy: () => void }) {
  const seller = product.seller;
  const cover = product.image_urls?.[0];
  return (
    <Link
      to="/shop/product/$id"
      params={{ id: product.id }}
      className="group rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:shadow-lg hover:border-primary/40 transition"
    >
      <div className="aspect-square bg-secondary relative">
        {cover ? (
          <img src={cover} alt={product.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition" />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">No image</div>
        )}
        <Badge variant="outline" className="absolute top-2 left-2 capitalize bg-background/80 backdrop-blur text-[10px] px-1.5 py-0">
          {product.product_type}
        </Badge>
      </div>
      <div className="p-2.5 flex-1 flex flex-col gap-1">
        <h3 className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">{product.title}</h3>
        <div className="text-primary font-bold text-base">{formatNgn(product.price)}</div>
        {seller && (
          <div className="text-[11px] text-muted-foreground truncate">
            by {seller.full_name || seller.username}
          </div>
        )}
        <Button
          size="sm"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBuy(); }}
          className="mt-1 h-8 text-xs bg-gradient-brand"
        >
          Buy Now
        </Button>
      </div>
    </Link>
  );
}

function PurchaseModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ sellerId: string; sellerName: string; downloadUrl?: string | null } | null>(null);

  useEffect(() => {
    if (!product) setDone(null);
  }, [product]);

  if (!product) return null;

  const seller = product.seller;
  const sellerName = seller?.full_name || seller?.username || "Seller";

  const pay = async () => {
    if (!user || !profile) return;
    if (user.id === product.seller_id) return toast.error("You can't buy your own product");
    if (product.product_type === "physical" && product.stock_count <= 0) {
      return toast.error("Out of stock");
    }
    setPaying(true);
    try {
      const res = await payWithPaystack({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: product.price,
        metadata: { product_id: product.id, kind: "product" },
      });
      const { error } = await supabase.from("orders").insert({
        customer_id: user.id,
        provider_id: product.seller_id,
        product_id: product.id,
        service_id: null,
        kind: "product",
        service_title: product.title,
        amount: product.price,
        notes: null,
        payment_ref: res.reference,
        payment_status: "paid",
        status: "confirmed",
      });
      if (error) throw error;

      // Decrement stock for physical products
      if (product.product_type === "physical") {
        await supabase
          .from("products")
          .update({ stock_count: Math.max(0, product.stock_count - 1) })
          .eq("id", product.id);
      }

      let downloadUrl: string | null = null;
      if (product.product_type === "digital" && product.digital_file_url) {
        const { data } = await supabase.storage
          .from("digital-products")
          .createSignedUrl(product.digital_file_url, 60 * 60 * 24 * 7);
        downloadUrl = data?.signedUrl ?? null;
      }

      setDone({ sellerId: product.seller_id, sellerName, downloadUrl });
      toast.success("Purchase successful 🎉");
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
      const cid = await getOrCreateConversation(user.id, done.sellerId);
      onClose();
      navigate({ to: "/messages", search: { c: cid } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open chat");
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? "Purchase confirmed 🎉" : "Buy product"}</DialogTitle>
          <DialogDescription>
            {done
              ? `Thanks for buying from ${done.sellerName}.`
              : `${product.title} by ${sellerName}`}
          </DialogDescription>
        </DialogHeader>
        {!done ? (
          <>
            <div className="rounded-xl border border-border bg-secondary/50 p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-primary">{formatNgn(product.price)}</span>
            </div>
            {product.product_type === "physical" ? (
              <p className="text-sm text-muted-foreground">
                The seller will arrange delivery after payment. Chat with them to confirm details.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                You will receive a secure download link immediately after payment.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={pay} disabled={paying} className="bg-gradient-brand">
                {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Proceed to Pay
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {done.downloadUrl && (
              <div className="rounded-xl border border-border bg-secondary/50 p-4">
                <div className="text-sm font-medium mb-2">Your download is ready</div>
                <a href={done.downloadUrl} target="_blank" rel="noopener" className="text-sm text-primary underline break-all">
                  Download file
                </a>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={message} className="bg-gradient-brand">
                <MessageCircle className="h-4 w-4 mr-2" /> Message {done.sellerName}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}