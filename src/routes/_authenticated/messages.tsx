import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase, type Conversation, type Message, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerificationTicks } from "@/components/VerificationTicks";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Search, Send } from "lucide-react";
import { containsPhone, PHONE_BLOCK_MESSAGE } from "@/lib/phoneCheck";
import { cn } from "@/lib/utils";
import { EscrowPanel } from "@/components/EscrowPanel";

const searchSchema = z.object({ c: z.string().optional(), m: z.string().optional() });

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: searchSchema,
  component: MessagesPage,
});

type ConvoRow = Conversation & { other: Profile; last_message: Message | null; unread_count: number };

function initials(s: string) {
  return s.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(d: string) {
  const date = new Date(d);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yest)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function MessagesPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [convos, setConvos] = useState<ConvoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const activeId = search.c ?? null;
  const initialMessage = search.m ?? "";
  const activeConvo = useMemo(() => convos.find((c) => c.id === activeId) || null, [convos, activeId]);

  const loadConvos = async () => {
    if (!user) return;
    const { data: rawConvos } = await supabase
      .from("conversations")
      .select("*")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    const list = (rawConvos as Conversation[]) ?? [];
    if (list.length === 0) {
      setConvos([]);
      setLoading(false);
      return;
    }
    const otherIds = list.map((c) => (c.user_a === user.id ? c.user_b : c.user_a));
    const convoIds = list.map((c) => c.id);
    const [{ data: profiles }, { data: msgs }, { data: unread }] = await Promise.all([
      supabase.from("profiles").select("*").in("id", otherIds),
      supabase
        .from("messages")
        .select("*")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convoIds)
        .eq("is_read", false)
        .neq("sender_id", user.id),
    ]);
    const pMap = new Map((profiles as Profile[] || []).map((p) => [p.id, p]));
    const lastMap = new Map<string, Message>();
    for (const m of ((msgs as Message[]) || [])) {
      if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m);
    }
    const unreadMap = new Map<string, number>();
    for (const r of ((unread as { conversation_id: string }[]) || [])) {
      unreadMap.set(r.conversation_id, (unreadMap.get(r.conversation_id) || 0) + 1);
    }
    const rows: ConvoRow[] = list.map((c) => {
      const otherId = c.user_a === user.id ? c.user_b : c.user_a;
      return {
        ...c,
        other: pMap.get(otherId) as Profile,
        last_message: lastMap.get(c.id) ?? null,
        unread_count: unreadMap.get(c.id) ?? 0,
      };
    });
    setConvos(rows);
    setLoading(false);
  };

  useEffect(() => {
    loadConvos();
    if (!user) return;
    const channel = supabase
      .channel("messages-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => loadConvos(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        () => loadConvos(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return convos;
    return convos.filter((c) =>
      (c.other?.full_name || c.other?.username || "").toLowerCase().includes(needle),
    );
  }, [convos, q]);

  const onSelect = (id: string) => {
    navigate({ search: { c: id } });
  };

  if (!user) return null;

  return (
    <div className="max-w-6xl mx-auto h-[calc(100dvh-4rem)] flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "w-full sm:w-80 sm:border-r border-border flex flex-col bg-card",
          activeId && "hidden sm:flex",
        )}
      >
        <div className="p-4 border-b border-border">
          <h1 className="text-2xl font-extrabold text-gradient-tri mb-3">Messages</h1>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="      Search conversations…"
              className="search-pill h-10"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No conversations yet. Message a professional to get started.
            </div>
          ) : (
            filtered.map((c) => {
              const name = c.other?.full_name || c.other?.username || "User";
              const unread = c.unread_count > 0;
              const preview = c.last_message?.body
                ? c.last_message.body.length > 40
                  ? c.last_message.body.slice(0, 40) + "…"
                  : c.last_message.body
                : "No messages yet";
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "group relative w-full text-left px-4 py-3 flex items-center gap-3 transition-all border-b border-border/30",
                    "hover:bg-primary/5 hover:border-l-2 hover:border-l-primary",
                    activeId === c.id && "bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-l-primary",
                  )}
                >
                  <span className="avatar-ring shrink-0">
                    <Avatar className="h-10 w-10 border-2 border-background">
                      <AvatarImage src={c.other?.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(name)}</AvatarFallback>
                    </Avatar>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={cn("truncate text-sm", unread && "font-bold")}>{name}</span>
                      <VerificationTicks
                        blue={c.other?.blue_tick}
                        white={c.other?.white_tick}
                        gold={c.other?.gold_tick}
                        size="sm"
                      />
                    </div>
                    <p className={cn("text-xs truncate", unread ? "text-foreground" : "text-muted-foreground")}>
                      {preview}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {c.last_message_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(c.last_message_at)}
                      </span>
                    )}
                    {unread && <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] animate-pulse" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={cn("flex-1 flex flex-col", !activeId && "hidden sm:flex")}>
        {activeConvo ? (
          <Thread
            key={activeConvo.id}
            conversation={activeConvo}
            meId={user.id}
            onBack={() => navigate({ search: {} })}
            onMessagesChanged={loadConvos}
            initialText={initialMessage}
            onConsumedInitialText={() => navigate({ search: { c: activeConvo.id } })}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <div className="text-center">
              <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-gradient-brand grid place-items-center text-white shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--primary)_55%,transparent)]">
                <MessageCircle className="h-6 w-6" />
              </div>
              <p className="mt-2 font-semibold text-gradient-tri">Select a conversation</p>
              <p className="text-xs mt-1">Pick a thread to start chatting</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({
  conversation,
  meId,
  onBack,
  onMessagesChanged,
  initialText,
  onConsumedInitialText,
}: {
  conversation: ConvoRow;
  meId: string;
  onBack: () => void;
  onMessagesChanged: () => void;
  initialText?: string;
  onConsumedInitialText?: () => void;
}) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(initialText ?? "");
  const [warn, setWarn] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
      onConsumedInitialText?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const markRead = async () => {
    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversation.id)
      .neq("sender_id", meId)
      .eq("is_read", false);
    onMessagesChanged();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setMessages((data as Message[]) ?? []);
      scrollToBottom();
      markRead();
    })();

    const channel = supabase
      .channel(`messages-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          scrollToBottom();
          if (m.sender_id !== meId) markRead();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (containsPhone(body)) {
      setWarn(PHONE_BLOCK_MESSAGE);
      return;
    }
    setWarn(null);
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: meId,
      body,
    });
    setSending(false);
    if (error) {
      setWarn(error.message);
      return;
    }
    setText("");
    onMessagesChanged();
  };

  const other = conversation.other;
  const name = other?.full_name || other?.username || "User";

  // group with date separators
  const items: Array<{ type: "sep"; key: string; label: string } | { type: "msg"; msg: Message }> = [];
  let lastDay = "";
  for (const m of messages) {
    const d = new Date(m.created_at).toDateString();
    if (d !== lastDay) {
      items.push({ type: "sep", key: `s-${d}`, label: dayLabel(m.created_at) });
      lastDay = d;
    }
    items.push({ type: "msg", msg: m });
  }

  return (
    <>
      <div className="h-14 border-b border-border px-4 flex items-center gap-3 glass-panel">
        <Button variant="ghost" size="icon" className="sm:hidden" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link
          to="/profile/$id"
          params={{ id: other?.id ?? "" }}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90"
        >
          <span className="avatar-ring shrink-0">
            <Avatar className="h-9 w-9 border-2 border-background">
              <AvatarImage src={other?.avatar_url ?? undefined} />
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold truncate">{name}</span>
              <VerificationTicks
                blue={other?.blue_tick}
                white={other?.white_tick}
                gold={other?.gold_tick}
                size="sm"
              />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize glass-card text-primary">{other?.role}</span>
          </div>
        </Link>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {items.map((it) =>
          it.type === "sep" ? (
            <div key={it.key} className="flex justify-center my-4">
              <span className="text-[11px] font-bold text-gradient-tri tracking-wide uppercase">
                {it.label}
              </span>
            </div>
          ) : (
            <MessageBubble key={it.msg.id} m={it.msg} mine={it.msg.sender_id === meId} />
          ),
        )}
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            No messages yet. Say hello!
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 glass-panel">
        {warn && (
          <div className="text-xs text-destructive mb-2 px-1">{warn}</div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (warn) setWarn(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message..."
            className="h-11 rounded-full input-glow border-border/60"
          />
          <Button onClick={send} disabled={!text.trim() || sending} className="bg-gradient-brand glow-primary h-11 w-11 p-0 rounded-full">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ m, mine }: { m: Message; mine: boolean }) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
          mine
            ? "bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_70%,white)] text-primary-foreground rounded-br-md shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
            : "bg-secondary text-foreground rounded-bl-md border border-border/60 dark:bg-card/80 dark:backdrop-blur-md",
        )}
      >
        {m.body}
      </div>
      <span className="text-[10px] text-muted-foreground mt-1 px-1">
        {formatTime(m.created_at)}
      </span>
    </div>
  );
}