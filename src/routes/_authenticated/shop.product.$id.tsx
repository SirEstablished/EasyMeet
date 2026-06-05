import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, formatNgn, type Product } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerificationTicks } from "@/components/VerificationTicks";
import { ArrowLeft, Loader2, MessageCircle, Package } from "lucide-react";
import { payWithPaystack } from "@/lib/paystack";
import { getOrCreateConversation } from "@/lib/conversations";
import { toast } from "sonner";

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
      console.log("Payment success fired, reference:", res);
      console.log("Product:", product);
      const authUser = await supabase.auth.getUser();
      console.log("Current user:", authUser);
      const orderData = {
        customer_id: authUser.data.user!.id,
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
      };
      console.log("Order data to insert:", orderData);
      const { data: insertData, error: orderError } = await supabase
        .from("orders")
        .insert(orderData)
        .select();
      console.log("Insert result:", insertData);
      console.log("Insert error:", orderError);
      if (orderError) {
        alert("Order save failed: " + orderError.message);
        toast.error("Payment received but order record failed. Please contact support.");
        return;
      }
      alert("Order saved successfully!");
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
      navigate({ to: "/messages", search: { c: cid } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open chat");
    }
  };

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

          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <Button onClick={buy} disabled={paying} className="bg-gradient-brand flex-1 h-11">
              {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Buy Now
            </Button>
            <Button onClick={message} variant="outline" className="flex-1 h-11">
              <MessageCircle className="h-4 w-4 mr-2" /> Message Seller
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}