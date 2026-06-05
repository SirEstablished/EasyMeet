import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const MENTION_RE = /(@[a-zA-Z0-9_]+)/g;

// Module-level cache: username (lowercase) -> profile id or null (not found)
const mentionCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function lookupUsername(username: string): Promise<string | null> {
  const key = username.toLowerCase();
  if (mentionCache.has(key)) return Promise.resolve(mentionCache.get(key)!);
  const existing = pending.get(key);
  if (existing) return existing;
  const p = (async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", key)
      .maybeSingle();
    const id = data?.id ?? null;
    mentionCache.set(key, id);
    pending.delete(key);
    return id;
  })();
  pending.set(key, p);
  return p;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const [resolved, setResolved] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!text) return;
    const matches = Array.from(text.matchAll(MENTION_RE)).map((m) => m[1].slice(1).toLowerCase());
    const unique = Array.from(new Set(matches));
    let cancelled = false;
    Promise.all(unique.map((u) => lookupUsername(u).then((id) => [u, id] as const))).then((entries) => {
      if (cancelled) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const [u, id] of entries) next[u] = id;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!text) return null;
  const parts = text.split(MENTION_RE);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("@") && /^@[a-zA-Z0-9_]+$/.test(p)) {
          const username = p.slice(1).toLowerCase();
          const id = resolved[username];
          const cls = "text-primary font-semibold";
          if (id) {
            return (
              <Link
                key={i}
                to="/profile/$id"
                params={{ id }}
                className={`${cls} hover:underline`}
              >
                {p}
              </Link>
            );
          }
          return <span key={i} className={cls}>{p}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}