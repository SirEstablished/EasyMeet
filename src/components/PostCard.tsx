import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Post } from "@/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationTicks } from "./VerificationTicks";
import { Heart, MessageCircle, MoreHorizontal, Trash2, Rocket, Bookmark, Share as ShareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/timeAgo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoostPostModal } from "./BoostPostModal";
import { RichText } from "./RichText";

export function PostCard({
  post,
  onOpenComments,
  onDeleted,
}: {
  post: Post;
  onOpenComments: (postId: string) => void;
  onDeleted?: (postId: string) => void;
}) {
  const { user } = useAuth();
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [boostUntil, setBoostUntil] = useState<string | null>(post.boost_until);
  const [boostedFlag, setBoostedFlag] = useState(!!post.is_boosted);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMine = user?.id === post.author_id;
  const a = post.author;
  const initials = (a?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const body = post.body ?? post.content ?? "";
  const mediaUrl = post.media_urls?.[0] ?? post.image_url ?? null;
  const mediaType = post.media_type ?? (mediaUrl ? "image" : null);
  const isBoosted = boostedFlag && boostUntil && new Date(boostUntil) > new Date();

  const fetchLikes = async () => {
    const { count } = await supabase
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id);
    setLikeCount(count || 0);

    if (user) {
      const { data: userLike } = await supabase
        .from("post_likes")
        .select("user_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsLiked(!!userLike);
    } else {
      setIsLiked(false);
    }
  };

  useEffect(() => {
    fetchLikes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, user?.id]);

  // Realtime subscription: refresh like count whenever any post_like row changes
  // for THIS post, so all viewers see the new count instantly.
  useEffect(() => {
    const channel = supabase
      .channel(`post-likes-${post.id}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "post_likes", filter: `post_id=eq.${post.id}` } as never,
        () => {
          void fetchLikes();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, user?.id]);

  // Auto-pause videos when scrolled out of view; resume when back in view if user had played them.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let userInitiated = false;
    const onPlay = () => {
      userInitiated = true;
    };
    el.addEventListener("play", onPlay);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.5) {
            if (!el.paused) el.pause();
          } else if (userInitiated && el.paused) {
            el.play().catch(() => {});
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.removeEventListener("play", onPlay);
    };
  }, [mediaUrl, mediaType]);

  const handleLike = async () => {
    if (!user || busy) return;
    setBusy(true);
    if (isLiked) {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", user.id);
      if (error) toast.error("Couldn't unlike post");
    } else {
      const { error } = await supabase
        .from("post_likes")
        .insert({ post_id: post.id, user_id: user.id });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        toast.error("Couldn't like post");
      }
    }
    await fetchLikes();
    setBusy(false);
  };

  const share = async () => {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Post link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDeleted?.(post.id);
  };

  return (
    <article
      id={`post-${post.id}`}
      className={cn(
        "rounded-2xl bg-card border border-border/50 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_20px_-14px_rgba(15,23,42,0.15)] overflow-hidden transition hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_18px_44px_-22px_rgba(108,76,246,0.28)]",
        isBoosted && "ring-1 ring-amber-300/60",
      )}
    >
      {isBoosted && (
        <div className="px-4 pt-4 -mb-1 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-400 to-amber-500 text-white">
            <Rocket className="h-3 w-3" /> Sponsored
          </span>
        </div>
      )}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <Link to="/profile/$id" params={{ id: post.author_id }} className="shrink-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={a?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              to="/profile/$id"
              params={{ id: post.author_id }}
              className="font-bold text-[15px] leading-tight text-foreground hover:text-primary truncate"
            >
              {a?.full_name || a?.username || "User"}
            </Link>
            <VerificationTicks
              blue={a?.blue_tick}
              white={a?.white_tick}
              gold={a?.gold_tick}
              size="sm"
            />
          </div>
          {a?.role && (
            <div className="text-[12px] text-muted-foreground capitalize mt-0.5">{a.role}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
          {isMine && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isBoosted && (
                <DropdownMenuItem onClick={() => setBoostOpen(true)}>
                  <Rocket className="h-4 w-4 mr-2" /> Boost post
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={remove} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
          {!isMine && (
            <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {body && (
        <div className="px-4 pb-3">
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
            <RichText text={body} />
          </div>
        </div>
      )}

      {mediaUrl && (
        <div className="pb-3">
          <div className="overflow-hidden bg-muted">
          {mediaType === "video" ? (
            <video ref={videoRef} src={mediaUrl} controls playsInline className="w-full max-h-[520px]" />
          ) : (
            <img src={mediaUrl} alt="" className="w-full max-h-[520px] object-cover" />
          )}
          </div>
        </div>
      )}

      <div className="px-4 pb-4 pt-1 flex items-center gap-5">
        <button
          type="button"
          onClick={handleLike}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/80 hover:text-foreground transition"
        >
          <Heart
            key={`${post.id}-${isLiked}`}
            className={cn(
              "h-5 w-5 transition-colors",
              isLiked ? "fill-rose-500 text-rose-500" : "text-foreground/70",
            )}
          />
          <span className={cn("tabular-nums", isLiked && "text-rose-500")}>{likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenComments(post.id)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/80 hover:text-foreground transition"
        >
          <MessageCircle className="h-5 w-5 text-foreground/70" />
          <span className="tabular-nums">{post.comment_count ?? 0}</span>
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/80 hover:text-foreground transition"
        >
          <ShareIcon className="h-5 w-5 text-foreground/70" />
        </button>
        <button
          type="button"
          onClick={share}
          className="ml-auto inline-flex items-center justify-center h-9 w-9 rounded-full text-foreground/70 hover:text-primary hover:bg-primary/5 transition"
          aria-label="Save post"
        >
          <Bookmark className="h-5 w-5" />
        </button>
      </div>

      <BoostPostModal
        open={boostOpen}
        onOpenChange={setBoostOpen}
        postId={post.id}
        onBoosted={(_id, end) => { setBoostedFlag(true); setBoostUntil(end); }}
      />
    </article>
  );
}