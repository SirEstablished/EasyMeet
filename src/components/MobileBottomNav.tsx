import { Link } from "@tanstack/react-router";
import { Home, Compass, Newspaper, MessageSquare, Package } from "lucide-react";
import { useAuth } from "@/lib/providers";

export function MobileBottomNav() {
  const { profile } = useAuth();
  const isCustomer = profile?.role === "customer";
  const ordersLabel = isCustomer ? "Orders" : "Orders";

  const items = [
    { to: "/dashboard", label: "Home", Icon: Home },
    { to: "/explore", label: "Explore", Icon: Compass },
    { to: "/feed", label: "Feed", Icon: Newspaper },
    { to: "/messages", label: "Messages", Icon: MessageSquare },
    { to: "/my-orders", label: ordersLabel, Icon: Package },
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
              className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-1 py-2 text-[11px] font-medium text-muted-foreground active:bg-primary/10"
              activeProps={{
                className:
                  "flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-1 py-2 text-[11px] font-semibold text-[#6C47FF] bg-[#6C47FF]/10",
              }}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate leading-none">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}