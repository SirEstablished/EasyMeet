import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth, useTheme } from "@/lib/providers";
import { LogOut, Moon, Sun } from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppNavbar() {
  const { profile, user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const isCustomer = profile?.role === "customer";
  const ordersLabel = isCustomer ? "My Orders" : "Orders";
  const navLinks: { to: string; label: string }[] = [
    { to: "/dashboard", label: "Home" },
    { to: "/explore", label: "Explore" },
    { to: "/feed", label: "Feed" },
    { to: "/shop", label: "Shop" },
    { to: "/messages", label: "Messages" },
    { to: "/my-orders", label: ordersLabel },
    { to: "/profile", label: "My Profile" },
  ];

  const initials =
    (profile?.full_name || user?.email || "U")
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <header className="hidden md:block sticky top-0 z-40 glass-panel">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-1 min-w-0">
          <Logo />
        </div>
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="relative px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
              activeProps={{
                className:
                  "text-foreground after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gradient-brand",
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="h-9 w-9">
            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 outline-none">
                <span className="inline-block rounded-full p-[2px] bg-gradient-brand">
                  <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-medium">{profile?.full_name || "Account"}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {profile?.role}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
