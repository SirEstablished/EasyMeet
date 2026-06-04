import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type MiniProfile = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  className,
  disabled,
  asInput,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
  asInput?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MiniProfile[]>([]);
  const [active, setActive] = useState(0);

  // Detect "@word" right before the caret.
  const detect = (text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([a-zA-Z0-9_]{1,20})$/);
    return m ? m[1] : null;
  };

  useEffect(() => {
    if (query === null) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .ilike("username", `${query}%`)
        .not("username", "is", null)
        .limit(6);
      if (!cancelled) {
        setResults((data as MiniProfile[]) ?? []);
        setActive(0);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    const caret = e.target.selectionStart ?? v.length;
    setQuery(detect(v, caret));
  };

  const insertMention = (u: string) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([a-zA-Z0-9_]{1,20})$/, `@${u} `);
    const after = value.slice(caret);
    const next = before + after;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!results.length || query === null) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      const u = results[active]?.username;
      if (u) {
        e.preventDefault();
        insertMention(u);
      }
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  };

  return (
    <div className="relative">
      {asInput ? (
        <input
          ref={ref as React.MutableRefObject<HTMLInputElement | null>}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        />
      ) : (
        <Textarea
          ref={ref as React.MutableRefObject<HTMLTextAreaElement | null>}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          className={className}
        />
      )}
      {query !== null && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((r, i) => {
            const initials = (r.full_name || r.username || "U")
              .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
            return (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(r.username!); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary",
                  i === active && "bg-secondary",
                )}
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                <span className="font-medium truncate">{r.full_name || r.username}</span>
                <span className="text-muted-foreground truncate">@{r.username}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}