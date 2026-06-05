import { supabase } from "@/integrations/supabase/client";

const MENTION_RE = /(@[a-zA-Z0-9_]+)/g;

const handleTagClick = async (username: string) => {
  const cleanUsername = username.replace("@", "").toLowerCase();
  console.log("[mention] click", cleanUsername);
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", cleanUsername)
    .maybeSingle();
  console.log("[mention] result", { data, error });
  if (data && data.id) {
    window.location.href = "/profile/" + data.id;
  }
};

export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(MENTION_RE);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("@") && /^@[a-zA-Z0-9_]+$/.test(p)) {
          const username = p.slice(1);
          return (
            <span
              key={i}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTagClick(username);
              }}
              style={{
                color: "#6C47FF",
                cursor: "pointer",
                fontWeight: 500,
                pointerEvents: "auto",
              }}
            >
              {p}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}