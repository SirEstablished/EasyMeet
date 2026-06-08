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
import { Loader2, ImagePlus, X, Lightbulb, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { optimizeImage } from "@/lib/imageOptimize";
import { useAuth } from "@/lib/providers";

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
  const { profile } = useAuth();
  const priceLocked = !!profile?.is_staff && !!service;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [category, setCategory] = useState<string>("Other");
  const [isActive, setIsActive] = useState(true);
  const [existingMedia, setExistingMedia] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGES = 6;

  const isVideoUrl = (u: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);

  const getErrorMessage = (error: unknown) => {
    if (!error) return "Unknown Supabase error";
    if (error instanceof Error) return error.message;
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTitle(service?.title ?? "");
    setDescription(service?.description ?? "");
    setPrice(service?.price ? String(service.price) : "");
    setCategory(service?.category ?? "Other");
    setIsActive(service?.is_active ?? true);
    const media = service?.media_urls ?? [];
    const imgs = media.filter((u) => !isVideoUrl(u));
    const vid = media.find((u) => isVideoUrl(u)) ?? null;
    // Fall back to legacy image_url if media_urls empty
    if (imgs.length === 0 && service?.image_url) imgs.push(service.image_url);
    setExistingMedia(imgs);
    setExistingVideoUrl(vid);
    setNewImageFiles([]);
    setNewImagePreviews([]);
    setVideoFile(null);
    setVideoPreview(null);
    setSubmitError(null);
  }, [open, service]);

  const totalImages = existingMedia.length + newImagePreviews.length;

  const onAddImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const room = MAX_IMAGES - totalImages;
    if (room <= 0) {
      toast.error(`Max ${MAX_IMAGES} images`);
      return;
    }
    setOptimizing(true);
    try {
      const optimized = await Promise.all(
        files.slice(0, room).map((f) => optimizeImage(f)),
      );
      setNewImageFiles((cur) => [...cur, ...optimized]);
      setNewImagePreviews((cur) => [...cur, ...optimized.map((f) => URL.createObjectURL(f))]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't process image");
    } finally {
      setOptimizing(false);
      if (imgRef.current) imgRef.current.value = "";
    }
  };

  const onAddVideo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) return toast.error("Please choose a video file");
    if (f.size > 50 * 1024 * 1024) return toast.error("Video too large (max 50MB)");
    setVideoFile(f);
    setVideoPreview(URL.createObjectURL(f));
    setExistingVideoUrl(null);
    if (vidRef.current) vidRef.current.value = "";
  };

  const removeImage = (idx: number) => {
    if (idx < existingMedia.length) {
      setExistingMedia((cur) => cur.filter((_, i) => i !== idx));
    } else {
      const j = idx - existingMedia.length;
      setNewImageFiles((cur) => cur.filter((_, i) => i !== j));
      setNewImagePreviews((cur) => cur.filter((_, i) => i !== j));
    }
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
    setExistingVideoUrl(null);
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Title is required");
    const trimmedPrice = price.trim();
    let priceNum: number | null = null;
    if (trimmedPrice !== "") {
      const n = Number(trimmedPrice);
      if (!Number.isFinite(n) || n < 0) return toast.error("Enter a valid price or leave blank");
      priceNum = n > 0 ? n : null;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setSaving(true);
    setSubmitError(null);
    try {
      // Upload new images
      const uploadedImages: string[] = [];
      for (const f of newImageFiles) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("service-media")
          .upload(path, f, { upsert: false, contentType: f.type, cacheControl: "3600" });
        if (upErr) throw upErr;
        uploadedImages.push(
          supabase.storage.from("service-media").getPublicUrl(path).data.publicUrl,
        );
      }

      // Upload new video (one)
      let videoUrl: string | null = existingVideoUrl;
      if (videoFile) {
        const ext = (videoFile.name.split(".").pop() || "mp4").toLowerCase();
        const path = `${user.id}/${Date.now()}-vid.${ext}`;
        const { error: vErr } = await supabase.storage
          .from("service-media")
          .upload(path, videoFile, { upsert: false, contentType: videoFile.type, cacheControl: "3600" });
        if (vErr) throw vErr;
        videoUrl = supabase.storage.from("service-media").getPublicUrl(path).data.publicUrl;
      }

      const media_urls = [
        ...existingMedia,
        ...uploadedImages,
        ...(videoUrl ? [videoUrl] : []),
      ];
      const finalImage = media_urls.find((u) => !isVideoUrl(u)) ?? null;

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        price: priceNum,
        currency: "NGN",
        category,
        is_active: isActive,
        image_url: finalImage,
        media_urls,
      };
      console.log("[services] payload", payload);
      if (service) {
        const { data, error } = await supabase
          .from("services")
          .update(payload)
          .eq("id", service.id)
          .select("*")
          .single();
        if (error) {
          console.error("[services] update error", error);
          throw error;
        }
        onSaved(data as Service);
        toast.success("Service updated successfully");
      } else {
        const insertPayload = {
          provider_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          price: priceNum,
          category: category,
          image_url: finalImage || null,
          media_urls,
          is_active: true,
        };

        console.log("[services] insert payload", insertPayload);

        const { data, error } = await supabase
          .from("services")
          .insert(insertPayload)
          .select("*")
          .single();
        console.log("[services] insert error object", error);
        if (error) {
          console.error("Insert error:", error);
          toast.error(error.message);
          throw error;
        }
        onSaved(data as Service);
        toast.success("Service added successfully");
      }
      onOpenChange(false);
    } catch (e) {
      const message = getErrorMessage(e);
      console.log("[services] save caught error object", e);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const allImageThumbs = [...existingMedia, ...newImagePreviews];
  const videoSrc = videoPreview || existingVideoUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add new service"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {submitError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive whitespace-pre-wrap">
              {submitError}
            </div>
          )}
          <div>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Wedding Photography"
            />
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <div>
                <span className="font-semibold text-foreground">Tip:</span>{" "}
                Use specific keywords in your service name so customers can find you easily.{" "}
                <span className="block mt-1 italic">
                  Example: Instead of "I do hair" write "Professional hair stylist specialising in
                  braids, weaves and natural hair in Lagos".
                </span>
              </div>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <div>
                <span className="font-semibold text-foreground">Tip:</span>{" "}
                Mention specialities, locations and outcomes so the right customers discover this
                service.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price (NGN)</Label>
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Leave blank for 'Contact for quote'"
              disabled={priceLocked}
              />
            <p className="text-[11px] text-muted-foreground mt-1">
              {priceLocked
                ? "Price is locked by the business."
                : "Optional — leave blank to display \"Contact for quote\"."}
            </p>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Portfolio media (up to {MAX_IMAGES} photos + 1 video)</Label>
            <div className="mt-1 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {allImageThumbs.map((src, i) => (
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
              {totalImages < MAX_IMAGES && (
                <label className="aspect-square rounded-lg border border-dashed border-border cursor-pointer hover:bg-secondary grid place-items-center text-xs text-muted-foreground">
                  {optimizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <ImagePlus className="h-4 w-4" />
                      <span>Add photo</span>
                    </div>
                  )}
                  <input
                    ref={imgRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onAddImages}
                    disabled={optimizing}
                  />
                </label>
              )}
            </div>
            <div className="mt-3">
              {videoSrc ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <video src={videoSrc} controls className="w-full max-h-56" />
                  <button
                    type="button"
                    onClick={removeVideo}
                    className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-16 rounded-lg border border-dashed border-border cursor-pointer text-sm text-muted-foreground hover:bg-secondary">
                  <VideoIcon className="h-4 w-4" />
                  Upload a video (optional, max 50MB)
                  <input
                    ref={vidRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={onAddVideo}
                  />
                </label>
              )}
            </div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-brand">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {service ? "Save changes" : "Create service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
