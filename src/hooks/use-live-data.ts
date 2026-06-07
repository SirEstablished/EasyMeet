import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Supabase realtime INSERT/UPDATE/DELETE events on the given
 * tables and silently call `refresh()` whenever anything changes. Also
 * polls every `intervalMs` (default 10s) as a fallback. The refresh callback
 * is responsible for NOT toggling a visible loading state.
 */
export function useLiveData(
  tables: string[],
  refresh: () => void | Promise<void>,
  intervalMs: number = 10000,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (tables.length === 0) return;
    const channelName = `live-${tables.join("-")}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        () => {
          void refreshRef.current();
        },
      );
    }
    channel.subscribe();

    const id = window.setInterval(() => {
      void refreshRef.current();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("|"), intervalMs]);
}