import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, formatNgn, type Product } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, EyeOff } from "lucide-react";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-products")({
  component: MyProductsPage,
});

function MyProductsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (!profile.sells_products) {
      toast.error("Your account is not set to sell products");
      navigate({ to: "/dashboard" });
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("products")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(error.message);
        setProducts((data as Product[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const onSaved = (p: Product) => {
    setProducts((cur) => {
      const i = cur.findIndex((x) => x.id === p.id);
      if (i >= 0) { const next = [...cur]; next[i] = p; return next; }
      return [p, ...cur];
    });
  };

  const onDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    setProducts((cur) => cur.filter((x) => x.id !== p.id));
    toast.success("Product deleted");
  };

  if (!profile) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-tri">My Products</h1>
          <p className="text-sm text-muted-foreground">Manage what you sell on EasyMeet.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-full bg-gradient-brand glow-primary w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" /> Add New Product
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
              <Plus className="h-5 w-5" />
            </div>
            You haven't added any products yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => {
              const cover = p.image_urls?.[0];
              return (
                <div key={p.id} className="group rounded-2xl glass-card overflow-hidden flex flex-col lift-hover hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
                  <div className="aspect-video bg-secondary overflow-hidden">
                    {cover ? (
                      <img src={cover} alt={p.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">No image</div>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{p.title}</h3>
                        <div className="font-extrabold text-gradient-brand mt-0.5">{formatNgn(p.price)}</div>
                      </div>
                      {!p.is_active && (
                        <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" />Hidden</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.category && <Badge variant="outline">{p.category}</Badge>}
                      <Badge variant="outline" className="capitalize">{p.product_type}</Badge>
                      {p.product_type === "physical" && (
                        <Badge variant="outline">Stock: {p.stock_count}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex-1">{p.description}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(p); setOpen(true); }} className="flex-1 rounded-full">
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(p)} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProductFormDialog open={open} onOpenChange={setOpen} product={editing} onSaved={onSaved} />
    </div>
  );
}