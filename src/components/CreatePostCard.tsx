import { useRef, useState, type ChangeEvent } from "react";
import { supabase, type Post } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { containsPhoneNumber } from "@/lib/timeAgo";
import { BoostPostModal } from "./BoostPostModal";
import { optimizeImage } from "@/lib/imageOptimize";

const MAX = 500;

export function CreatePostCard({ onPosted }: { onPosted: (p: Post) => void }) {
  const { user, profile } = useAuth();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [lastPostId, setLastPostId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!profile || (profile.role !== "professional" && profile.role !== "business")) return null;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50MB)");
      return;
    }
    if (f.type.startsWith("image/")) {
      setOptimizing(true);
      try {
        const opt = await optimizeImage(f);
        setFile(opt);
        setPreview(URL.createObjectURL(opt));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't process image");
      } finally {
        setOptimizing(false);
      }
    } else {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!user) return;
    const text = body.trim();
    if (!text && !file) {
      toast.error("Add some text or media");
      return;
    }
    if (containsPhoneNumber(text)) {
      toast.error("Phone numbers are not allowed in posts");
      return;
    }
    setPosting(true);
    try {
      let media_urls: string[] = [];
      let media_type: "image" | "video" | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("post-media")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("post-media").getPublicUrl(path);
        media_urls = [data.publicUrl];
        media_type = file.type.startsWith("video") ? "video" : "image";
      }
      const { data, error } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          body: text,
          media_urls,
          media_type,
        })
        .select("*")
        .single();
      if (error) throw error;
      onPosted({
        ...(data as Post),
        author: {
          id: profile.id,
          full_name: profile.full_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          role: profile.role,
          blue_tick: profile.blue_tick,
          white_tick: profile.white_tick,
          gold_tick: profile.gold_tick,
        },
        like_count: 0,
        comment_count: 0,
        liked_by_me: false,
      });
      setBody("");
      clearFile();
      setLastPostId((data as Post).id);
      setBoostOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to post";
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  const initials = (profile.full_name || "U")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="rounded-2xl glass-card p-4 sm:p-5 lift-hover focus-within:shadow-lg focus-within:-translate-y-0.5">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="What's on your mind?"
              maxLength={MAX}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="resize-none border-0 focus-visible:ring-0 shadow-none px-0"
            />
            {preview && (
              <div className="relative mt-2 rounded-xl overflow-hidden border border-border">
                {file?.type.startsWith("video") ? (
                  <video src={preview} controls className="w-full max-h-80" />
                ) : (
                  <img src={preview} alt="" className="w-full max-h-80 object-cover" />
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove media"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary cursor-pointer">
                  <ImagePlus className="h-4 w-4" />
                  <span>{optimizing ? "Optimising image…" : "Photo / Video"}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,video/mp4"
                    className="hidden"
                    onChange={onFile}
                    disabled={optimizing}
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {body.length}/{MAX}
                </span>
                <Button onClick={submit} disabled={posting} className="bg-gradient-brand">
                  {posting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Post
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BoostPostModal open={boostOpen} onOpenChange={setBoostOpen} postId={lastPostId} />
    </>
  );
}