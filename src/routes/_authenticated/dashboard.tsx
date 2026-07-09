import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCompletion } from "@/lib/profileCompletion";
import { AnalyticsSection } from "@/components/AnalyticsSection";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/use-live-data";
import {
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  Sparkles,
  Search,
  Users,
  Users2,
  Wallet as WalletIcon,
  ArrowRight,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  FileText,
  Compass,
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
  const isPro = role === "professional" || role === "business";

  // ---- Wallet + orders summary (professionals/businesses) ----
  const [available, setAvailable] = useState(0);
  const [escrow, setEscrow] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [activity, setActivity] = useState<
    { id: string; title: string; message: string | null; type: string | null; created_at: string }[]
  >([]);

  const loadSummary = useCallback(async () => {
    if (!user || !isPro) return;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [walletRes, ordersRes, notifRes] = await Promise.all([
      supabase
        .from("wallets" as never)
        .select("available_balance, escrow_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, status, escrow_status, payout_amount, amount_ngn, amount, created_at")
        .eq("provider_id", user.id),
      supabase
        .from("notifications")
        .select("id, title, message, type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);
    const w = walletRes.data as { available_balance?: number; escrow_balance?: number } | null;
    setAvailable(Number(w?.available_balance ?? 0));
    setEscrow(Number(w?.escrow_balance ?? 0));
    const orders = (ordersRes.data ?? []) as {
      status: string | null;
      escrow_status: string | null;
      payout_amount: number | null;
      amount_ngn: number | null;
      amount: number | null;
      created_at: string;
    }[];
    let month = 0;
    let pending = 0;
    for (const o of orders) {
      const es = (o.escrow_status || "").toLowerCase();
      const os = (o.status || "").toLowerCase();
      const completedOrder = es === "released" || es === "completed" || os === "completed";
      const rev = Number(o.payout_amount ?? o.amount_ngn ?? o.amount ?? 0) || 0;
      if (completedOrder && new Date(o.created_at) >= monthStart) month += rev;
      if (os === "pending" || es === "held" || es === "in_escrow" || es === "pending") pending += 1;
    }
    setMonthEarnings(month);
    setPendingOrders(pending);
    setActivity(
      (notifRes.data ?? []) as {
        id: string;
        title: string;
        message: string | null;
        type: string | null;
        created_at: string;
      }[],
    );
  }, [user, isPro]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);
  useLiveData(user && isPro ? ["wallets", "orders", "notifications"] : [], loadSummary);

  const quickLinks: { Icon: typeof Search; label: string; to: string }[] =
    role === "customer"
      ? [
          { Icon: Search, label: "Browse Professionals", to: "/explore" },
          { Icon: CalendarCheck, label: "My Orders", to: "/my-orders" },
          { Icon: WalletIcon, label: "Transactions", to: "/transactions" },
          { Icon: MessageCircle, label: "Messages", to: "/messages" },
        ]
      : [
          ...(offersServices ? [{ Icon: Sparkles, label: "My Services", to: "/my-services" }] : []),
          // "My Products" hidden until the shop is live.
          { Icon: CalendarCheck, label: "Orders", to: "/my-orders" },
          { Icon: MessageCircle, label: "Messages", to: "/messages" },
          { Icon: WalletIcon, label: "Wallet", to: "/wallet" },
          { Icon: FileText, label: "Transactions", to: "/transactions" },
          { Icon: Compass, label: "Explore", to: "/explore" },
          ...(role === "business" ? [{ Icon: Users2, label: "Staffs", to: "/staffs" }] : []),
        ];

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1) + " Account";

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-4 sm:py-8 pb-28 md:pb-10 grid gap-6 md:gap-8 md:grid-cols-[240px_1fr]">
      <aside className="hidden md:block">
        <div className="rounded-3xl p-4 sticky top-20 bg-card border border-border shadow-sm">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3 px-2">
            Quick links
          </div>
          <ul className="space-y-1">
            {quickLinks.map(({ Icon, label, to }) => (
              <li key={label}>
                <Link
                  to={to}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-primary/5 transition-all"
                  activeProps={{
                    className:
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-primary bg-primary/10",
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

      <div className="space-y-5 sm:space-y-6 min-w-0">
        {/* Welcome banner */}
        <section className="relative overflow-hidden rounded-3xl p-5 sm:p-7 text-white shadow-[0_20px_50px_-25px_color-mix(in_oklab,var(--primary)_60%,transparent)] bg-primary">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                Welcome back
              </div>
              <h1 className="mt-1.5 text-2xl sm:text-4xl font-extrabold tracking-tight truncate">
                Hi, {name} <span className="inline-block"></span>
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-white/85 max-w-md">{greeting}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-2.5 py-1 text-[11px] font-semibold">
                <ShieldCheck className="h-3 w-3" /> {roleLabel}
              </div>
            </div>
            <Link
              to="/profile"
              className="shrink-0 hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white text-primary font-semibold text-sm px-4 py-2.5 shadow-sm hover:bg-white/95 transition"
            >
              View profile <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <Link
            to="/profile"
            className="sm:hidden mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white text-primary font-semibold text-sm px-4 py-2.5 shadow-sm"
          >
            View profile <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* Stat cards */}
        {isPro ? (
          <ProStats
            available={available}
            escrow={escrow}
            monthEarnings={monthEarnings}
            pendingOrders={pendingOrders}
            onWithdraw={() => setWithdrawOpen(true)}
          />
        ) : (
          <CustomerStats completion={completion} />
        )}

        {role !== "customer" && (
          <div className="rounded-3xl bg-card border border-border p-4 sm:p-6 shadow-sm">
            <AnalyticsSection />
          </div>
        )}

        {/* Quick actions */}
        <section className="space-y-3">
          <div>
            <h2 className="font-bold text-lg">Quick actions</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {role === "customer"
                ? "Everything you need in one tap."
                : "Manage your business with ease."}
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
            {quickLinks.map(({ Icon, label, to }) => (
              <Link
                key={label}
                to={to}
                className="group flex flex-col items-center gap-2 rounded-2xl bg-card border border-border p-3 sm:p-4 hover:border-primary/40 hover:shadow-[0_10px_25px_-15px_color-mix(in_oklab,var(--primary)_50%,transparent)] transition"
              >
                <span className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary/15 transition">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[11px] sm:text-xs font-semibold text-center truncate w-full">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent activity */}
        {isPro && <RecentActivity items={activity} />}
      </div>

      {isPro && (
        <WithdrawDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          availableBalance={available}
          onSuccess={loadSummary}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  linkLabel,
  to,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  linkLabel: string;
  to: string;
  tone?: "primary" | "accent" | "coral";
}) {
  const toneClass =
    tone === "accent" ? "text-accent" : tone === "coral" ? "text-coral" : "text-primary";
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-sm flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`mt-2 text-xl sm:text-2xl font-extrabold tracking-tight truncate ${toneClass}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>
      <Link
        to={to}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        {linkLabel} <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function ProStats({
  available,
  escrow,
  monthEarnings,
  pendingOrders,
  onWithdraw,
}: {
  available: number;
  escrow: number;
  monthEarnings: number;
  pendingOrders: number;
  onWithdraw: () => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <WalletIcon className="h-3.5 w-3.5 shrink-0" />{" "}
          <span className="truncate">Wallet balance</span>
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold tracking-tight text-primary truncate">
          {formatNgn(available)}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">Available to withdraw</div>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={available < 1000}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline text-left"
        >
          Withdraw <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <StatCard
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        label="Active escrow"
        value={formatNgn(escrow)}
        sub="In progress"
        linkLabel="See escrow"
        to="/my-orders"
      />
      <StatCard
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        label="This month"
        value={formatNgn(monthEarnings)}
        sub="Earnings"
        linkLabel="View analytics"
        to="/wallet"
        tone="accent"
      />
      <StatCard
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Pending orders"
        value={String(pendingOrders)}
        sub="Awaiting action"
        linkLabel="View orders"
        to="/my-orders"
        tone="coral"
      />
    </div>
  );
}

function CustomerStats({ completion }: { completion: number | null }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
      <StatCard
        icon={<MessageCircle className="h-3.5 w-3.5" />}
        label="Conversations"
        value="0"
        sub="Active chats"
        linkLabel="Open messages"
        to="/messages"
      />
      <StatCard
        icon={<CalendarCheck className="h-3.5 w-3.5" />}
        label="Bookings"
        value="0"
        sub="This month"
        linkLabel="View orders"
        to="/my-orders"
        tone="accent"
      />
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm min-w-0 col-span-2 lg:col-span-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" /> Profile completion
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold tracking-tight text-primary">
          {completion === null ? "—" : `${completion}%`}
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-700"
            style={{ width: `${Math.max(4, completion ?? 0)}%` }}
          />
        </div>
        <Link
          to="/profile"
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Complete profile <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function activityTone(type: string | null): { bg: string; fg: string; icon: React.ReactNode } {
  const t = (type || "").toLowerCase();
  if (t.includes("escrow") || t.includes("payment") || t.includes("wallet"))
    return {
      bg: "bg-emerald-500/10",
      fg: "text-emerald-600",
      icon: <CheckCircle2 className="h-4 w-4" />,
    };
  if (t.includes("message") || t.includes("chat"))
    return {
      bg: "bg-primary/10",
      fg: "text-primary",
      icon: <MessageCircle className="h-4 w-4" />,
    };
  if (t.includes("order") || t.includes("booking"))
    return {
      bg: "bg-blue-500/10",
      fg: "text-blue-600",
      icon: <CalendarCheck className="h-4 w-4" />,
    };
  return {
    bg: "bg-primary/10",
    fg: "text-primary",
    icon: <Sparkles className="h-4 w-4" />,
  };
}

function RecentActivity({
  items,
}: {
  items: {
    id: string;
    title: string;
    message: string | null;
    type: string | null;
    created_at: string;
  }[];
}) {
  const list = useMemo(() => items.slice(0, 4), [items]);
  return (
    <section className="rounded-3xl bg-card border border-border p-4 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-bold text-lg">Recent activity</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Stay updated with your latest activities
          </p>
        </div>
        <Link
          to="/transactions"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {list.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No recent activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((n) => {
            const t = activityTone(n.type);
            const when = new Date(n.created_at);
            const time = when.toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
            return (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <span
                  className={`h-9 w-9 shrink-0 rounded-full ${t.bg} ${t.fg} flex items-center justify-center`}
                >
                  {t.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{n.title}</div>
                  {n.message && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{n.message}</div>
                  )}
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                  {time}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
