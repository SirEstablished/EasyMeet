import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  supabase,
  formatNgn,
  type Conversation,
  type Message,
  type Profile,
} from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerificationTicks } from "@/components/VerificationTicks";
import { FoundingMemberBadge } from "@/components/FoundingMemberBadge";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  MessageCircle,
  Search,
  Send,
  SlidersHorizontal,
  Paperclip,
  Shield,
  ChevronRight,
  Check,
  CheckCheck,
  ImageIcon,
  Loader2,
  Phone,
  MoreVertical,
  Plus,
} from "lucide-react";
import { containsPhone, PHONE_BLOCK_MESSAGE } from "@/lib/phoneCheck";
import { cn } from "@/lib/utils";
import { EscrowPanel } from "@/components/EscrowPanel";
import { EscrowChatCard, parseCardMessage, StatusLegend } from "@/components/EscrowChatCards";

const searchSchema = z.object({ c: z.string().optional(), m: z.string().optional() });

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: searchSchema,
  component: MessagesPage,
});

type ConvoRow = Conversation & {
  other: Profile;
  last_message: Message | null;
  unread_count: number;
};

function initials(s: string) {
  return s
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
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
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function MessagesPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [convos, setConvos] = useState<ConvoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "active" | "deals">("all");

  const activeId = search.c ?? null;
  const initialMessage = search.m ?? "";
  const activeConvo = useMemo(
    () => convos.find((c) => c.id === activeId) || null,
    [convos, activeId],
  );

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
    const pMap = new Map(((profiles as Profile[]) || []).map((p) => [p.id, p]));
    const lastMap = new Map<string, Message>();
    for (const m of (msgs as Message[]) || []) {
      if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m);
    }
    const unreadMap = new Map<string, number>();
    for (const r of (unread as { conversation_id: string }[]) || []) {
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () =>
        loadConvos(),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, () =>
        loadConvos(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const dealsRegex = /(escrow|payment|released|refund|agreement|marked as complete|placed in)/i;
    const now = Date.now();
    return convos.filter((c) => {
      if (needle) {
        const hay = (c.other?.full_name || c.other?.username || "").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (tab === "unread") return c.unread_count > 0;
      if (tab === "active") {
        if (!c.last_message_at) return false;
        return now - new Date(c.last_message_at).getTime() < 30 * 24 * 60 * 60 * 1000;
      }
      if (tab === "deals") {
        return !!c.last_message?.body && dealsRegex.test(c.last_message.body);
      }
      return true;
    });
  }, [convos, q, tab]);

  const onSelect = (id: string) => {
    navigate({ search: { c: id } });
  };

  if (!user) return null;

  return (
    <div className="max-w-6xl mx-auto h-[calc(100dvh-4rem)] flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "w-full sm:w-96 sm:border-r border-border flex flex-col bg-background",
          activeId && "hidden sm:flex",
        )}
      >
        <div className="px-4 sm:px-5 pt-4 pb-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-3">Messages</h1>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search conversations…"
                className="h-11 pl-11 pr-4 rounded-2xl bg-card border-border/60 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <button
              type="button"
              className="h-11 w-11 shrink-0 rounded-2xl bg-card border border-border/60 grid place-items-center text-foreground/70 hover:text-primary hover:border-primary/30 transition shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              aria-label="Filter"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          {/* Filter chips */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {(["all", "unread", "active", "deals"] as const).map((t) => {
              const active = tab === t;
              const label =
                t === "all"
                  ? "All"
                  : t === "unread"
                    ? "Unread"
                    : t === "active"
                      ? "Active"
                      : "Deals";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "px-4 h-9 rounded-full text-sm font-semibold whitespace-nowrap transition",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_6px_18px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                      : "bg-card border border-border/60 text-foreground/70 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-24 md:pb-6 space-y-2.5">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No conversations yet. Message a professional to get started.
            </div>
          ) : (
            filtered.map((c) => {
              const name = c.other?.full_name || c.other?.username || "User";
              const unread = c.unread_count > 0;
              const lm = c.last_message as
                | (Message & { media_url?: string | null; media_type?: string | null })
                | null;
              let preview = "No messages yet";
              if (lm) {
                const mediaType = (lm.media_type || "").toLowerCase();
                if (mediaType.startsWith("image")) preview = "📷 Photo";
                else if (mediaType.startsWith("video")) preview = "🎥 Video";
                else if (lm.media_url && !lm.body) preview = "📎 Attachment";
                else if (lm.body) {
                  preview = lm.body.length > 40 ? lm.body.slice(0, 40) + "…" : lm.body;
                }
              }
              const role = c.other?.role;
              const isSelected = activeId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "group relative w-full text-left rounded-2xl bg-card border border-border/60 px-4 py-3.5 transition",
                    "shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_24px_-16px_rgba(108,76,246,0.25)] hover:border-primary/30",
                    isSelected &&
                      "border-primary/40 shadow-[0_8px_24px_-16px_rgba(108,76,246,0.35)]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-full p-[2px] bg-gradient-to-br from-primary/70 to-primary/30">
                      <Avatar className="h-12 w-12 border-2 border-card">
                        <AvatarImage src={c.other?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1">
                          <span className="truncate text-[15px] font-bold text-foreground">
                            {name}
                          </span>
                          <VerificationTicks
                            blue={c.other?.blue_tick}
                            white={c.other?.white_tick}
                            gold={c.other?.gold_tick}
                            size="sm"
                          />
                          <FoundingMemberBadge
                            active={
                              (c.other as unknown as { is_founding_member?: boolean } | null)
                                ?.is_founding_member
                            }
                            size="sm"
                          />
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground shrink-0 whitespace-nowrap">
                          {c.last_message_at ? formatTime(c.last_message_at) : ""}
                        </span>
                      </div>
                      {role && (
                        <div className="text-xs text-muted-foreground capitalize mt-0.5">
                          {role}
                        </div>
                      )}
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p
                          className={cn(
                            "text-[13px] leading-snug line-clamp-2 flex-1 min-w-0",
                            unread ? "text-foreground font-medium" : "text-muted-foreground",
                          )}
                        >
                          {preview}
                        </p>
                        {unread && (
                          <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold grid place-items-center tabular-nums">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
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

// Extended local message type (columns not yet in generated types)
type ChatMessage = Message & {
  status?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  media_url?: string | null;
  media_type?: string | null;
};

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState(initialText ?? "");
  const [warn, setWarn] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const [escrowRefreshKey, setEscrowRefreshKey] = useState(0);
  const [activeEscrow, setActiveEscrow] = useState<{
    id: string;
    amount: number;
    status: string;
    title: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const nowIso = new Date().toISOString();
    await supabase
      .from("messages")
      .update({
        is_read: true,
        ...({ status: "read", read_at: nowIso, delivered_at: nowIso } as Record<string, unknown>),
      } as never)
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
      setMessages((data as ChatMessage[]) ?? []);
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
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          scrollToBottom();
          if (m.sender_id !== meId) markRead();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_agreements",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => setEscrowRefreshKey((key) => key + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "escrow",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => setEscrowRefreshKey((key) => key + 1),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Scroll to bottom whenever the message list length changes (initial load,
  // new incoming message, or sent message).
  useLayoutEffect(() => {
    scrollToBottom();
    // Second pass after images/cards mount and change layout height.
    const t = setTimeout(scrollToBottom, 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  // Fetch active escrow for the deal banner
  useEffect(() => {
    if (!conversation.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("escrow")
        .select("id, amount_ngn, status, title")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const status = (data.status as string) || "pending_payment";
      if (status !== "cancelled" && status !== "refunded" && status !== "released" && status !== "completed") {
        setActiveEscrow({
          id: data.id,
          amount: Number(data.amount_ngn ?? 0),
          status,
          title: (data.title as string) || "Deal",
        });
      } else {
        setActiveEscrow(null);
      }
    })();
    return () => { cancelled = true; };
  }, [conversation.id, escrowRefreshKey]);

  // Presence: track this user online in a shared conversation channel and
  // read the other party's online state from presence events. No schema
  // changes needed — Supabase Realtime Presence handles it.
  const otherId = conversation.other?.id ?? null;
  useEffect(() => {
    if (!otherId) return;
    const ch = supabase.channel(`presence:convo:${conversation.id}`, {
      config: { presence: { key: meId } },
    });
    const readState = () => {
      const state = ch.presenceState() as Record<string, { user_id?: string; at?: string }[]>;
      const online = Object.keys(state).includes(otherId);
      setOtherOnline(online);
      if (!online) {
        // Persist last_seen locally so we can show it while the socket lasts.
        setOtherLastSeen((cur) => cur ?? new Date().toISOString());
      }
    };
    ch.on("presence", { event: "sync" }, readState)
      .on("presence", { event: "join" }, readState)
      .on("presence", { event: "leave" }, (payload) => {
        readState();
        if (payload.key === otherId) {
          setOtherLastSeen(new Date().toISOString());
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ user_id: meId, at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversation.id, meId, otherId]);

  const send = async (extra?: {
    media_url?: string;
    media_type?: string;
    overrideBody?: string;
  }) => {
    const body = text.trim();
    const finalBody = extra?.overrideBody ?? body;
    const hasMedia = !!extra?.media_url;
    if ((!finalBody && !hasMedia) || sending) return;
    if (finalBody && containsPhone(finalBody)) {
      setWarn(PHONE_BLOCK_MESSAGE);
      return;
    }
    setWarn(null);
    setSending(true);
    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      conversation_id: conversation.id,
      sender_id: meId,
      body: finalBody,
      status: "sent",
      delivered_at: nowIso,
    };
    if (extra?.media_url) payload.media_url = extra.media_url;
    if (extra?.media_type) payload.media_type = extra.media_type;
    const { error } = await supabase.from("messages").insert(payload as never);
    setSending(false);
    if (error) {
      setWarn(error.message);
      return;
    }
    if (!extra?.overrideBody) setText("");
    onMessagesChanged();
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      setWarn("Only image or video files are supported");
      return;
    }
    const maxMb = isVideo ? 30 : 8;
    if (file.size > maxMb * 1024 * 1024) {
      setWarn(`File is too large (max ${maxMb} MB)`);
      return;
    }
    setUploading(true);
    setWarn(null);
    try {
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `${conversation.id}/${meId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("message-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("message-media").getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error("Could not get public URL");
      await send({
        media_url: url,
        media_type: isVideo ? "video" : "image",
        overrideBody: text.trim(),
      });
      setText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setWarn(msg + " — make sure the 'message-media' bucket exists and is public.");
    } finally {
      setUploading(false);
    }
  };

  const other = conversation.other;
  const name = other?.full_name || other?.username || "User";

  // group with date separators
  const items: Array<{ type: "sep"; key: string; label: string } | { type: "msg"; msg: Message }> =
    [];
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
      {/* Header */}
      <div className="h-16 border-b border-border/40 bg-white px-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="sm:hidden -ml-1" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link
          to="/profile/$id"
          params={{ id: other?.id ?? "" }}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90"
        >
          <div className="relative shrink-0">
            <Avatar className="h-11 w-11 ring-2 ring-primary/20">
              <AvatarImage src={other?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            {otherOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </div>
          <div className="min-w-0 flex flex-col items-start">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[15px] truncate text-foreground">{name}</span>
              <VerificationTicks
                blue={other?.blue_tick}
                white={other?.white_tick}
                gold={other?.gold_tick}
                size="sm"
              />
              <FoundingMemberBadge
                active={
                  (other as unknown as { is_founding_member?: boolean } | null)?.is_founding_member
                }
                size="sm"
              />
            </div>
            <div className="flex items-center gap-2">
              {other?.role && (
                <span className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize",
                  other.role === "customer"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-primary/10 text-primary"
                )}>
                  {other.role}
                </span>
              )}
              {otherOnline ? (
                <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active now
                </span>
              ) : otherLastSeen ? (
                <span className="text-[11px] text-muted-foreground">
                  Last seen {formatTime(otherLastSeen)}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Offline</span>
              )}
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary">
            <Phone className="h-[18px] w-[18px]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary">
            <MoreVertical className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-white px-4 pt-4 pb-4 space-y-1"
      >
        {/* Escrow protection banner */}
        {activeEscrow ? (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-9 w-9 rounded-full bg-emerald-100 grid place-items-center shrink-0">
              <Shield className="h-[18px] w-[18px] text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-emerald-700 leading-tight">
                Deal in Escrow
              </p>
              <p className="text-[13px] font-bold text-foreground leading-tight mt-0.5">
                {formatNgn(activeEscrow.amount)}
                <span className="text-[11px] font-normal text-muted-foreground ml-1.5">
                  Payment held securely
                </span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-700 hover:text-emerald-800 font-semibold text-[13px] shrink-0"
            >
              View Deal
              <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-9 w-9 rounded-full bg-primary/15 grid place-items-center shrink-0">
              <Shield className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground leading-tight">
                No active deal yet
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Start a protected deal to work with peace of mind
              </p>
            </div>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[12px] shrink-0 h-8 px-3 rounded-lg shadow-[0_2px_8px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Start Deal
            </Button>
          </div>
        )}

        <div className="h-2" />

        {items.map((it) =>
          it.type === "sep" ? (
            <div key={it.key} className="flex justify-center my-4">
              <span className="text-[11px] font-medium text-muted-foreground bg-gray-100 px-3 py-1 rounded-full">
                {it.label}
              </span>
            </div>
          ) : (
            <MessageBubble
              key={it.msg.id}
              m={it.msg}
              mine={it.msg.sender_id === meId}
              meId={meId}
              other={other}
            />
          ),
        )}
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            No messages yet. Say hello!
          </div>
        )}

        {/* Status legend */}
        <div className="pt-4 pb-2">
          <StatusLegend />
        </div>
      </div>

      <EscrowPanel
        conversationId={conversation.id}
        meId={meId}
        myEmail={user?.email || `${meId}@easymeet.app`}
        other={conversation.other}
        meRole={profile?.role}
        refreshKey={escrowRefreshKey}
      />

      {/* Composer */}
      <div className="border-t border-border/40 bg-white px-3 pt-3 pb-4">
        {/* Action buttons */}
        {!activeEscrow && (
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-10 rounded-xl border-border/60 text-foreground font-semibold text-[13px] hover:bg-muted/50"
            >
              <Shield className="h-4 w-4 mr-1.5" />
              View Deal
            </Button>
            <Button
              size="sm"
              className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] shadow-[0_2px_8px_-4px_color-mix(in_oklab,var(--primary)_50%,transparent)]"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Start Protected Deal
            </Button>
          </div>
        )}
        {warn && <div className="text-xs text-destructive mb-2 px-1">{warn}</div>}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onFileChosen}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={openFilePicker}
            disabled={uploading}
            aria-label="Attach photo or video"
            className="h-10 w-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </Button>
          <div className="flex-1 flex items-center h-12 rounded-full bg-gray-100 border border-border/30 px-4">
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
              className="flex-1 h-full bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none px-0 text-[14px] placeholder:text-muted-foreground/60"
            />
          </div>
          <Button
            onClick={() => send()}
            disabled={!text.trim() || sending || uploading}
            className="h-12 w-12 p-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_50%,transparent)]"
          >
            <Send className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ m, mine, meId, other }: { m: ChatMessage; mine: boolean; meId: string; other?: Profile | null }) {
  const card = parseCardMessage(m.body);
  if (card) {
    return (
      <div className={cn("flex mt-3", mine ? "justify-end" : "justify-start")}>
        {!mine && (
          <div className="shrink-0 mr-2 mt-1">
            <Avatar className="h-7 w-7">
              <AvatarImage src={other?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                {other?.full_name ? initials(other.full_name) : "?"}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
          <EscrowChatCard kind={card.kind} payload={card.payload} meId={meId} mine={mine} />
          <span className="text-[10px] text-muted-foreground mt-1 px-1">
            {formatTime(m.created_at)}
          </span>
        </div>
      </div>
    );
  }
  const isRead = m.is_read || m.status === "read" || !!m.read_at;
  const isDelivered = isRead || !!m.delivered_at || m.status === "delivered" || !!m.id;
  const mediaUrl = m.media_url ?? null;
  const mediaType = m.media_type ?? null;
  return (
    <div className={cn("flex mt-3", mine ? "justify-end" : "justify-start")}>
      {!mine && (
        <div className="shrink-0 mr-2 mt-1">
          <Avatar className="h-7 w-7">
            <AvatarImage src={other?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
              {other?.full_name ? initials(other.full_name) : "?"}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className={cn("flex flex-col max-w-[78%]", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "text-[14px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden",
            mine
              ? "bg-[#E8DEFF] text-foreground rounded-[18px] rounded-br-md px-4 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
              : "bg-white text-foreground rounded-[18px] rounded-bl-md border border-border/50 px-4 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
          )}
        >
          {mediaUrl && mediaType === "image" && (
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="block -mx-1 -mt-0.5 first:mt-0">
              <img
                src={mediaUrl}
                alt="attachment"
                className="max-h-72 w-full object-cover rounded-xl"
                loading="lazy"
              />
            </a>
          )}
          {mediaUrl && mediaType === "video" && (
            <video src={mediaUrl} controls className="max-h-72 w-full rounded-xl" preload="metadata">
              <track kind="captions" />
            </video>
          )}
          {mediaUrl && mediaType !== "image" && mediaType !== "video" && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 underline"
            >
              <ImageIcon className="h-4 w-4" /> Attachment
            </a>
          )}
          {m.body ? <div>{m.body}</div> : null}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
          {formatTime(m.created_at)}
          {mine && (
            <span
              className={cn("inline-flex", isRead ? "text-blue-500" : "text-muted-foreground")}
              aria-label={isRead ? "Read" : isDelivered ? "Delivered" : "Sent"}
            >
              {isDelivered || isRead ? (
                <CheckCheck className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
