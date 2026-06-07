import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase, formatNgn, type Product, type ProductReview } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerificationTicks } from "@/components/VerificationTicks";
import { ArrowLeft, Loader2, MessageCircle, Package, Star } from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { getOrCreateConversation } from "@/lib/conversations";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/StarRating";

export const Route = createFileRoute("/_authenticated/shop/product/$id")({
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("products")
      .select("*, seller:seller_id(id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProduct((data as Product) ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function fetchExtras() {
      if (!product?.id) {
        if (!cancelled) {
          setReviews([]);
          setHasReviewed(false);
        }
        return;
      }
      const { data: revData } = await supabase
        .from("product_reviews")
        .select("*, reviewer:reviewer_id(id, full_name, username, avatar_url)")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false });
      let myRevData: any = null;
      if (user?.id) {
        const myRevRes = await supabase
          .from("product_reviews")
          .select("id")
          .eq("product_id", product.id)
          .eq("reviewer_id", user.id)
          .maybeSingle();
        myRevData = myRevRes.data;
      }
      if (cancelled) return;
      setReviews((revData as ProductReview[]) ?? []);
      if (user?.id) {
        setHasReviewed(!!myRevData);
      } else {
        setHasReviewed(false);
      }
    }
    fetchExtras();
    return () => { cancelled = true; };
  }, [product?.id, user?.id]);

  useEffect(() => {
    if (!product?.id) return;
    const channel = supabase
      .channel(`product-reviews-${product.id}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "product_reviews", filter: `product_id=eq.${product.id}` } as never,
        () => {
          supabase
            .from("product_reviews")
            .select("*, reviewer:reviewer_id(id, full_name, username, avatar_url)")
            .eq("product_id", product.id)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              const nextReviews = (data as ProductReview[]) ?? [];
              setReviews(nextReviews);
              if (user?.id && nextReviews.some((review) => review.reviewer_id === user.id)) {
                setHasReviewed(true);
              }
            });
          supabase
            .from("products")
            .select("avg_rating, review_count")
            .eq("id", product.id)
            .maybeSingle()
            .then(({ data }) => {
              if (data) {
                setProduct((prev) =>
                  prev
                    ? {
                        ...prev,
                        avg_rating: (data as any).avg_rating,
                        review_count: (data as any).review_count,
                      }
                    : prev
                );
              }
            });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [product?.id]);

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
  const images = (product.image_urls ?? []).slice(0, 4);
  const sellerInitials = (seller?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const isOwner = !!user && user.id === product.seller_id;
  const canReview = !!user && !isOwner && !hasReviewed;

  const buy = async () => {
    if (!user) return;
    if (user.id === product.seller_id) return toast.error("You can't buy your own product");
    if (product.product_type === "physical" && product.stock_count <= 0) return toast.error("Out of stock");
    setPaying(true);
    try {
      const res = await payWithPaystack({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: product.price,
        metadata: { product_id: product.id, kind: "product" },
      });
      const authUser = await supabase.auth.getUser();
      const orderData = {
        customer_id: authUser.data.user!.id,
        provider_id: product.seller_id,
        product_id: product.id,
        service_id: null,
        kind: "product",
        service_title: product.title,
        amount: product.price,
        commission_amount: Math.round(product.price * 0.03 * 100) / 100,
        currency: "NGN",
        notes: null,
        payment_ref: res.reference,
        payment_status: "paid",
        status: "confirmed",
      };
      const { error: orderError } = await supabase
        .from("orders")
        .insert(orderData)
        .select();
      if (orderError) {
        toast.error("Payment received but order record failed. Please contact support.");
        return;
      }
      if (product.product_type === "physical") {
        await supabase.from("products").update({ stock_count: Math.max(0, product.stock_count - 1) }).eq("id", product.id);
      }
      const { error: notifyError } = await supabase.from("notifications").insert({
        user_id: product.seller_id,
        recipient_id: product.seller_id,
        sender_id: user.id,
        type: "new_order",
        title: "New order",
        message: `You received a new order for "${product.title}".`,
        body: `You received a new order for "${product.title}".`,
        read: false,
      } as any);
      if (notifyError) console.warn("Seller notification failed:", notifyError);
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
      const sellerName = seller.full_name || seller.username || "there";
      const prefilled = `Hi ${sellerName} 👋 I just saw your product ${product.title} on the EasyMeet Shop and I'm interested. Can you tell me more about it?`;
      navigate({ to: "/messages", search: { c: cid, m: prefilled } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open chat");
    }
  };

  const submitReview = async () => {
    if (!user || !product) return;
    if (hasReviewed) {
      setReviewOpen(false);
      return;
    }
    if (reviewRating < 1) {
      toast.error("Please select a star rating");
      return;
    }
    setSubmittingReview(true);
    const { error } = await supabase.from("product_reviews").insert({
      product_id: product.id,
      reviewer_id: user.id,
      rating: reviewRating,
      comment: reviewComment.trim() || null,
      created_at: new Date().toISOString(),
    } as any);
    setSubmittingReview(false);
    if (error) {
      if ((error as any).code === "23505") {
        setHasReviewed(true);
        setReviewOpen(false);
        toast.message("You've already reviewed this product.");
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success("Review submitted!");
    setHasReviewed(true);
    setReviewOpen(false);
    setReviewRating(0);
    setReviewComment("");
    const { data } = await supabase
      .from("product_reviews")
      .select("*, reviewer:reviewer_id(id, full_name, username, avatar_url)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });
    setReviews((data as ProductReview[]) ?? []);
    const { data: prodData } = await supabase
      .from("products")
      .select("avg_rating, review_count")
      .eq("id", product.id)
      .maybeSingle();
    if (prodData) {
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              avg_rating: (prodData as any).avg_rating,
              review_count: (prodData as any).review_count,
            }
          : prev
      );
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/shop"><ArrowLeft className="h-4 w-4 mr-1" /> Back to shop</Link>
      </Button>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          {/* Mobile: swipeable horizontal gallery with dots */}
          <div className="md:hidden">
            {images.length === 0 ? (
              <div className="aspect-square rounded-2xl overflow-hidden bg-secondary border border-border grid place-items-center text-muted-foreground">
                <Package className="h-12 w-12" />
              </div>
            ) : (
              <>
                <div
                  ref={scrollerRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const idx = Math.round(el.scrollLeft / el.clientWidth);
                    if (idx !== activeImg) setActiveImg(idx);
                  }}
                  className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl border border-border bg-secondary scrollbar-hide"
                  style={{ scrollbarWidth: "none" }}
                >
                  {images.map((src, i) => (
                    <div key={i} className="shrink-0 w-full aspect-square snap-center">
                      <img src={src} alt={`${product.title} ${i + 1}`} className="w-full h-full object-cover" draggable={false} />
                    </div>
                  ))}
                </div>
                {images.length > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        aria-label={`Go to image ${i + 1}`}
                        onClick={() => {
                          const el = scrollerRef.current;
                          if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
                          setActiveImg(i);
                        }}
                        className={`h-2 rounded-full transition-all ${i === activeImg ? "w-6 bg-primary" : "w-2 bg-muted-foreground/40"}`}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Desktop: main + thumbnails */}
          <div className="hidden md:block">
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
              <div className="mt-3 grid grid-cols-4 gap-2">
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 ${i === activeImg ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">{product.product_type}</Badge>
            {product.category && <Badge variant="secondary">{product.category}</Badge>}
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold leading-tight">{product.title}</h1>
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

          <div className="mt-6">
            {isOwner ? (
              <div className="h-11 grid place-items-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                This is your listing
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={buy} disabled={paying} className="bg-gradient-brand flex-1 h-11">
                  {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Buy Now
                </Button>
                <Button onClick={message} variant="outline" className="flex-1 h-11">
                  <MessageCircle className="h-4 w-4 mr-2" /> Message Seller
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reviews & Ratings */}
      <div className="mt-10 border-t border-border pt-8">
        <h2 className="text-xl font-bold">Reviews & Ratings</h2>
        <div className="mt-2 flex items-center gap-3">
          <StarRating value={Number(product.avg_rating ?? 0)} count={Number(product.review_count ?? 0)} size={20} />
          <span className="text-sm text-muted-foreground">{product.review_count ?? 0} reviews</span>
        </div>

        {canReview && (
          <Button onClick={() => setReviewOpen(true)} variant="outline" className="mt-4">
            <Star className="h-4 w-4 mr-2" /> Leave a Review
          </Button>
        )}

        <div className="mt-6 space-y-4">
          {reviews.map((r) => {
            const initials = (r.reviewer?.full_name || "U").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={r.reviewer?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.reviewer?.full_name || r.reviewer?.username || "Customer"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <StarRating value={r.rating} size={14} showNumber={false} />
                </div>
                {r.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}
              </div>
            );
          })}
          {reviews.length === 0 && (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          )}
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave a review</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-1 py-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setReviewHover(n)}
                onMouseLeave={() => setReviewHover(0)}
                onClick={() => setReviewRating(n)}
                className="p-1"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                <Star
                  className={`h-7 w-7 ${(reviewHover || reviewRating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                />
              </button>
            ))}
          </div>
          <Textarea
            rows={3}
            maxLength={500}
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Share your experience (optional)"
          />
          <div className="text-right text-xs text-muted-foreground">{reviewComment.length}/500</div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button onClick={submitReview} disabled={submittingReview} className="bg-gradient-brand">
              {submittingReview ? "Submitting…" : "Submit review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
