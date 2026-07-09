import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Trash2, Heart, Smile } from "lucide-react";
import { supabase, type Comment } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { timeAgo } from "@/lib/timeAgo";
import { containsPhone, PHONE_BLOCK_MESSAGE } from "@/lib/phoneCheck";
import { MentionTextarea } from "./MentionTextarea";
import { RichText } from "./RichText";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EMOJIS = ["😀", "😂", "🥰", "👍", "🔥", "🎉", "🙏", "😍", "😎", "👏", "💯", "❤️"];

function readLikes(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`cmt-like:${id}`) === "1";
  } catch {
    return false;
  }
}
function writeLike(id: string, liked: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (liked) localStorage.setItem(`cmt-like:${id}`, "1");
    else localStorage.removeItem(`cmt-like:${id}`);
  } catch {
    /* ignore */
  }
}

export function InlineComments({
  postId,
  onCountChange,
}: {
  postId: string;
  onCountChange?: (postId: string, delta: number) => void;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [likes, setLikes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const reload = () =>
      supabase
        .from("comments")
        .select("*, author:author_id(id, full_name, username, avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (cancelled) return;
          const rows = (data as Comment[]) ?? [];
          setComments(rows);
          const l: Record<string, boolean> = {};
          rows.forEach((r) => {
            l[r.id] = readLikes(r.id);
          });
          setLikes(l);
          setLoading(false);
        });

    reload();

    const channel = supabase
      .channel(`inline-comments-${postId}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` } as never,
        () => reload(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [postId]);

  const toggleLike = (id: string) => {
    setLikes((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeLike(id, next[id]);
      return next;
    });
  };

  const insertReply = (username?: string | null, fallback?: string | null) => {
    const handle = username || fallback || "user";
    const prefix = `@${handle} `;
    setText((cur) => (cur.startsWith(prefix) ? cur : prefix + cur.replace(/^@\S+\s*/, "")));
  };

  const insertEmoji = (e: string) => {
    setText((cur) => cur + e);
  };

  const submit = async () => {
    if (!user) return;
    const body = text.trim();
    if (!body) return;
    if (containsPhone(body)) {
      toast.error(PHONE_BLOCK_MESSAGE.replace("messages", "comments"));
      return;
    }
    setSending(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, author_id: user.id, body })
      .select("*, author:author_id(id, full_name, username, avatar_url)")
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComments((c) => [...c, data as Comment]);
    setText("");
    onCountChange?.(postId, 1);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComments((c) => c.filter((x) => x.id !== id));
    onCountChange?.(postId, -1);
  };

  return (
    <div className="border-t border-border/60 bg-muted/20">
      {/* Comments list */}
      <div className="max-h-80 overflow-y-auto px-4 pt-3">
        {loading ? (
          <div className="py-6 text-sm text-muted-foreground text-center">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            No comments yet. Be the first to comment.
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-border/40">
            {comments.map((c) => {
              const name = c.author?.full_name || c.author?.username || "User";
              const initials = name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const liked = !!likes[c.id];
              return (
                <div key={c.id} className="flex gap-2.5 py-3">
                  <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                    <AvatarImage src={c.author?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-2xl bg-card border border-border/40 px-3 py-2">
                      <div className="text-[13px] font-bold text-foreground truncate">
                        {name}
                      </div>
                      <div className="text-[14px] leading-snug whitespace-pre-wrap break-words text-foreground/90">
                        <RichText text={c.body} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 pl-1 text-[12px] text-muted-foreground">
                      <span>{timeAgo(c.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => insertReply(c.author?.username, c.author?.full_name)}
                        className="font-semibold hover:text-primary transition"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLike(c.id)}
                        className={cn(
                          "font-semibold transition",
                          liked ? "text-rose-500" : "hover:text-primary",
                        )}
                      >
                        Like
                      </button>
                      {user?.id === c.author_id && (
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          className="inline-flex items-center gap-0.5 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLike(c.id)}
                    className="shrink-0 pt-1"
                    aria-label={liked ? "Unlike comment" : "Like comment"}
                  >
                    <Heart
                      className={cn(
                        "h-4 w-4 transition-colors",
                        liked ? "fill-rose-500 text-rose-500" : "text-foreground/40 hover:text-foreground/60",
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-4 py-3 flex items-center gap-2 border-t border-border/40">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
            {user
              ? (user.email?.[0] ?? "U").toUpperCase()
              : "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 flex items-center gap-1 rounded-full bg-muted/60 pl-3 pr-1.5 py-1 focus-within:ring-2 focus-within:ring-primary/30 transition">
          <div className="flex-1 min-w-0">
            <MentionTextarea
              asInput
              value={text}
              onChange={setText}
              placeholder="Write a comment…"
              maxLength={500}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 py-1 text-[14px]"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-7 w-7 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-background/60 transition"
                aria-label="Insert emoji"
              >
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-52 p-2">
              <div className="grid grid-cols-6 gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => insertEmoji(e)}
                    className="h-8 w-8 rounded-lg text-lg hover:bg-muted transition"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={sending || !text.trim()}
          className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
