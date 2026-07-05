import { useEffect, useMemo, useRef, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Trash2, Heart, ChevronDown, Smile } from "lucide-react";
import { supabase, type Comment } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { timeAgo } from "@/lib/timeAgo";
import { containsPhone, PHONE_BLOCK_MESSAGE } from "@/lib/phoneCheck";
import { MentionTextarea } from "./MentionTextarea";
import { RichText } from "./RichText";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortMode = "newest" | "oldest";

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

export function CommentsDrawer({
  postId,
  open,
  onOpenChange,
  onCountChange,
}: {
  postId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCountChange?: (postId: string, delta: number) => void;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sort, setSort] = useState<SortMode>("newest");
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open || !postId) return;
    let cancelled = false;
    setLoading(true);
    const reload = () => supabase
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
      .channel(`comments-${postId}`)
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
  }, [open, postId]);

  const sortedComments = useMemo(() => {
    const arr = [...comments];
    arr.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === "newest" ? tb - ta : ta - tb;
    });
    return arr;
  }, [comments, sort]);

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
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const insertEmoji = (e: string) => {
    setText((cur) => cur + e);
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  const submit = async () => {
    if (!user || !postId) return;
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
    if (!postId) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComments((c) => c.filter((x) => x.id !== id));
    onCountChange?.(postId, -1);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] rounded-t-3xl border-0 bg-card p-0 shadow-[0_-10px_40px_-15px_rgba(15,23,42,0.15)]">
        {/* Header */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between">
          <DrawerTitle asChild>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              Comments
              <span className="text-primary tabular-nums">{comments.length}</span>
            </h2>
          </DrawerTitle>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 text-sm font-medium text-foreground/70 hover:text-foreground">
              {sort === "newest" ? "Newest" : "Oldest"}
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSort("newest")}>Newest</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("oldest")}>Oldest</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 divide-y divide-border/60">
          {loading ? (
            <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div>
          ) : sortedComments.length === 0 ? (
            <div className="py-10 text-sm text-muted-foreground text-center">
              Be the first to comment
            </div>
          ) : (
            sortedComments.map((c) => {
              const name = c.author?.full_name || c.author?.username || "User";
              const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
              const liked = !!likes[c.id];
              return (
                <div key={c.id} className="flex gap-3 py-4">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={c.author?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-foreground truncate">{name}</div>
                    <div className="text-[15px] leading-snug whitespace-pre-wrap break-words text-foreground/90 mt-0.5">
                      <RichText text={c.body} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-[13px] text-muted-foreground">
                      <span>{timeAgo(c.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => insertReply(c.author?.username, c.author?.full_name)}
                        className="font-semibold text-foreground/70 hover:text-primary transition"
                      >
                        Reply
                      </button>
                      {user?.id === c.author_id && (
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          className="inline-flex items-center gap-1 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLike(c.id)}
                    className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5"
                    aria-label={liked ? "Unlike comment" : "Like comment"}
                  >
                    <Heart
                      className={cn(
                        "h-5 w-5 transition-colors",
                        liked ? "fill-rose-500 text-rose-500" : "text-foreground/60",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        liked ? "text-rose-500" : "text-muted-foreground",
                      )}
                    >
                      {liked ? 1 : 0}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 bg-card">
          <div className="flex-1 flex items-center gap-1 rounded-full bg-muted/60 pl-4 pr-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/30 transition">
            <div className="flex-1 min-w-0">
              <MentionTextarea
                ref={inputRef}
                asInput
                value={text}
                onChange={setText}
                placeholder="Add a comment…"
                maxLength={500}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 py-1.5 text-[15px]"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-background/60 transition"
                  aria-label="Insert emoji"
                >
                  <Smile className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" side="top" className="w-56 p-2">
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertEmoji(e)}
                      className="h-9 w-9 rounded-lg text-xl hover:bg-muted transition"
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
            className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-[0_8px_20px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Send comment"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}