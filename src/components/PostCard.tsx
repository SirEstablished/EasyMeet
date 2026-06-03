import { Link } from "@tanstack/react-router";
import { useState } from "react";
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
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count ?? 0);
  const isMine = user?.id === post.author_id;
  const a = post.author;
  const initials = (a?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const body = post.body ?? post.content ?? "";
  const mediaUrl = post.media_urls?.[0] ?? post.image_url ?? null;
  const mediaType = post.media_type ?? (mediaUrl ? "image" : null);
  const isBoosted = post.is_boosted && post.boost_until && new Date(post.boost_until) > new Date();

  const toggleLike = async () => {
    if (!user) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    if (next) {
      const { error } = await supabase
        .from("post_likes")
        .insert({ post_id: post.id, user_id: user.id });
      if (error && !error.message.includes("duplicate")) {
        setLiked(false);
        setLikes((n) => n - 1);
        toast.error("Couldn't like post");
      }
    } else {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", user.id);
      if (error) {
        setLiked(true);
        setLikes((n) => n + 1);
      }
    }
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
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {isBoosted && (
        <div className="px-4 sm:px-5 pt-3 -mb-1 flex items-center gap-1.5 text-xs text-primary font-medium">
          <Rocket className="h-3.5 w-3.5" /> Boosted
        </div>
      )}
      <div className="p-4 sm:p-5 pb-3 flex items-start gap-3">
        <Link to="/profile/$id" params={{ id: post.author_id }}>
          <Avatar className="h-10 w-10">
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
              <DropdownMenuItem onClick={remove} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {body && (
        <div className="px-4 sm:px-5 pb-3 text-sm whitespace-pre-wrap break-words">{body}</div>
      )}

      {mediaUrl && (
        <div className="bg-secondary">
          {mediaType === "video" ? (
            <video src={mediaUrl} controls className="w-full max-h-[520px]" />
          ) : (
            <img src={mediaUrl} alt="" className="w-full max-h-[520px] object-cover" />
          )}
        </div>
      )}

      <div className="px-2 sm:px-3 py-1 flex items-center gap-1 border-t border-border">
        <Button variant="ghost" size="sm" onClick={toggleLike} className="gap-2">
          <Heart className={cn("h-4 w-4", liked && "fill-red-500 text-red-500")} />
          <span className="tabular-nums">{likes}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenComments(post.id)} className="gap-2">
          <MessageCircle className="h-4 w-4" />
          <span className="tabular-nums">{post.comment_count ?? 0}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={share} className="gap-2 ml-auto">
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </article>
  );
}