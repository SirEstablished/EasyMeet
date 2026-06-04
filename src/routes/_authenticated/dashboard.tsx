import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import {
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  Sparkles,
  Search,
  Users,
  Store,
  Package,
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

  const sellsProducts = !!profile?.sells_products;
  const offersServices = profile?.offers_services !== false && role !== "customer";
  const quickLinks: { Icon: typeof Search; label: string; to: string }[] =
    role === "customer"
      ? [
          { Icon: Store, label: "Shop", to: "/shop" },
          { Icon: Search, label: "Browse Professionals", to: "/explore" },
          { Icon: CalendarCheck, label: "My Orders", to: "/my-orders" },
          { Icon: MessageCircle, label: "Messages", to: "/messages" },
        ]
      : [
          ...(offersServices ? [{ Icon: Sparkles, label: "My Services", to: "/my-services" }] : []),
          ...(sellsProducts ? [{ Icon: Package, label: "My Products", to: "/my-products" }] : []),
          { Icon: CalendarCheck, label: "My Bookings", to: "/my-bookings" },
          { Icon: Store, label: "Shop", to: "/shop" },
          { Icon: Users, label: "Explore", to: "/explore" },
          { Icon: MessageCircle, label: "Messages", to: "/messages" },
        ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-[240px_1fr]">
      <aside className="hidden md:block">
        <div className="rounded-2xl glass-card p-4 sticky top-20">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick links
          </div>
          <ul className="space-y-1">
            {quickLinks.map(({ Icon, label, to }) => (
              <li key={label}>
                <Link
                  to={to}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm lift-hover hover:bg-gradient-brand hover:text-primary-foreground text-left"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="space-y-6">
        <div className="rounded-3xl p-8 bg-mesh-brand text-primary-foreground relative overflow-hidden glow-primary">
          <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative">
            <div className="text-sm uppercase tracking-wider opacity-80">Welcome back</div>
            <h1 className="text-3xl sm:text-4xl font-bold mt-1">Hi, {name} 👋</h1>
            <p className="mt-2 opacity-90 max-w-xl">{greeting}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium capitalize">
              <ShieldCheck className="h-3.5 w-3.5" /> {role} account
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Active conversations", value: "0", accent: "border-l-primary" },
            { label: "Bookings this month", value: "0", accent: "border-l-accent" },
            { label: "Profile completion", value: profile?.full_name ? "60%" : "20%", accent: "border-l-[#ff7ad9]" },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl glass-card p-5 border-l-4 ${s.accent} lift-hover hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-2xl font-bold text-gradient-brand">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl glass-card p-6">
          <h2 className="font-semibold text-lg">Getting started</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete your profile in Settings to unlock the full EasyMeet experience.
          </p>
        </div>
      </div>
    </div>
  );
}