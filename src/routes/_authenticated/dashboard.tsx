import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { useEffect, useState } from "react";
import { fetchCompletion } from "@/lib/profileCompletion";
import { AnalyticsSection } from "@/components/AnalyticsSection";
import { WalletSummaryCard } from "@/components/WalletSummaryCard";
import {
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  Sparkles,
  Search,
  Users,
  Package,
  Users2,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const greetings: Record<string, string> = {
  customer: "Find the right professional for your needs",
  professional: "Manage your services and grow your client base",
  business: "Showcase your organisation and attract customers",
};

function Dashboard() {
  const { profile, user } = useAuth();
  const name = profile?.full_name || user?.email?.split("@")[0] || "there";
  const role = profile?.role || "customer";
  const greeting = greetings[role];

  const [completion, setCompletion] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchCompletion(user.id).then((c) => {
      if (!cancelled) setCompletion(c);
    });
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  const sellsProducts = !!profile?.sells_products;
  const offersServices = profile?.offers_services !== false && role !== "customer";
  const quickLinks: { Icon: typeof Search; label: string; to: string }[] =
    role === "customer"
      ? [
          { Icon: Search, label: "Browse Professionals", to: "/explore" },
          { Icon: CalendarCheck, label: "My Orders", to: "/my-orders" },
          { Icon: Wallet, label: "Transactions", to: "/transactions" },
          { Icon: MessageCircle, label: "Messages", to: "/messages" },
        ]
      : [
          ...(offersServices ? [{ Icon: Sparkles, label: "My Services", to: "/my-services" }] : []),
          ...(sellsProducts ? [{ Icon: Package, label: "My Products", to: "/my-products" }] : []),
          { Icon: CalendarCheck, label: "Orders", to: "/my-orders" },
          { Icon: Wallet, label: "Wallet", to: "/wallet" },
          { Icon: Wallet, label: "Transactions", to: "/transactions" },
          { Icon: Users, label: "Explore", to: "/explore" },
          { Icon: MessageCircle, label: "Messages", to: "/messages" },
          ...(role === "business" ? [{ Icon: Users2, label: "Staffs", to: "/staffs" }] : []),
        ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-10 pb-24 md:pb-10 grid gap-6 md:gap-8 md:grid-cols-[240px_1fr]">
      <aside className="hidden md:block">
        <div className="rounded-2xl p-4 sticky top-20 bg-[#0D0D1A] text-white/90 border border-primary/20 shadow-[0_10px_40px_-20px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
          <div className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.18em] mb-3 px-2">
            Quick links
          </div>
          <ul className="space-y-1">
            {quickLinks.map(({ Icon, label, to }) => (
              <li key={label}>
                <Link
                  to={to}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white border-l-2 border-transparent hover:border-primary hover:bg-white/5 transition-all"
                  activeProps={{
                    className:
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-brand glow-primary border-l-2 border-transparent",
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="space-y-5 sm:space-y-8">
        {/* Welcome banner */}
        <div className="rounded-2xl sm:rounded-3xl p-5 sm:p-10 bg-mesh-brand text-primary-foreground relative overflow-hidden glow-primary">
          <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-white/10 blur-3xl float-soft" />
          <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-accent/30 blur-3xl float-soft-slow" />
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.2em] opacity-80">Welcome back</div>
            <h1 className="text-2xl sm:text-5xl font-extrabold mt-2 tracking-tight">Hi, {name} <span className="inline-block animate-pulse">👋</span></h1>
            <p className="mt-2 sm:mt-3 opacity-90 max-w-xl text-sm sm:text-lg">{greeting}</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold capitalize gradient-border bg-white/10 backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5" /> {role} account
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Active conversations", value: "0", top: "from-primary to-primary-glow", gradient: "text-gradient-brand" as const },
            { label: "Bookings this month", value: "0", top: "from-accent to-primary", gradient: "text-gradient-brand" as const },
            {
              label: "Profile completion",
              value: completion === null ? "—" : `${completion}%`,
              top: "from-coral to-primary",
              gradient: "text-gradient-tri" as const,
              progress: completion ?? 0,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="group relative rounded-2xl glass-card p-5 overflow-hidden lift-hover hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:border-primary/40"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.top}`} />
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className={`mt-2 text-4xl font-extrabold tracking-tight ${s.gradient}`}>{s.value}</div>
              {"progress" in s && typeof s.progress === "number" && (
                <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary via-accent to-coral transition-[width] duration-700"
                    style={{ width: `${Math.max(4, s.progress)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {role !== "customer" && <AnalyticsSection />}

        {role !== "customer" && <WalletSummaryCard />}

        {/* Getting started / Quick links card */}
        <div className="rounded-2xl glass-card p-4 sm:p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-lg sm:text-xl">Getting started</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Jump right back in — your shortcuts are here.
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-primary hidden sm:block" />
          </div>
          <div className="grid gap-3 grid-cols-2">
            {quickLinks.map(({ Icon, label, to }) => (
              <Link
                key={label}
                to={to}
                className="group flex items-center gap-3 rounded-xl p-3 min-h-[56px] border border-border lift-hover hover:-translate-y-0.5 hover:border-primary/40 hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10"
              >
                <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-brand text-primary-foreground flex items-center justify-center glow-primary group-hover:scale-110 transition-transform">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-semibold text-sm group-hover:text-gradient-brand truncate">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}