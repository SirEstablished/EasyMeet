import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { supabase, formatNgn, type Profile } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/use-live-data";
import { VerificationTicks } from "@/components/VerificationTicks";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import {
  Wallet as WalletIcon,
  Lock,
  TrendingUp,
  Package,
  Plus,
  Zap,
  ClipboardList,
  Users,
  Megaphone,
  Bell,
  CheckCircle2,
  Image,
  Star,
  Rss,
} from "lucide-react";

type BizOrder = {
  id: string;
  customer_id: string;
  service_title: string;
  amount: number;
  status: string | null;
  escrow_status: string | null;
  kind: string | null;
  created_at: string;
};

type OrderFilter = "all" | "new" | "processing" | "completed";

const growthTips = [
  { Icon: CheckCircle2, title: "Verify your business", desc: "Verified businesses get 2× more orders" },
  { Icon: Image, title: "Add product photos", desc: "High-quality images increase conversions by 40%" },
  { Icon: Star, title: "Request reviews", desc: "Ask happy customers to leave a review" },
  { Icon: Megaphone, title: "Post your work", desc: "Regular Feed posts keep you visible to customers" },
];

function orderStatusMeta(o: BizOrder): { key: "new" | "processing" | "completed" | "cancelled"; label: string; color: string } {
  const es = (o.escrow_status || "").toLowerCase();
  const os = (o.status || "").toLowerCase();
  if (os === "cancelled") return { key: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-600" };
  if (es === "released" || es === "completed" || os === "completed")
    return { key: "completed", label: "Delivered", color: "bg-emerald-100 text-emerald-700" };
  if (os === "pending") return { key: "new", label: "New", color: "bg-violet-100 text-violet-700" };
  return { key: "processing", label: "Processing", color: "bg-amber-100 text-amber-700" };
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const w = 200;
  const h = 48;
  const pts = points.map((p, i) => `${(i / Math.max(points.length - 1, 1)) * w},${h - (p / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
      <polyline fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      <polyline fill="url(#bizgrad)" stroke="none" points={`0,${h} ${pts} ${w},${h}`} />
      <defs>
        <linearGradient id="bizgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#059669" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function BusinessHome() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<BizOrder[]>([]);
  const [customerMap, setCustomerMap] = useState<Map<string, Pick<Profile, "id" | "full_name" | "avatar_url">>>(
    new Map(),
  );
  const [available, setAvailableBalance] = useState(0);
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [serviceCount, setServiceCount] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");

  const load = useCallback(async () => {
    if (!user) return;
    const [walletRes, ordersRes, productsRes, servicesRes] = await Promise.all([
      supabase
        .from("wallets" as never)
        .select("available_balance, escrow_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, customer_id, service_title, amount, status, escrow_status, kind, created_at")
        .eq("provider_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("provider_id", user.id),
    ]);
    const w = walletRes.data as { available_balance?: number; escrow_balance?: number } | null;
    setAvailableBalance(Number(w?.available_balance ?? 0));
    setEscrowBalance(Number(w?.escrow_balance ?? 0));
    setProductCount(productsRes.count ?? 0);
    setServiceCount(servicesRes.count ?? 0);
    const orderRows = (ordersRes.data ?? []) as BizOrder[];
    setOrders(orderRows);

    const customerIds = [...new Set(orderRows.map((o) => o.customer_id).filter(Boolean))];
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", customerIds);
      setCustomerMap(new Map((customers ?? []).map((c) => [c.id, c as Pick<Profile, "id" | "full_name" | "avatar_url">])));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveData(user ? ["orders", "wallets", "products", "services"] : [], load);

  const productOrders = useMemo(() => orders.filter((o) => o.kind !== "service"), [orders]);
  const serviceBookings = useMemo(() => orders.filter((o) => o.kind === "service"), [orders]);

  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return productOrders;
    return productOrders.filter((o) => orderStatusMeta(o).key === orderFilter);
  }, [productOrders, orderFilter]);

  const activeOrderCount = useMemo(
    () => orders.filter((o) => ["new", "processing"].includes(orderStatusMeta(o).key)).length,
    [orders],
  );
  const newProcessingCount = useMemo(
    () => productOrders.filter((o) => ["new", "processing"].includes(orderStatusMeta(o).key)).length,
    [productOrders],
  );
  const totalCustomers = useMemo(() => new Set(orders.map((o) => o.customer_id)).size, [orders]);

  const { thisMonthTotal, lastMonthTotal, sparkPoints, bestSeller } = useMemo(() => {
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;
    let thisMonth = 0;
    let lastMonth = 0;
    const weekBuckets = new Array(8).fill(0);
    const titleTotals = new Map<string, number>();

    for (const o of orders) {
      const meta = orderStatusMeta(o);
      if (meta.key === "cancelled") continue;
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const amt = Number(o.amount) || 0;
      if (key === thisMonthKey) thisMonth += amt;
      if (key === lastMonthKey) lastMonth += amt;

      const weeksAgo = Math.floor((now.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksAgo >= 0 && weeksAgo < 8) weekBuckets[7 - weeksAgo] += amt;

      titleTotals.set(o.service_title, (titleTotals.get(o.service_title) ?? 0) + amt);
    }

    let best: { title: string; total: number } | null = null;
    for (const [title, total] of titleTotals) {
      if (!best || total > best.total) best = { title, total };
    }

    return { thisMonthTotal: thisMonth, lastMonthTotal: lastMonth, sparkPoints: weekBuckets, bestSeller: best };
  }, [orders]);

  const monthChangePct = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

  const name = profile?.full_name || user?.email?.split("@")[0] || "there";
  const overviewMetrics = [
    { label: "Available", value: formatNgn(available), Icon: WalletIcon, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
    { label: "In Escrow", value: formatNgn(escrowBalance), Icon: Lock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
    { label: "This Month", value: formatNgn(thisMonthTotal), Icon: TrendingUp, bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-100" },
    { label: "Active Orders", value: String(activeOrderCount), Icon: Package, bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-100" },
  ];
  const secondaryMetrics = [
    { label: "Products Listed", value: String(productCount) },
    { label: "Services Offered", value: String(serviceCount) },
    { label: "Total Customers", value: String(totalCustomers) },
    { label: "This Month", value: monthChangePct !== null ? `${monthChangePct >= 0 ? "+" : ""}${monthChangePct}%` : "—" },
  ];

  return (
    <div className="bg-gray-50 min-h-full pb-28 md:pb-10">
      {/* Header */}
      <div className="bg-emerald-900 px-5 pt-6 pb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-60 h-60 bg-emerald-800 rounded-full -translate-y-1/3 translate-x-1/3 opacity-40 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center overflow-hidden border-2 border-emerald-700 flex-shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-emerald-700 font-black text-lg">{name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-white font-bold text-base leading-tight">{name}</h1>
                  <VerificationTicks blue={profile?.blue_tick} white={profile?.white_tick} gold={profile?.gold_tick} size="sm" />
                </div>
                <p className="text-emerald-300 text-xs">
                  {profile?.business_type || "Business"}
                  {profile?.location ? ` · ${profile.location}` : ""}
                </p>
              </div>
            </div>
            <Link to="/settings" className="relative w-9 h-9 bg-emerald-800 rounded-full flex items-center justify-center">
              <Bell className="w-4 h-4 text-emerald-200" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full border border-emerald-900" />
            </Link>
          </div>

          {/* Overview metrics */}
          <div className="grid grid-cols-2 gap-2.5">
            {overviewMetrics.map((m) => (
              <div key={m.label} className={`${m.bg} ${m.border} border rounded-2xl px-3.5 py-3`}>
                <m.Icon className={`w-4 h-4 ${m.text}`} />
                <p className={`font-bold text-sm mt-1.5 ${m.text}`}>{m.value}</p>
                <p className="text-gray-500 text-[10px] font-medium mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary metrics strip */}
      <div className="bg-white border-b border-gray-100 px-5 py-3">
        <div className="flex gap-0 divide-x divide-gray-100">
          {secondaryMetrics.map((m) => (
            <div key={m.label} className="flex-1 text-center px-2">
              <p className="text-gray-900 font-bold text-base">{m.value}</p>
              <p className="text-gray-400 text-[10px] font-medium leading-tight">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border-b border-gray-100 px-5 py-4">
        <div className="grid grid-cols-6 gap-2">
          <Link to="/my-products" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-emerald-600 text-white rounded-2xl flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Add Product</span>
          </Link>
          <Link to="/my-services" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-600 text-white rounded-2xl flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Add Service</span>
          </Link>
          <Link to="/my-orders" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Orders</span>
          </Link>
          <Link to="/staffs" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Customers</span>
          </Link>
          <button
            onClick={() => setWithdrawOpen(true)}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <WalletIcon className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Withdraw</span>
          </button>
          <Link to="/feed" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <Rss className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Create Post</span>
          </Link>
        </div>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Revenue Analytics Preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-900 font-bold text-base">Revenue Overview</h2>
            <Link to="/transactions" className="text-emerald-600 text-sm font-medium">
              Full Analytics
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-gray-400 text-xs">
                  {new Date().toLocaleDateString("en-NG", { month: "long", year: "numeric" })}
                </p>
                <p className="text-gray-900 font-bold text-2xl leading-tight">{formatNgn(thisMonthTotal)}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {monthChangePct !== null ? (
                    <span className={`text-xs font-bold ${monthChangePct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {monthChangePct >= 0 ? "↑" : "↓"} {monthChangePct >= 0 ? "+" : ""}
                      {monthChangePct}%
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">No data for last month</span>
                  )}
                  {monthChangePct !== null && <span className="text-gray-400 text-xs">vs last month</span>}
                </div>
              </div>
              {bestSeller && (
                <div className="text-right">
                  <p className="text-gray-400 text-[11px]">Best seller</p>
                  <p className="text-gray-900 text-xs font-bold mt-0.5 max-w-[110px] truncate">{bestSeller.title}</p>
                  <p className="text-emerald-600 text-xs font-bold">{formatNgn(bestSeller.total)}</p>
                </div>
              )}
            </div>
            <Sparkline points={sparkPoints} />
            <p className="text-gray-400 text-[10px] text-center mt-1">Last 8 weeks</p>
          </div>
        </section>

        {/* Orders */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-gray-900 font-bold text-base">Orders</h2>
              {newProcessingCount > 0 && (
                <span className="w-5 h-5 bg-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {newProcessingCount}
                </span>
              )}
            </div>
            <Link to="/my-orders" className="text-emerald-600 text-sm font-medium">
              Manage
            </Link>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5">
            {(["all", "new", "processing", "completed"] as OrderFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setOrderFilter(f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  orderFilter === f ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">No orders here yet.</p>
          )}

          <div className="space-y-2.5">
            {filteredOrders.map((order) => {
              const meta = orderStatusMeta(order);
              const customer = customerMap.get(order.customer_id);
              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-xs">#{order.id.slice(0, 6)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                    </div>
                    <span className="text-gray-400 text-[11px]">{new Date(order.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-900 font-bold text-sm">{order.service_title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-gray-500 text-xs">{customer?.full_name || "Customer"}</p>
                    <p className="text-gray-900 font-bold text-sm">{formatNgn(order.amount)}</p>
                  </div>
                  {(meta.key === "new" || meta.key === "processing") && (
                    <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
                      <Link
                        to="/my-orders"
                        className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-1.5 rounded-xl text-center"
                      >
                        View Details
                      </Link>
                      <Link
                        to="/my-orders"
                        className="flex-1 bg-emerald-600 text-white text-xs font-semibold py-1.5 rounded-xl text-center"
                      >
                        {meta.key === "new" ? "Accept Order" : "Mark Shipped"}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Upcoming Bookings (service-type orders) */}
        {serviceBookings.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gray-900 font-bold text-base">Service Bookings</h2>
              <Link to="/my-bookings" className="text-emerald-600 text-sm font-medium">
                View all
              </Link>
            </div>
            <div className="space-y-2.5">
              {serviceBookings.slice(0, 5).map((booking) => {
                const customer = customerMap.get(booking.customer_id);
                const meta = orderStatusMeta(booking);
                return (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                      {customer?.avatar_url && (
                        <img src={customer.avatar_url} alt={customer.full_name ?? ""} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{customer?.full_name || "Customer"}</p>
                      <p className="text-gray-500 text-xs truncate">{booking.service_title}</p>
                      <p className="text-gray-400 text-[11px]">{new Date(booking.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-gray-900 font-bold text-sm">{formatNgn(booking.amount)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Growth Tips */}
        <section>
          <h2 className="text-gray-900 font-bold text-base mb-3">Grow Your Business</h2>
          <div className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-1">
            {growthTips.map((tip) => (
              <div key={tip.title} className="flex-shrink-0 w-44 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <tip.Icon className="w-5 h-5 text-emerald-600" />
                <p className="text-gray-900 font-bold text-sm mt-2 leading-tight">{tip.title}</p>
                <p className="text-gray-400 text-xs mt-1 leading-snug">{tip.desc}</p>
                <Link to="/settings" className="mt-3 text-emerald-600 text-xs font-bold block">
                  Get started →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="h-4" />
      </div>

      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} availableBalance={available} onSuccess={load} />
    </div>
  );
}
