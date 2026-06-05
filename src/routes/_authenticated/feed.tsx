import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Post } from "@/integrations/supabase/client";
import { CreatePostCard } from "@/components/CreatePostCard";
import { PostCard } from "@/components/PostCard";
import { CommentsDrawer } from "@/components/CommentsDrawer";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    load();
  }, [load]);

  const onPosted = (p: Post) => setPosts((cur) => [p, ...cur]);
  const onDeleted = (id: string) => setPosts((cur) => cur.filter((p) => p.id !== id));
  const adjustComment = (id: string, delta: number) =>
    setPosts((cur) =>
      cur.map((p) => (p.id === id ? { ...p, comment_count: (p.comment_count ?? 0) + delta } : p)),
    );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div>
        <h1 className="text-3xl font-extrabold text-gradient-tri">Feed</h1>
        <p className="text-sm text-muted-foreground">
          See what professionals and businesses are sharing.
        </p>
      </div>

      <CreatePostCard onPosted={onPosted} />

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
          No posts yet. Be the first to share something.
        </div>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onOpenComments={setCommentsFor}
            onDeleted={onDeleted}
          />
        ))
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