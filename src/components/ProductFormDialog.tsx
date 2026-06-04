import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  supabase,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductType,
} from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Loader2, ImagePlus, X, FileUp } from "lucide-react";
import { toast } from "sonner";
import { optimizeImage } from "@/lib/imageOptimize";

const MAX_IMAGES = 4;

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
  onSaved: (p: Product) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [category, setCategory] = useState<string>("Other");
  const [productType, setProductType] = useState<ProductType>("physical");
  const [stock, setStock] = useState<string>("1");
  const [isActive, setIsActive] = useState(true);
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [digitalPath, setDigitalPath] = useState<string | null>(null);
  const [digitalFile, setDigitalFile] = useState<File | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const digRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(product?.title ?? "");
    setDescription(product?.description ?? "");
    setPrice(product?.price ? String(product.price) : "");
    setCategory(product?.category ?? "Other");
    setProductType(product?.product_type ?? "physical");
    setStock(product?.stock_count != null ? String(product.stock_count) : "1");
    setIsActive(product?.is_active ?? true);
    setExistingUrls(product?.image_urls ?? []);
    setNewFiles([]);
    setPreviews([]);
    setDigitalPath(product?.digital_file_url ?? null);
    setDigitalFile(null);
  }, [open, product]);

  const allImages = [...existingUrls, ...previews];

  const onAddImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const room = MAX_IMAGES - allImages.length;
    if (room <= 0) {
      toast.error(`Max ${MAX_IMAGES} images`);
      return;
    }
    setOptimizing(true);
    try {
      const slice = files.slice(0, room);
      const optimized = await Promise.all(slice.map((f) => optimizeImage(f)));
      setNewFiles((cur) => [...cur, ...optimized]);
      setPreviews((cur) => [...cur, ...optimized.map((f) => URL.createObjectURL(f))]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't process images");
    } finally {
      setOptimizing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    if (idx < existingUrls.length) {
      setExistingUrls((cur) => cur.filter((_, i) => i !== idx));
    } else {
      const j = idx - existingUrls.length;
      setNewFiles((cur) => cur.filter((_, i) => i !== j));
      setPreviews((cur) => cur.filter((_, i) => i !== j));
    }
  };

  const onDigital = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) return toast.error("Digital file too large (max 100MB)");
    setDigitalFile(f);
  };

  const save = async () => {
    if (!user) return;
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");
    if (productType === "physical" && (!stock || Number(stock) < 0)) {
      return toast.error("Enter stock count");
    }
    if (productType === "digital" && !digitalFile && !digitalPath) {
      return toast.error("Upload a digital file");
    }
    setSaving(true);
    try {
      // upload new images
      const uploadedUrls: string[] = [];
      for (const f of newFiles) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage
          .from("product-images")
          .upload(path, f, { upsert: false, contentType: f.type, cacheControl: "3600" });
        if (error) throw error;
        uploadedUrls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      const image_urls = [...existingUrls, ...uploadedUrls];

      // upload digital file (store path in bucket, not public URL)
      let digital_file_url = digitalPath;
      if (productType === "digital" && digitalFile) {
        const ext = (digitalFile.name.split(".").pop() || "bin").toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("digital-products")
          .upload(path, digitalFile, { upsert: false, contentType: digitalFile.type });
        if (error) throw error;
        digital_file_url = path;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        price: priceNum,
        category,
        product_type: productType,
        image_urls,
        digital_file_url,
        stock_count: productType === "physical" ? Number(stock) : 0,
        is_active: isActive,
      };

      if (product) {
        const { data, error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id)
          .select("*")
          .single();
        if (error) throw error;
        onSaved(data as Product);
        toast.success("Product updated successfully");
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ ...payload, seller_id: user.id })
          .select("*")
          .single();
        if (error) throw error;
        onSaved(data as Product);
        toast.success("Product added successfully");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add new product"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ankara Tote Bag" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price (NGN) *</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Type</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["physical", "digital"] as ProductType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setProductType(t)}
                  className={`rounded-lg border p-2 text-sm capitalize ${
                    productType === t ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "border-border"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {productType === "physical" ? (
            <div>
              <Label>Stock count *</Label>
              <Input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label>Digital file {digitalPath ? "(already uploaded)" : "*"}</Label>
              <label className="mt-1 flex items-center justify-center gap-2 h-16 rounded-lg border border-dashed border-border cursor-pointer text-sm text-muted-foreground hover:bg-secondary">
                <FileUp className="h-4 w-4" />
                {digitalFile ? digitalFile.name : digitalPath ? "Replace file" : "Upload file (PDF, ZIP, MP4…)"}
                <input ref={digRef} type="file" className="hidden" onChange={onDigital} />
              </label>
              <p className="text-xs text-muted-foreground mt-1">Customers get a secure download link after payment.</p>
            </div>
          )}
          <div>
            <Label>Images (up to {MAX_IMAGES})</Label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {allImages.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {allImages.length < MAX_IMAGES && (
                <label className="aspect-square rounded-lg border border-dashed border-border cursor-pointer hover:bg-secondary grid place-items-center text-xs text-muted-foreground">
                  {optimizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <ImagePlus className="h-4 w-4" />
                      <span>Add</span>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onAddImages} disabled={optimizing} />
                </label>
              )}
            </div>
            {optimizing && <p className="text-xs text-muted-foreground mt-1">Optimising image…</p>}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">Show in marketplace</div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || optimizing} className="bg-gradient-brand">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {product ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}