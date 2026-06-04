import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Send, Trash2 } from "lucide-react";
import { supabase, type Comment } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { timeAgo } from "@/lib/timeAgo";
import { containsPhone, PHONE_BLOCK_MESSAGE } from "@/lib/phoneCheck";
import { MentionTextarea } from "./MentionTextarea";
import { RichText } from "./RichText";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!open || !postId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("comments")
      .select("*, author:author_id(id, full_name, username, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setComments((data as Comment[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle>Comments</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Be the first to comment
            </div>
          ) : (
            comments.map((c) => {
              const initials = (c.author?.full_name || "U")
                .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
              return (
                <div key={c.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={c.author?.avatar_url ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-2xl bg-secondary px-3 py-2">
                      <div className="text-xs font-semibold">
                        {c.author?.full_name || c.author?.username || "User"}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        <RichText text={c.body} />
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground px-1">
                      <span>{timeAgo(c.created_at)}</span>
                      {user?.id === c.author_id && (
                        <button
                          onClick={() => remove(c.id)}
                          className="inline-flex items-center gap-1 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-border p-3 flex items-end gap-2">
          <div className="flex-1">
            <MentionTextarea
              asInput
              value={text}
              onChange={setText}
              placeholder="Write a comment… use @ to tag"
              maxLength={500}
            />
          </div>
          <Button size="icon" onClick={submit} disabled={sending || !text.trim()} className="bg-gradient-brand">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}