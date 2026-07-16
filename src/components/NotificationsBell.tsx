import { useEffect, useState } from "react";
import {
  Bell,
  MessageCircle,
  ShieldCheck,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Wallet as WalletIcon,
  UserPlus,
  AtSign,
  Package,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";

type Notif = {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string | null;
  link: string | null;
  is_read: boolean | null;
  read_at: string | null;
  created_at: string;
};

type UnreadMsg = {
  id: string;
  conversation_id: string;
  body: string | null;
  sender_id: string;
  created_at: string;
};

function iconFor(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t.includes("message") || t.includes("chat"))
    return <MessageCircle className="h-4 w-4 text-primary" />;
  if (t.includes("escrow") || t.includes("payment") || t.includes("release"))
    return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
  if (t.includes("agreement")) return <FileText className="h-4 w-4 text-indigo-500" />;
  if (t.includes("complete")) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (t.includes("dispute")) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (t.includes("withdraw")) return <WalletIcon className="h-4 w-4 text-blue-500" />;
  if (t.includes("follow")) return <UserPlus className="h-4 w-4 text-primary" />;
  if (t.includes("mention")) return <AtSign className="h-4 w-4 text-primary" />;
  if (t.includes("order") || t.includes("booking"))
    return <Package className="h-4 w-4 text-blue-500" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [msgs, setMsgs] = useState<UnreadMsg[]>([]);

  const load = async () => {
    if (!user) return;
    const { data: n } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifs((n as Notif[]) ?? []);

    const { data: convos } = await supabase
      .from("conversations")
      .select("id")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    const ids = ((convos as { id: string }[]) || []).map((c) => c.id);
    if (ids.length === 0) {
      setMsgs([]);
      return;
    }
    const { data: m } = await supabase
      .from("messages")
      .select("id, conversation_id, body, sender_id, created_at")
      .in("conversation_id", ids)
      .eq("is_read", false)
      .neq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setMsgs((m as UnreadMsg[]) ?? []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("notif-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadNotifs = notifs.filter((n) => !(n.is_read ?? !!n.read_at));
  const unreadCount = unreadNotifs.length + msgs.length;
  const hasUnread = unreadCount > 0;

  const markAllRead = async () => {
    if (!user || unreadNotifs.length === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .eq("user_id", user.id)
      .eq("is_read", false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold grid place-items-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0" onCloseAutoFocus={() => void markAllRead()}>
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold">Notifications</span>
          {hasUnread && (
            <span className="text-[10px] font-semibold text-primary">{unreadCount} new</span>
          )}
        </div>
        {notifs.length === 0 && msgs.length === 0 ? (
          <div className="px-3 py-8 text-sm text-muted-foreground text-center">
            You're all caught up
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {msgs.map((m) => (
              <button
                key={`msg-${m.id}`}
                onClick={() =>
                  navigate({ to: "/messages", search: { c: m.conversation_id } as never })
                }
                className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-secondary border-b border-border/50 bg-primary/5"
              >
                <span className="mt-0.5">{iconFor("message")}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">New message</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.body || "Sent you a message"}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {timeAgo(m.created_at)}
                  </div>
                </div>
              </button>
            ))}
            {notifs.map((n) => {
              const unread = !(n.is_read ?? !!n.read_at);
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (n.link) navigate({ to: n.link as never });
                  }}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-secondary border-b border-border/50 ${
                    unread ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="mt-0.5">{iconFor(n.type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    {n.message && (
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {n.message}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {unread && <span className="h-2 w-2 rounded-full bg-primary mt-1.5" />}
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}