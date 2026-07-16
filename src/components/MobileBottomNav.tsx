import { Link } from "@tanstack/react-router";
import { Home, Compass, MessageSquare, ShoppingBag, Rss } from "lucide-react";

export function MobileBottomNav() {
  const items = [
    { to: "/dashboard", label: "Home", Icon: Home },
    { to: "/explore", label: "Explore", Icon: Compass },
    { to: "/feed", label: "Feed", Icon: Rss },
    { to: "/shop", label: "Shop", Icon: ShoppingBag },
    { to: "/messages", label: "Chat", Icon: MessageSquare },
  ] as const;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border/60 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-0.5 py-1.5 text-[10px] font-medium text-muted-foreground active:bg-primary/10"
              activeProps={{
                className:
                  "flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-0.5 py-1.5 text-[10px] font-semibold text-[#6C47FF] bg-[#6C47FF]/10",
              }}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate leading-none max-w-full px-0.5">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}