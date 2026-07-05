import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Post } from "@/integrations/supabase/client";
import { CreatePostCard } from "@/components/CreatePostCard";
import { PostCard } from "@/components/PostCard";
import { CommentsDrawer } from "@/components/CommentsDrawer";
import { Loader2, Lock, Plus } from "lucide-react";
import { useLiveData } from "@/hooks/use-live-data";
import { useAuth } from "@/lib/providers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

function FeedPage() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [tab, setTab] = useState<"for-you" | "following">("for-you");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: rawPosts } = await supabase
      .from("posts")
      .select(
        "*, author:author_id(id, full_name, username, avatar_url, role, blue_tick, white_tick, gold_tick)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const arr = (rawPosts as Post[]) ?? [];
    const ids = arr.map((p) => p.id);
    let commentMap = new Map<string, number>();
    if (ids.length) {
      const { data: comments } = await supabase
        .from("comments")
        .select("post_id")
        .in("post_id", ids);
      (comments ?? []).forEach((c: { post_id: string }) => {
        commentMap.set(c.post_id, (commentMap.get(c.post_id) ?? 0) + 1);
      });
    }
    const enriched = arr.map((p) => ({
      ...p,
      comment_count: commentMap.get(p.id) ?? 0,
    }));
    enriched.sort((a, b) => {
      const aB = !!(a.is_boosted && a.boost_until && new Date(a.boost_until) > new Date());
      const bB = !!(b.is_boosted && b.boost_until && new Date(b.boost_until) > new Date());
      if (aB !== bB) return aB ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setPosts(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useLiveData(["posts", "comments", "post_likes"], load);

  const canPost = profile?.role === "professional" || profile?.role === "business";
  const onPosted = (p: Post) => {
    setPosts((cur) => [p, ...cur]);
    setCreateOpen(false);
  };
  const onDeleted = (id: string) => setPosts((cur) => cur.filter((p) => p.id !== id));
  const adjustComment = (id: string, delta: number) =>
    setPosts((cur) =>
      cur.map((p) => (p.id === id ? { ...p, comment_count: (p.comment_count ?? 0) + delta } : p)),
    );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-2 pb-28 md:pb-10">
      {/* Minimal tabs with thin purple indicator */}
      <div className="flex items-center gap-6 border-b border-border/60 mb-4">
        {[
          { id: "for-you", label: "For You" },
          { id: "following", label: "Following" },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={
                "relative py-3 text-[15px] font-semibold transition " +
                (active ? "text-primary" : "text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {profile?.role === "customer" && (
        <div className="rounded-3xl bg-card border border-border/60 p-5 flex items-start gap-3 shadow-sm mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center text-primary shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div className="text-sm min-w-0">
            <div className="font-semibold text-foreground">Customer accounts can't post</div>
            <p className="text-muted-foreground mt-1">
              Only professionals and businesses can post on the feed.
            </p>
          </div>
        </div>
      )}

      {tab === "following" ? (
        <div className="rounded-3xl bg-card border border-border/60 border-dashed p-12 text-center text-sm text-muted-foreground">
          Posts from people you follow will appear here.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border/60 border-dashed p-12 text-center text-sm text-muted-foreground">
          No posts yet. Be the first to share something.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onOpenComments={setCommentsFor}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}

      <CommentsDrawer
        postId={commentsFor}
        open={!!commentsFor}
        onOpenChange={(v) => !v && setCommentsFor(null)}
        onCountChange={adjustComment}
      />

      {canPost && (
        <>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create post"
            className="fixed z-40 bottom-24 right-5 md:bottom-10 md:right-10 h-14 w-14 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--primary)_65%,transparent)] hover:scale-105 active:scale-95 transition"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="max-w-lg p-0 bg-transparent border-0 shadow-none">
              <DialogHeader className="sr-only">
                <DialogTitle>Create post</DialogTitle>
              </DialogHeader>
              <CreatePostCard onPosted={onPosted} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}