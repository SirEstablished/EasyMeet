import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn, type Product, type ProductReview } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { VerificationTicks } from "@/components/VerificationTicks";
import { StarRating } from "@/components/StarRating";
import { ArrowLeft, Loader2, MessageCircle, Package, Star } from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { getOrCreateConversation } from "@/lib/conversations";
import { toast } from "sonner";
import { useLiveData } from "@/hooks/use-live-data";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/shop/product/")({
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [paying, setPaying] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const loadProduct = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("*, seller:seller_id(id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick)")
      .eq("id", id)
      .maybeSingle();
    setProduct((data as Product) ?? null);
  }, [id]);

  const loadReviews = useCallback(async () => {
    const { data } = await supabase
      .from("product_reviews")
      .select("*, customer:customer_id(id, full_name, username, avatar_url)")
      .eq("product_id", id)
      .order("created_at", { ascending: false });
    setReviews((data as ProductReview[]) ?? []);
  }, [id]);

  const checkEligibility = useCallback(async () => {
    if (!user) return setCanReview(false);
    const [{ data: orders }, { data: existing }] = await Promise.all([
      supabase.from("orders").select("id").eq("product_id", id).eq("customer_id", user.id).eq("status", "completed").limit(1),
      supabase.from("product_reviews").select("id").eq("product_id", id).eq("customer_id", user.id).limit(1),
    ]);
    setCanReview(!!orders?.length && !existing?.length);
  }, [user, id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadProduct(), loadReviews(), checkEligibility()]).finally(() => setLoading(false));
  }, [loadProduct, loadReviews, checkEligibility]);

  useLiveData(["products", "product_reviews"], async () => {
    await Promise.all([loadProduct(), loadReviews(), checkEligibility()]);
  });

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-xl font-semibold">Product not found</h1>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/shop"><ArrowLeft className="h-4 w-4 mr-1" /> Back to shop</Link>
        </Button>
      </div>
    );
  }

  const seller = product.seller;
  const images = (product.image_urls ?? []).slice(0, 6);
  const sellerInitials = (seller?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const isOwner = user?.id === product.seller_id;

  const buy = async () => {
    if (!user) return;
    if (isOwner) return toast.error("You can't buy your own product");
    if (product.product_type === "physical" && product.stock_count <= 0) return toast.error("Out of stock");
    setPaying(true);
    try {
      const res = await payWithPaystack({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: product.price,
        metadata: { product_id: product.id, kind: "product" },
      });
      const { error: orderError } = await supabase.from("orders").insert({
        customer_id: user.id,
        provider_id: product.seller_id,
        product_id: product.id,
        service_id: null,
        kind: "product",
        service_title: product.title,
        amount: product.price,
        currency: "NGN",
        notes: null,
        payment_ref: res.reference,
        payment_status: "paid",
        status: "confirmed",
      });
      if (orderError) {
        toast.error("Payment received but order record failed. Please contact support.");
        return;
      }
      if (product.product_type === "physical") {
        await supabase.from("products").update({ stock_count: Math.max(0, product.stock_count - 1) }).eq("id", product.id);
      }
      await supabase.from("notifications").insert({
        user_id: product.seller_id,
        recipient_id: product.seller_id,
        sender_id: user.id,
        type: "new_order",
        title: "New order",
        message: `You received a new order for "${product.title}".`,
        body: `You received a new order for "${product.title}".`,
        read: false,
      } as any);
      toast.success("Purchase successful 🎉");
      navigate({ to: "/my-orders" });
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled") toast.message("Payment cancelled");
      else toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const message = async () => {
    if (!user || !seller) return;
    try {
      const cid = await getOrCreateConversation(user.id, seller.id);
      navigate({ to: "/messages", search: { c: cid } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open chat");
    }
  };

  const avg = Number(product.avg_rating ?? 0);
  const count = Number(product.review_count ?? 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/shop"><ArrowLeft className="h-4 w-4 mr-1" /> Back to shop</Link>
      </Button>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="aspect-square rounded-2xl overflow-hidden bg-secondary border border-border">
            {images[activeImg] ? (
              <img src={images[activeImg]} alt={product.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground">
                <Package className="h-12 w-12" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto snap-x">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 snap-start ${i === activeImg ? "border-primary" : "border-transparent"}`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">{product.product_type}</Badge>
            {product.category && <Badge variant="secondary">{product.category}</Badge>}
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold leading-tight">{product.title}</h1>
          {seller && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>by</span>
              <span className="font-medium text-foreground">{seller.full_name || seller.username}</span>
              <VerificationTicks blue={seller.blue_tick} white={seller.white_tick} gold={seller.gold_tick} size="sm" />
            </div>
          )}
          {count > 0 && (
            <div className="mt-2"><StarRating value={avg} count={count} /></div>
          )}
          <div className="mt-3 text-3xl sm:text-4xl font-extrabold bg-gradient-brand bg-clip-text text-transparent">
            {formatNgn(product.price)}
          </div>
          {product.product_type === "physical" && (
            <div className="mt-2 text-sm text-muted-foreground">
              {product.stock_count > 0 ? (
                <>In stock: <span className="text-foreground font-medium">{product.stock_count}</span></>
              ) : (
                <span className="text-destructive">Out of stock</span>
              )}
            </div>
          )}

          {product.description && (
            <p className="mt-4 text-sm whitespace-pre-wrap leading-relaxed">{product.description}</p>
          )}

          {seller && (
            <Link
              to="/profile/$id"
              params={{ id: seller.id }}
              className="mt-5 flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={seller.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">{sellerInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold truncate">{seller.full_name || seller.username}</span>
                  <VerificationTicks blue={seller.blue_tick} white={seller.white_tick} gold={seller.gold_tick} size="sm" />
                </div>
                <div className="text-xs text-muted-foreground">View seller profile</div>
              </div>
            </Link>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            {isOwner ? (
              <div className="flex-1 h-11 rounded-md border border-dashed border-border grid place-items-center text-xs text-muted-foreground">
                This is your listing
              </div>
            ) : (
              <Button onClick={buy} disabled={paying} className="bg-gradient-brand flex-1 h-11">
                {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Buy Now
              </Button>
            )}
            {!isOwner && (
              <Button onClick={message} variant="outline" className="flex-1 h-11">
                <MessageCircle className="h-4 w-4 mr-2" /> Message Seller
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-10">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold">Reviews & Ratings</h2>
            <div className="mt-1 flex items-center gap-2">
              <StarRating value={avg} count={count} />
              {count === 0 && <span className="text-xs text-muted-foreground">No reviews yet</span>}
            </div>
          </div>
          {canReview && (
            <Button onClick={() => setReviewOpen(true)} className="bg-gradient-brand">
              <Star className="h-4 w-4 mr-2" /> Leave a Review
            </Button>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {reviews.length === 0 ? (
            <div className="rounded-xl glass-card p-6 text-center text-sm text-muted-foreground">
              Be the first to review this product.
            </div>
          ) : (
            reviews.map((r) => {
              const initials = (r.customer?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
              return (
                <div key={r.id} className="rounded-xl glass-card p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={r.customer?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{r.customer?.full_name || r.customer?.username || "User"}</span>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                      </div>
                      <StarRating value={r.rating} showNumber={false} size={14} />
                      {r.comment && <p className="mt-1.5 text-sm whitespace-pre-wrap">{r.comment}</p>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <LeaveReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        productId={product.id}
        productTitle={product.title}
        onSubmitted={() => {
          setReviewOpen(false);
          void loadReviews();
          void loadProduct();
          void checkEligibility();
        }}
      />
    </div>
  );
}

function LeaveReviewDialog({
  open, onOpenChange, productId, productTitle, onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productTitle: string;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (rating < 1) return toast.error("Please select a star rating");
    setSaving(true);
    // Find the most recent completed order for the product to link
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("product_id", productId)
      .eq("customer_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("product_reviews").insert({
      product_id: productId,
      customer_id: user.id,
      order_id: order?.id ?? null,
      rating,
      comment: comment.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Thanks for your review!");
    setRating(0); setComment("");
    onSubmitted();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Review product</DialogTitle>
          <DialogDescription>How was “{productTitle}”?</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-1 py-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="p-1"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                <Star className={`h-7 w-7 ${active ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>
        <Textarea
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience (optional)"
        />
        <div className="text-right text-xs text-muted-foreground">{comment.length}/500</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-brand">
            {saving ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
