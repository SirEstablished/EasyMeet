import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn, type Product, type Profile, type ProductReview } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationTicks } from "@/components/VerificationTicks";
import { StarRating } from "@/components/StarRating";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import { payWithFlutterwave } from "@/lib/flutterwave";
import { verifyFlutterwavePayment } from "@/lib/flutterwave.functions";
import { computeGatewayFee } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/product/$id")({
  component: ProductDetail,
});

type Seller = Pick<Profile, "id" | "full_name" | "username" | "avatar_url" | "role" | "blue_tick" | "white_tick" | "gold_tick" | "bio">;

function ProductDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [reviews, setReviews] = useState<(ProductReview & { reviewer?: { full_name: string | null; username: string | null; avatar_url: string | null } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await (supabase.from("products") as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setProduct(null);
        return;
      }
      const p = data as Product;
      setProduct(p);
      const [{ data: sellerData }, { data: revData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick, bio")
          .eq("id", p.seller_id)
          .maybeSingle(),
        supabase
          .from("product_reviews")
          .select("*, reviewer:profiles!product_reviews_reviewer_id_fkey(full_name, username, avatar_url)")
          .eq("product_id", p.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setSeller((sellerData as Seller | null) ?? null);
      setReviews((revData as any) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load product");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const buyNow = async () => {
    if (!user || !product) return;
    if (product.seller_id === user.id) {
      toast.error("You cannot buy your own product");
      return;
    }
    if (product.product_type === "physical" && product.stock_count <= 0) {
      toast.error("Out of stock");
      return;
    }
    setBuying(true);
    try {
      // Products carry zero commission — the Protection Fee is processing only.
      const productPrice = Number(product.price);
      const protectionFee = computeGatewayFee(productPrice);
      const chargeAmount = Math.round((productPrice + protectionFee) * 100) / 100;
      const res = await payWithFlutterwave({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: chargeAmount,
        flow: "shop",
        userId: user.id,
        description: product.title,
        metadata: { product_id: product.id, kind: "product" },
      });

      // Server-side Flutterwave verification
      const verify = await verifyFlutterwavePayment({
        data: { transactionId: res.transactionId, expectedAmountNgn: chargeAmount },
      });
      if (!verify.verified) {
        toast.error(verify.message || "Payment verification failed");
        return;
      }

      // Idempotency — if this reference already recorded, skip insert
      const price = Number(product.price);
      const { data: existing } = await (supabase.from("orders") as any)
        .select("id")
        .eq("payment_ref", res.reference)
        .maybeSingle();

      let orderId: string | undefined = existing?.id;
      if (!orderId) {
        const { data: inserted, error: insErr } = await (supabase.from("orders") as any)
          .insert({
            customer_id: user.id,
            provider_id: product.seller_id,
            product_id: product.id,
            service_title: product.title,
            amount: price,
            payment_ref: res.reference,
            payment_status: "paid",
            status: "confirmed",
            currency: "NGN",
            kind: "product",
          })
          .select("id")
          .single();
        if (insErr || !inserted) {
          toast.error(insErr?.message || "Could not save order");
          return;
        }
        orderId = inserted.id;

        // Credit seller wallet (full price, zero commission for product sales)
        const { error: creditErr } = await supabase.rpc(
          "credit_wallet_after_release" as never,
          {
            p_user_id: product.seller_id,
            p_amount: price,
            p_commission: 0,
            p_order_id: orderId,
            p_escrow_id: null,
          } as never,
        );
        if (creditErr) console.error("Wallet credit failed", creditErr);

        // Notify seller (best-effort)
        try {
          const { data: buyer } = await supabase
            .from("profiles")
            .select("full_name, username")
            .eq("id", user.id)
            .maybeSingle();
          const buyerName =
            (buyer as any)?.full_name || (buyer as any)?.username || "Someone";
          await supabase.from("notifications").insert({
            user_id: product.seller_id,
            title: "New Product Sale! 🛍️",
            message: `${buyerName} just purchased ${product.title} for ₦${price.toLocaleString()}. Check your wallet!`,
            type: "sale",
          } as never);
        } catch (e) {
          console.error("Sale notification failed", e);
        }
      }

      toast.success("Purchase successful! 🎉");
      navigate({ to: "/shop", search: { tab: "orders" } });
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled") {
        toast.message("Payment cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Purchase failed");
      }
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center">
        <div className="text-lg font-bold">Product not found</div>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to="/shop">Back to Shop</Link>
        </Button>
      </div>
    );
  }

  const images = product.image_urls?.length ? product.image_urls : [];
  const cover = images[imgIdx];
  const outOfStock = product.product_type === "physical" && product.stock_count <= 0;
  const isOwner = user?.id === product.seller_id;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-4 pb-32 sm:pb-16">
      <button
        type="button"
        onClick={() => navigate({ to: "/shop" })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mt-3 relative aspect-square rounded-3xl overflow-hidden bg-secondary border border-border/60">
        {cover ? (
          <img src={cover} alt={product.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">No image</div>
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/80 backdrop-blur border border-border/60 grid place-items-center"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setImgIdx((i) => (i + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/80 backdrop-blur border border-border/60 grid place-items-center"
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "bg-primary w-6" : "bg-background/70 w-1.5"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setImgIdx(i)}
              className={`h-16 w-16 rounded-xl overflow-hidden border shrink-0 transition ${i === imgIdx ? "border-primary" : "border-border/60"}`}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        <h1 className="text-2xl font-extrabold tracking-tight">{product.title}</h1>
        <div className="mt-2 flex items-center gap-3">
          <div className="text-3xl font-extrabold text-gradient-brand">{formatNgn(product.price)}</div>
          {product.category && <Badge variant="outline">{product.category}</Badge>}
          <Badge variant="outline" className="capitalize">{product.product_type}</Badge>
        </div>

        {product.product_type === "physical" && (
          <div className="mt-2 text-xs text-muted-foreground">
            {outOfStock ? (
              <span className="text-rose-500 font-semibold">Out of stock</span>
            ) : (
              <>In stock: <span className="font-semibold text-foreground">{product.stock_count}</span></>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 text-sm">
          <StarRating value={product.avg_rating ?? 0} />
          <span className="text-muted-foreground">({product.review_count ?? 0} reviews)</span>
        </div>

        {seller && (
          <Link
            to="/profile/$id"
            params={{ id: seller.id }}
            className="mt-4 flex items-center gap-3 p-3 rounded-2xl bg-card/80 backdrop-blur border border-border/60"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={seller.avatar_url ?? undefined} />
              <AvatarFallback>{(seller.full_name || seller.username || "?").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold truncate">{seller.full_name || seller.username}</span>
                <VerificationTicks
                  blue={seller.blue_tick}
                  white={seller.white_tick}
                  gold={seller.gold_tick}
                  size="sm"
                />
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {seller.bio || "Seller on EasyMeet"}
              </div>
            </div>
          </Link>
        )}

        {product.description && (
          <div className="mt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Description</h2>
            <p className="mt-2 text-sm whitespace-pre-wrap leading-relaxed">{product.description}</p>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Reviews</h2>
          {reviews.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">No reviews yet.</div>
          ) : (
            <ul className="mt-3 space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="p-3 rounded-2xl bg-card/60 border border-border/60">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={r.reviewer?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(r.reviewer?.full_name || r.reviewer?.username || "?").slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs font-semibold">
                      {r.reviewer?.full_name || r.reviewer?.username || "Buyer"}
                    </div>
                    <div className="ml-auto flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-current" />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="mt-2 text-sm text-foreground/90">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Sticky mobile Buy Now */}
      <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-6 left-0 right-0 md:left-auto md:right-8 z-30 px-4 md:px-0">
        <div className="max-w-3xl mx-auto md:mx-0">
          <Button
            onClick={buyNow}
            disabled={buying || outOfStock || isOwner}
            className="w-full md:w-auto h-12 rounded-full bg-gradient-brand text-base font-bold shadow-[0_18px_36px_-16px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
          >
            {buying ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
            ) : isOwner ? (
              "Your product"
            ) : outOfStock ? (
              "Out of stock"
            ) : (
              <><ShoppingBag className="h-4 w-4 mr-2" /> Buy Now · {formatNgn(product.price)}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}