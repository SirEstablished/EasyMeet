import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const MENTION_RE = /(@[a-zA-Z0-9_]+)/g;

// Cache username (lowercase) -> profile id or null
const mentionCache = new Map<string, string | null>();

export function RichText({ text, className }: { text: string; className?: string }) {
  const navigate = useNavigate();

  if (!text) return null;

  const handleMentionClick = async (
    e: React.MouseEvent,
    username: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const key = username.toLowerCase();
    let id = mentionCache.get(key);
    if (id === undefined) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", key)
        .maybeSingle();
      id = data?.id ?? null;
      mentionCache.set(key, id);
    }
    if (id) {
      navigate({ to: "/profile/$id", params: { id } });
    }
  };

  const parts = text.split(MENTION_RE);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("@") && /^@[a-zA-Z0-9_]+$/.test(p)) {
          const username = p.slice(1);
          return (
            <a
              key={i}
              href="#"
              onClick={(e) => handleMentionClick(e, username)}
              className="text-primary font-semibold hover:underline cursor-pointer"
            >
              {p}
            </a>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}