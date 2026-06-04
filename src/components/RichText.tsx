import { Link } from "@tanstack/react-router";

// Renders text with @mentions highlighted in purple, linking to /profile/$id by username lookup is too costly
// so we link to a query route /u/<username> — but for simplicity we render as styled spans.
// Mentions match @username where username is letters, numbers, underscores.
const MENTION_RE = /(@[a-zA-Z0-9_]+)/g;

export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(MENTION_RE);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (MENTION_RE.test(p)) {
          MENTION_RE.lastIndex = 0;
          const username = p.slice(1);
          return (
            <Link
              key={i}
              to="/explore"
              search={{ q: username } as any}
              className="text-primary font-semibold hover:underline"
            >
              {p}
            </Link>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}