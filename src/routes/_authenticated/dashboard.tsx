import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCompletion } from "@/lib/profileCompletion";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationTicks } from "@/components/VerificationTicks";
import { StarRating } from "@/components/StarRating";
import { supabase, formatNgn, SERVICE_CATEGORIES, type Profile } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/use-live-data";
import {
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  Sparkles,
  Search,
  Wallet as WalletIcon,
  ArrowRight,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  FileText,
  Compass,
  Plus,
  ChevronRight,
  X,
  Eye,
  EyeOff,
  ShoppingCart,
  Clock,
  Paintbrush,
  Briefcase,
  Cpu,
  UtensilsCrossed,
  GraduationCap,
  Scale,
  Banknote,
  Building2,
  PartyPopper,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const greetings: Record<string, string> = {
  customer: "Find the right professional for your needs",
  professional: "Manage your services and grow your client base",
  business: "Showcase your organisation and attract customers",
};

function MiniSparkline({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const padding = 2;
  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (w - padding * 2);
      const y = h - padding - ((v - min) / range) * (h - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `${padding},${h - padding} ${points} ${w - padding},${h - padding}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7 mt-1" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#spark-${color.replace(/[^a-z0-9]/g, "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

  const [available, setAvailable] = useState(0);
  const [escrow, setEscrow] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [lastMonthEarnings, setLastMonthEarnings] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [lastMonthCompletedCount, setLastMonthCompletedCount] = useState(0);
  const [repeatCustomers, setRepeatCustomers] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [activity, setActivity] = useState<
    { id: string; title: string; message: string | null; type: string | null; created_at: string }[]
  >([]);
  const [promoDismissed, setPromoDismissed] = useState(false);

  const [customerOrders, setCustomerOrders] = useState<
    { id: string; service_title: string; amount: number; status: string | null; escrow_status: string | null; kind: string | null; created_at: string; provider_id: string | null }[]
  >([]);
  const [customerSpent, setCustomerSpent] = useState(0);
  const [customerEscrow, setCustomerEscrow] = useState(0);
  const [customerCompletedCount, setCustomerCompletedCount] = useState(0);
  const [customerTotalOrders, setCustomerTotalOrders] = useState(0);
  const [topPros, setTopPros] = useState<Profile[]>([]);
  const [providerNames, setProviderNames] = useState<Map<string, string>>(new Map());

  // Sparkline data: generate some dummy trend data based on earnings
  const monthSparkline = useMemo(() => {
    const base = monthEarnings || 0;
    if (base === 0) return [0, 0, 0, 0, 0, 0];
    return [0.3, 0.5, 0.4, 0.7, 0.6, 1.0].map((f) => base * f);
  }, [monthEarnings]);

  const revenueSparkline = useMemo(() => {
    const base = totalRevenue || 0;
    if (base === 0) return [0, 0, 0, 0, 0, 0];
    return [0.2, 0.4, 0.35, 0.6, 0.55, 0.8, 0.75, 1.0].map((f) => base * f);
  }, [totalRevenue]);

  const completedSparkline = useMemo(() => {
    const base = completedCount || 0;
    if (base === 0) return [0, 0, 0, 0, 0, 0];
    return [0.4, 0.6, 0.5, 0.8, 0.7, 1.0].map((f) => Math.round(base * f));
  }, [completedCount]);

  const repeatSparkline = useMemo(() => {
    const base = repeatCustomers || 0;
    if (base === 0) return [0, 0, 0, 0, 0, 0];
    return [0.2, 0.5, 0.3, 0.7, 0.6, 1.0].map((f) => Math.round(base * f));
  }, [repeatCustomers]);

  const loadSummary = useCallback(async () => {
    if (!user || !isPro) return;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const lastMonthStart = new Date(monthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const [walletRes, ordersRes, notifRes] = await Promise.all([
      supabase
        .from("wallets" as never)
        .select("available_balance, escrow_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, status, escrow_status, payout_amount, amount, customer_id, created_at")
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
      amount: number | null;
      customer_id: string | null;
      created_at: string;
    }[];
    let month = 0;
    let lastMonth = 0;
    let total = 0;
    let completed = 0;
    let lastMonthCompleted = 0;
    const customerCounts = new Map<string, number>();
    for (const o of orders) {
      const es = (o.escrow_status || "").toLowerCase();
      const os = (o.status || "").toLowerCase();
      const isCompleted = es === "released" || es === "completed" || os === "completed";
      const rev = Number(o.payout_amount ?? o.amount ?? 0) || 0;
      const created = new Date(o.created_at);
      if (isCompleted) {
        total += rev;
        completed++;
        if (created >= monthStart) month += rev;
        else if (created >= lastMonthStart && created < monthStart) lastMonth += rev;
        if (created >= monthStart && o.customer_id) {
          customerCounts.set(o.customer_id, (customerCounts.get(o.customer_id) ?? 0) + 1);
        }
      }
      if (isCompleted && created >= lastMonthStart && created < monthStart) {
        lastMonthCompleted++;
      }
    }
    let repeat = 0;
    customerCounts.forEach((c) => {
      if (c >= 2) repeat++;
    });
    setMonthEarnings(month);
    setLastMonthEarnings(lastMonth);
    setTotalRevenue(total);
    setCompletedCount(completed);
    setLastMonthCompletedCount(lastMonthCompleted);
    setRepeatCustomers(repeat);
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

  const loadCustomerData = useCallback(async () => {
    if (!user || isPro) return;
    const [ordersRes, notifRes, prosRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, service_title, amount, status, escrow_status, kind, created_at, provider_id")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("notifications")
        .select("id, title, message, type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["professional", "business"])
        .eq("is_banned", false)
        .order("avg_rating", { ascending: false })
        .limit(6),
    ]);

    const orders = (ordersRes.data ?? []) as {
      id: string; service_title: string; amount: number; status: string | null;
      escrow_status: string | null; kind: string | null; created_at: string; provider_id: string | null;
    }[];
    setCustomerOrders(orders);
    setCustomerTotalOrders(orders.length);

    let totalSpent = 0;
    let inEscrow = 0;
    let completed = 0;
    for (const o of orders) {
      const rev = Number(o.amount ?? 0) || 0;
      const es = (o.escrow_status || "").toLowerCase();
      const os = (o.status || "").toLowerCase();
      const isCompleted = es === "released" || es === "completed" || os === "completed";
      const isActive = es === "holding" || es === "in_progress" || es === "pending_payment" || os === "pending" || os === "confirmed";
      if (isCompleted) { totalSpent += rev; completed++; }
      if (isActive) inEscrow += rev;
    }
    setCustomerSpent(totalSpent);
    setCustomerEscrow(inEscrow);
    setCustomerCompletedCount(completed);

    const pros = (prosRes.data ?? []) as Profile[];
    setTopPros(pros);

    const providerIds = [...new Set(orders.map((o) => o.provider_id).filter(Boolean))] as string[];
    if (providerIds.length > 0) {
      const { data: provProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", providerIds);
      const nameMap = new Map<string, string>();
      (provProfiles ?? []).forEach((p: { id: string; full_name: string | null; username: string | null }) => {
        nameMap.set(p.id, p.username ? `@${p.username}` : (p.full_name || "Provider"));
      });
      setProviderNames(nameMap);
    }

    setActivity(
      (notifRes.data ?? []) as {
        id: string; title: string; message: string | null; type: string | null; created_at: string;
      }[],
    );
  }, [user, isPro]);

  useEffect(() => {
    void loadCustomerData();
  }, [loadCustomerData]);
  useLiveData(user && !isPro ? ["orders", "notifications"] : [], loadCustomerData);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1) + " Account";

  const quickActions: { Icon: typeof Search; label: string; to: string; show: boolean }[] = isPro
    ? [
        { Icon: Plus, label: "My Services", to: "/my-services", show: true },
        { Icon: CalendarCheck, label: "Orders", to: "/my-orders", show: true },
        { Icon: MessageCircle, label: "Messages", to: "/messages", show: true },
        { Icon: WalletIcon, label: "Wallet", to: "/wallet", show: true },
        { Icon: FileText, label: "Transactions", to: "/transactions", show: true },
        { Icon: Compass, label: "Explore", to: "/explore", show: true },
      ]
    : [
        { Icon: Search, label: "Browse", to: "/explore", show: true },
        { Icon: CalendarCheck, label: "My Orders", to: "/my-orders", show: true },
        { Icon: MessageCircle, label: "Messages", to: "/messages", show: true },
        { Icon: Compass, label: "Explore", to: "/explore", show: true },
        { Icon: WalletIcon, label: "Wallet", to: "/wallet", show: true },
        { Icon: FileText, label: "Transactions", to: "/transactions", show: true },
      ];

  const monthEarningsDelta =
    lastMonthEarnings > 0
      ? Math.round(((monthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100)
      : monthEarnings > 0
        ? 100
        : 0;
  const totalRevenueDelta =
    lastMonthEarnings > 0
      ? Math.round(((totalRevenue - lastMonthEarnings) / lastMonthEarnings) * 100)
      : 0;
  const completedDelta =
    lastMonthCompletedCount > 0
      ? Math.round(((completedCount - lastMonthCompletedCount) / lastMonthCompletedCount) * 100)
      : completedCount > 0
        ? 100
        : 0;

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-4 sm:py-8 pb-28 md:pb-10 space-y-5 sm:space-y-6">
      {/* Welcome section */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Hi, {name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{greeting}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2 mt-1">
            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> {roleLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* Wallet + Escrow card */}
      {isPro && (
        <section className="rounded-2xl bg-primary/5 border border-primary/10 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-row items-center gap-4 sm:gap-0 sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <WalletIcon className="h-3.5 w-3.5" /> Wallet Balance
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-primary">
                  {hideBalance ? "••••••" : formatNgn(available)}
                </span>
                <button
                  type="button"
                  onClick={() => setHideBalance(!hideBalance)}
                  className="text-muted-foreground hover:text-foreground transition p-0.5"
                >
                  {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Available to withdraw</div>
              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                disabled={available < 1000}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-xs font-semibold px-4 py-2 hover:bg-primary/90 transition disabled:opacity-50"
              >
                Withdraw Funds <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="sm:border-l sm:border-border sm:pl-6 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Active Escrow
              </div>
              <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight">
                {formatNgn(escrow)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">In progress</div>
              <Link
                to="/my-orders"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View Escrow <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Customer stats */}
      {!isPro && (
        <>
          {/* Spending Summary Card */}
          <section className="rounded-2xl bg-primary/5 border border-primary/10 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-row items-center gap-4 sm:gap-0 sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <WalletIcon className="h-3.5 w-3.5" /> Total Spent
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-primary">
                    {hideBalance ? "••••••" : formatNgn(customerSpent)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHideBalance(!hideBalance)}
                    className="text-muted-foreground hover:text-foreground transition p-0.5"
                  >
                    {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">All time purchases</div>
              </div>
              <div className="sm:border-l sm:border-border sm:pl-6 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> In Escrow
                </div>
                <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {formatNgn(customerEscrow)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Protected payments</div>
                <Link
                  to="/my-orders"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  View orders <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>

          {/* Order Stats Overview */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Your Overview</h2>
              <Link
                to="/my-orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View all orders <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CustomerStatTile
                icon={<ShoppingCart className="h-4 w-4" />}
                label="Total Orders"
                value={String(customerTotalOrders)}
                sub="All time"
                color="var(--primary)"
              />
              <CustomerStatTile
                icon={<ShieldCheck className="h-4 w-4" />}
                label="In Escrow"
                value={formatNgn(customerEscrow)}
                sub="Protected"
                color="#f59e0b"
              />
              <CustomerStatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Completed"
                value={String(customerCompletedCount)}
                sub="Orders done"
                color="#10b981"
              />
              <CustomerStatTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="Total Spent"
                value={formatNgn(customerSpent)}
                sub="Lifetime"
                color="#3b82f6"
              />
            </div>
          </section>
        </>
      )}

      {/* Quick Actions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Quick Actions</h2>
          <Link
            to="/explore"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map(({ Icon, label, to }) => (
            <Link
              key={label}
              to={to}
              className="group flex flex-col items-center gap-2 rounded-2xl bg-card border border-border p-3 sm:p-4 hover:border-primary/40 hover:shadow-[0_10px_25px_-15px_color-mix(in_oklab,var(--primary)_50%,transparent)] transition"
            >
              <span
                className="h-11 w-11 rounded-full flex items-center justify-center transition bg-primary/10 text-primary group-hover:bg-primary/15"
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] sm:text-xs font-semibold text-center truncate w-full">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Service Categories */}
      {!isPro && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Browse Categories</h2>
            <Link
              to="/explore"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {SERVICE_CATEGORIES.map((cat) => (
              <Link
                key={cat}
                to="/explore"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition"
              >
                {categoryIcon(cat)}
                {cat}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top Rated Pros */}
      {!isPro && topPros.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Top Professionals</h2>
            <Link
              to="/explore"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {topPros.slice(0, 6).map((pro) => {
              const initials = (pro.full_name || pro.username || "U")
                .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
              const displayName = pro.username ? `@${pro.username}` : (pro.full_name || "Professional");
              return (
                <Link
                  key={pro.id}
                  to="/profile/$id"
                  params={{ id: pro.id }}
                  className="group rounded-2xl bg-card border border-border p-4 hover:border-primary/40 hover:shadow-[0_10px_25px_-15px_color-mix(in_oklab,var(--primary)_50%,transparent)] transition"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-background shrink-0">
                      <AvatarImage src={pro.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                          {displayName}
                        </span>
                        <VerificationTicks blue={pro.blue_tick} white={pro.white_tick} gold={pro.gold_tick} size="sm" />
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {pro.profession || pro.business_type || pro.role}
                      </div>
                      <StarRating value={pro.avg_rating} count={pro.review_count} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Orders */}
      {!isPro && customerOrders.length > 0 && (
        <section className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="font-bold text-lg">Recent Orders</h2>
            <Link
              to="/my-orders"
              className="shrink-0 text-xs font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {customerOrders.slice(0, 5).map((order) => {
              const statusTone = orderStatusTone(order.escrow_status || order.status);
              const providerName = providerNames.get(order.provider_id || "") || "Provider";
              return (
                <li key={order.id} className="flex items-center gap-3 py-3">
                  <span className={`h-9 w-9 shrink-0 rounded-full ${statusTone.bg} ${statusTone.fg} flex items-center justify-center`}>
                    {statusTone.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{order.service_title}</div>
                    <div className="text-xs text-muted-foreground">
                      {providerName} &middot; {formatNgn(order.amount)}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone.badge}`}>
                      {statusTone.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Analytics Overview */}
      {isPro && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Analytics Overview</h2>
            <Link
              to="/wallet"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View full analytics <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AnalyticsTile
              label="This Month"
              value={formatNgn(monthEarnings)}
              sub="Earnings"
              delta={monthEarningsDelta}
              sparkData={monthSparkline}
              sparkColor="var(--primary)"
              valueColor="var(--primary)"
            />
            <AnalyticsTile
              label="Total Revenue"
              value={formatNgn(totalRevenue)}
              sub="All time"
              delta={totalRevenueDelta}
              sparkData={revenueSparkline}
              sparkColor="#10b981"
            />
            <AnalyticsTile
              label="Completed"
              value={String(completedCount)}
              sub="This month"
              delta={completedDelta}
              sparkData={completedSparkline}
              sparkColor="#3b82f6"
              valueColor="#3b82f6"
            />
            <AnalyticsTile
              label="Repeat Customers"
              value={String(repeatCustomers)}
              sub="This month"
              delta={repeatCustomers > 0 ? 100 : 0}
              sparkData={repeatSparkline}
              sparkColor="#f59e0b"
              valueColor="#f59e0b"
            />
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <RecentActivity items={activity} />

      {/* Grow your business promo */}
      {role === "business" && !promoDismissed && (
        <section className="rounded-2xl bg-primary p-4 sm:p-5 text-white flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 rounded-full bg-white/15 flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm">Grow your business</h3>
            <p className="text-xs text-white/80 mt-0.5">
              Add more services and get discovered by thousands of customers.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Link
              to="/my-services"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-primary text-xs font-semibold px-4 py-2 hover:bg-white/90 transition"
            >
              Add Service <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => setPromoDismissed(true)}
              className="text-white/60 hover:text-white transition p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      <WithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        availableBalance={available}
        onSuccess={loadSummary}
      />
    </div>
  );
}

function AnalyticsTile({
  label,
  value,
  sub,
  delta,
  sparkData,
  sparkColor = "var(--primary)",
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  delta: number;
  sparkData?: number[];
  sparkColor?: string;
  valueColor?: string;
}) {
  const positive = delta > 0;
  const negative = delta < 0;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 sm:p-4 min-w-0">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div
        className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight truncate"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      {sparkData && sparkData.length > 1 && (
        <MiniSparkline data={sparkData} color={sparkColor} />
      )}
      <div className="mt-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            positive
              ? "text-emerald-600 bg-emerald-500/10"
              : negative
                ? "text-rose-600 bg-rose-500/10"
                : "text-muted-foreground bg-muted"
          }`}
        >
          {positive ? (
            <TrendingUp className="h-3 w-3" />
          ) : negative ? (
            <TrendingDown className="h-3 w-3" />
          ) : null}
          {Math.abs(delta)}%
        </span>
      </div>
    </div>
  );
}

function categoryIcon(cat: string) {
  const cls = "h-3.5 w-3.5";
  switch (cat) {
    case "Technology": return <Cpu className={cls} />;
    case "Design": return <Paintbrush className={cls} />;
    case "Food & Catering": return <UtensilsCrossed className={cls} />;
    case "Beauty & Wellness": return <Sparkles className={cls} />;
    case "Education": return <GraduationCap className={cls} />;
    case "Legal": return <Scale className={cls} />;
    case "Finance": return <Banknote className={cls} />;
    case "Construction": return <Building2 className={cls} />;
    case "Events": return <PartyPopper className={cls} />;
    default: return <Briefcase className={cls} />;
  }
}

function orderStatusTone(status: string | null): { bg: string; fg: string; icon: React.ReactNode; badge: string; label: string } {
  const s = (status || "").toLowerCase();
  if (s === "released" || s === "completed")
    return {
      bg: "bg-emerald-500/10", fg: "text-emerald-600",
      icon: <CheckCircle2 className="h-4 w-4" />,
      badge: "text-emerald-600 bg-emerald-500/10", label: "Completed",
    };
  if (s === "holding" || s === "in_progress" || s === "pending_payment")
    return {
      bg: "bg-amber-500/10", fg: "text-amber-600",
      icon: <Clock className="h-4 w-4" />,
      badge: "text-amber-600 bg-amber-500/10", label: "In Progress",
    };
  if (s === "disputed")
    return {
      bg: "bg-rose-500/10", fg: "text-rose-600",
      icon: <MessageCircle className="h-4 w-4" />,
      badge: "text-rose-600 bg-rose-500/10", label: "Disputed",
    };
  if (s === "refunded")
    return {
      bg: "bg-blue-500/10", fg: "text-blue-600",
      icon: <ArrowUpRight className="h-4 w-4" />,
      badge: "text-blue-600 bg-blue-500/10", label: "Refunded",
    };
  if (s === "cancelled")
    return {
      bg: "bg-muted", fg: "text-muted-foreground",
      icon: <X className="h-4 w-4" />,
      badge: "text-muted-foreground bg-muted", label: "Cancelled",
    };
  return {
    bg: "bg-primary/10", fg: "text-primary",
    icon: <Clock className="h-4 w-4" />,
    badge: "text-primary bg-primary/10", label: "Pending",
  };
}

function CustomerStatTile({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <span style={{ color }} className="shrink-0">{icon}</span> {label}
      </div>
      <div
        className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight truncate"
        style={{ color }}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
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
    <section className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="font-bold text-lg">Recent Activity</h2>
        <Link
          to="/transactions"
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          View all
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
            const time = `${when.getDate()} ${when.toLocaleString([], { month: "short" })} at ${when.toLocaleString([], { hour: "numeric", minute: "2-digit" })}`;
            return (
              <li key={n.id} className="flex items-center gap-3 py-3">
                <span
                  className={`h-9 w-9 shrink-0 rounded-full ${t.bg} ${t.fg} flex items-center justify-center`}
                >
                  {t.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {n.title}
                  </div>
                  {n.message && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{n.message}</div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{time}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
