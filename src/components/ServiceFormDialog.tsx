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
import { supabase, SERVICE_CATEGORIES, type Service } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  service?: Service | null;
  onSaved: (s: Service) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [category, setCategory] = useState<string>("Other");
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(service?.title ?? "");
    setDescription(service?.description ?? "");
    setPrice(service?.price_ngn ? String(service.price_ngn) : "");
    setCategory(service?.category ?? "Other");
    setIsActive(service?.is_active ?? true);
    setImageUrl(service?.image_url ?? null);
    setFile(null);
    setPreview(null);
  }, [open, service]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("Image too large (max 5MB)");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!user) return;
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");
    setSaving(true);
    try {
      let finalImage = imageUrl;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("service-images")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        finalImage = supabase.storage.from("service-images").getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        price_ngn: priceNum,
        category,
        is_active: isActive,
        image_url: finalImage,
      };
      if (service) {
        const { data, error } = await supabase
          .from("services")
          .update(payload)
          .eq("id", service.id)
          .select("*")
          .single();
        if (error) throw error;
        onSaved(data as Service);
        toast.success("Service updated");
      } else {
        const { data, error } = await supabase
          .from("services")
          .insert({ ...payload, owner_id: user.id })
          .select("*")
          .single();
        if (error) throw error;
        onSaved(data as Service);
        toast.success("Service created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = preview || imageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add new service"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wedding Photography" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price (NGN) *</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="50000" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Image</Label>
            {previewSrc ? (
              <div className="relative mt-1 rounded-lg overflow-hidden border border-border">
                <img src={previewSrc} alt="" className="w-full max-h-48 object-cover" />
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null); setImageUrl(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="mt-1 flex items-center justify-center gap-2 h-24 rounded-lg border border-dashed border-border cursor-pointer text-sm text-muted-foreground hover:bg-secondary">
                <ImagePlus className="h-4 w-4" /> Upload image
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">Show this service publicly</div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-brand">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {service ? "Save changes" : "Create service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}