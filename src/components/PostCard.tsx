import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Post } from "@/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationTicks } from "./VerificationTicks";
import { Heart, MessageCircle, Share2, MoreHorizontal, Trash2, Rocket } from "lucide-react";
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
        "rounded-2xl glass-card overflow-hidden lift-hover hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
        isBoosted && "gold-border-shimmer",
      )}
    >
      {isBoosted && (
        <div className="px-4 sm:px-5 pt-3 -mb-1 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider gold-shimmer text-white shadow-[0_0_10px_rgba(245,193,74,0.55)]">
            <Rocket className="h-3 w-3" /> Sponsored
          </span>
        </div>
      )}
      <div className="p-4 sm:p-5 pb-3 flex items-start gap-3">
        <Link to="/profile/$id" params={{ id: post.author_id }} className="avatar-ring shrink-0">
          <Avatar className="h-10 w-10 border-2 border-background">
            <AvatarImage src={a?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              to="/profile/$id"
              params={{ id: post.author_id }}
              className="font-semibold hover:text-primary truncate"
            >
              {a?.full_name || a?.username || "User"}
            </Link>
            <VerificationTicks
              blue={a?.blue_tick}
              white={a?.white_tick}
              gold={a?.gold_tick}
              size="sm"
            />
            {a?.role && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {a.role}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</div>
        </div>
        {isMine && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2">
                <MoreHorizontal className="h-5 w-5" />
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
      </div>

      {body && (
        <div className="px-4 sm:px-5 pb-3 text-sm whitespace-pre-wrap break-words">
          <RichText text={body} />
        </div>
      )}

      {mediaUrl && (
        <div className="bg-secondary">
          {mediaType === "video" ? (
            <video ref={videoRef} src={mediaUrl} controls playsInline className="w-full max-h-[520px]" />
          ) : (
            <img src={mediaUrl} alt="" className="w-full max-h-[520px] object-cover" />
          )}
        </div>
      )}

      <div className="px-2 sm:px-3 py-1 flex items-center gap-1 border-t border-border">
        <Button variant="ghost" size="sm" onClick={handleLike} className="gap-2 rounded-full hover:bg-primary/10">
          <Heart
            key={`${post.id}-${isLiked}`}
            className={cn(
              "h-4 w-4 transition-colors",
              isLiked ? "fill-[var(--coral)] text-[var(--coral)] heart-pop" : "",
            )}
          />
          <span className="tabular-nums">{likeCount}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenComments(post.id)} className="gap-2 rounded-full hover:bg-primary/10">
          <MessageCircle className="h-4 w-4" />
          <span className="tabular-nums">{post.comment_count ?? 0}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={share} className="gap-2 ml-auto rounded-full hover:bg-primary/10">
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
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