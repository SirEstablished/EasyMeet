import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Post } from "@/integrations/supabase/client";
import { CreatePostCard } from "@/components/CreatePostCard";
import { PostCard } from "@/components/PostCard";
import { CommentsDrawer } from "@/components/CommentsDrawer";
import { Loader2, Lock } from "lucide-react";
import { useLiveData } from "@/hooks/use-live-data";
import { useAuth } from "@/lib/providers";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

function FeedPage() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [tab, setTab] = useState<"for-you" | "following" | "saved">("for-you");

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

  const onPosted = (p: Post) => setPosts((cur) => [p, ...cur]);
  const onDeleted = (id: string) => setPosts((cur) => cur.filter((p) => p.id !== id));
  const adjustComment = (id: string, delta: number) =>
    setPosts((cur) =>
      cur.map((p) => (p.id === id ? { ...p, comment_count: (p.comment_count ?? 0) + delta } : p)),
    );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-28 md:pb-10 space-y-5">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Feed</h1>
      </div>

      {/* Segmented tabs */}
      <div className="rounded-2xl bg-muted/60 p-1 flex items-center text-sm font-semibold">
        {[
          { id: "for-you", label: "For You" },
          { id: "following", label: "Following" },
          { id: "saved", label: "Saved" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={
              "flex-1 h-10 rounded-xl transition " +
              (tab === t.id
                ? "bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {profile?.role === "customer" ? (
        <div className="rounded-3xl bg-card border border-border/60 p-5 flex items-start gap-3 shadow-sm">
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
      ) : tab === "for-you" ? (
        <CreatePostCard onPosted={onPosted} />
      ) : null}

      {tab !== "for-you" ? (
        <div className="rounded-3xl bg-card border border-border/60 border-dashed p-12 text-center text-sm text-muted-foreground">
          {tab === "following"
            ? "Posts from people you follow will appear here."
            : "Your saved posts will appear here."}
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
    </div>
  );
}