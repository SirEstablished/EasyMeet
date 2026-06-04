import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase, type Message, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Item = Message & {
  sender: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);

  const load = async () => {
    if (!user) return;
    const { data: convos } = await supabase
      .from("conversations")
      .select("id")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    const ids = ((convos as { id: string }[]) || []).map((c) => c.id);
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    const { data: msgs } = await supabase
      .from("messages")
      .select("*, sender:sender_id(id, full_name, username, avatar_url)")
      .in("conversation_id", ids)
      .eq("is_read", false)
      .neq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setItems((msgs as Item[]) ?? []);
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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const hasUnread = items.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border text-sm font-semibold">
          Notifications
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground text-center">
            You're all caught up
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((m) => {
              const name = m.sender?.full_name || m.sender?.username || "User";
              const preview = m.body.length > 50 ? m.body.slice(0, 50) + "…" : m.body;
              return (
                <button
                  key={m.id}
                  onClick={() =>
                    navigate({ to: "/messages", search: { c: m.conversation_id } as any })
                  }
                  className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-secondary border-b border-border/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.sender?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">{preview}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}