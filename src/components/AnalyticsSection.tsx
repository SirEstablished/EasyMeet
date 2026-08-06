import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { useLiveData } from "@/hooks/use-live-data";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  CheckCircle2,
  Users,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type OrderRow = {
  id: string;
  amount: number | null;
  payout_amount: number | null;
  service_title: string | null;
  service_id: string | null;
  customer_id: string | null;
  status: string | null;
  escrow_status: string | null;
  created_at: string;
};

type EscrowRow = { order_id: string; status: string | null };
type ReviewRow = { rating: number; created_at: string };

function isCompleted(o: OrderRow, escrowStatus: string | null) {
  const es = (escrowStatus || o.escrow_status || "").toLowerCase();
  const os = (o.status || "").toLowerCase();
  return es === "released" || es === "completed" || os === "completed";
}

function revenueOf(o: OrderRow): number {
  return Number(o.payout_amount ?? o.amount ?? 0) || 0;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function pctDelta(now: number, prev: number): number | null {
  if (prev <= 0) return now > 0 ? 100 : null;
  return ((now - prev) / prev) * 100;
}

function DeltaPill({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  const positive = invert ? value < 0 : value > 0;
  const negative = invert ? value > 0 : value < 0;
  const cls = positive
    ? "text-emerald-500 bg-emerald-500/10"
    : negative
      ? "text-rose-500 bg-rose-500/10"
      : "text-muted-foreground bg-muted";
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl glass-card p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <div className="text-lg sm:text-2xl font-extrabold tracking-tight text-gradient-brand truncate">
          {value}
        </div>
        {delta}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

export function AnalyticsSection() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [escrows, setEscrows] = useState<EscrowRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [trendMode, setTrendMode] = useState<"weekly" | "monthly">("weekly");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data: ords, error: oErr }, { data: revs, error: rErr }] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, amount, payout_amount, service_title, service_id, customer_id, status, escrow_status, created_at",
          )
          .eq("provider_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("rating, created_at")
          .eq("reviewed_id", user.id),
      ]);
      if (oErr) throw oErr;
      if (rErr) throw rErr;
      const rows = (ords ?? []) as OrderRow[];
      setOrders(rows);
      setReviews((revs ?? []) as ReviewRow[]);
      if (rows.length) {
        const { data: esc, error: eErr } = await supabase
          .from("escrow")
          .select("order_id, status")
          .in("order_id", rows.map((r) => r.id));
        if (eErr) throw eErr;
        setEscrows((esc ?? []) as EscrowRow[]);
      } else {
        setEscrows([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load analytics");
    } finally {
      setLoading(false);
      setFirstLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  useLiveData(user ? ["orders", "escrow", "reviews"] : [], load);

  const escrowMap = useMemo(
    () => new Map(escrows.map((e) => [e.order_id, e.status])),
    [escrows],
  );
  const completed = useMemo(
    () => orders.filter((o) => isCompleted(o, escrowMap.get(o.id) ?? null)),
    [orders, escrowMap],
  );

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const totalRevenue = completed.reduce((s, o) => s + revenueOf(o), 0);
  const thisMonthRev = completed
    .filter((o) => new Date(o.created_at) >= thisMonthStart)
    .reduce((s, o) => s + revenueOf(o), 0);
  const lastMonthRev = completed
    .filter((o) => {
      const d = new Date(o.created_at);
      return d >= lastMonthStart && d < thisMonthStart;
    })
    .reduce((s, o) => s + revenueOf(o), 0);
  const revDelta = pctDelta(thisMonthRev, lastMonthRev);

  const thisMonthCount = completed.filter(
    (o) => new Date(o.created_at) >= thisMonthStart,
  ).length;

  const repeatCustomers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of completed) {
      if (!o.customer_id) continue;
      counts.set(o.customer_id, (counts.get(o.customer_id) ?? 0) + 1);
    }
    let n = 0;
    counts.forEach((c) => {
      if (c >= 2) n++;
    });
    return n;
  }, [completed]);

  const ratingNow = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const arr = reviews.filter((r) => new Date(r.created_at) >= cutoff);
    if (!arr.length) return null;
    return arr.reduce((s, r) => s + Number(r.rating || 0), 0) / arr.length;
  }, [reviews]);
  const ratingPrev = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() - 30);
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const arr = reviews.filter((r) => {
      const d = new Date(r.created_at);
      return d >= start && d < end;
    });
    if (!arr.length) return null;
    return arr.reduce((s, r) => s + Number(r.rating || 0), 0) / arr.length;
  }, [reviews]);
  const ratingDelta =
    ratingNow !== null && ratingPrev !== null && ratingPrev > 0
      ? ((ratingNow - ratingPrev) / ratingPrev) * 100
      : null;

  const trendData = useMemo(() => {
    if (trendMode === "weekly") {
      const buckets: { key: string; label: string; count: number; start: Date }[] = [];
      const anchor = startOfWeek(now);
      for (let i = 11; i >= 0; i--) {
        const start = new Date(anchor);
        start.setDate(start.getDate() - i * 7);
        buckets.push({
          key: start.toISOString(),
          label: `${start.getMonth() + 1}/${start.getDate()}`,
          count: 0,
          start,
        });
      }
      const end = new Date(anchor);
      end.setDate(end.getDate() + 7);
      for (const o of completed) {
        const d = new Date(o.created_at);
        if (d < buckets[0].start || d >= end) continue;
        const idx = Math.floor((d.getTime() - buckets[0].start.getTime()) / (7 * 86400000));
        if (buckets[idx]) buckets[idx].count++;
      }
      return buckets.map(({ label, count }) => ({ label, count }));
    }
    const buckets: { key: string; label: string; count: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: monthNames[d.getMonth()],
        count: 0,
      });
    }
    for (const o of completed) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = buckets.find((x) => x.key === key);
      if (b) b.count++;
    }
    return buckets.map(({ label, count }) => ({ label, count }));
  }, [completed, trendMode, now]);

  const topServices = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number }>();
    for (const o of completed) {
      const key = o.service_id || o.service_title || "Untitled";
      const name = o.service_title || "Untitled service";
      const cur = map.get(key) ?? { name, revenue: 0 };
      cur.revenue += revenueOf(o);
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [completed]);

  if (loading && !firstLoaded) {
    return (
      <div className="rounded-2xl glass-card p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-lg sm:text-xl">Analytics</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Your performance at a glance.
          </p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="Total revenue"
          value={formatNgn(totalRevenue)}
        />
        <Tile
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="This month"
          value={formatNgn(thisMonthRev)}
          sub={`Last month: ${formatNgn(lastMonthRev)}`}
          delta={<DeltaPill value={revDelta} />}
        />
        <Tile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Completed"
          value={String(completed.length)}
          sub={`${thisMonthCount} this month`}
        />
        <Tile
          icon={<Users className="h-3.5 w-3.5" />}
          label="Repeat customers"
          value={String(repeatCustomers)}
        />
        <Tile
          icon={<Star className="h-3.5 w-3.5" />}
          label="Rating (30d)"
          value={ratingNow !== null ? ratingNow.toFixed(2) : "—"}
          sub={
            ratingPrev !== null
              ? `Prev 30d: ${ratingPrev.toFixed(2)}`
              : reviews.length === 0
                ? "No reviews yet"
                : "No reviews in prior period"
          }
          delta={<DeltaPill value={ratingDelta} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl glass-card p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm">Booking trends</h3>
              <p className="text-[11px] text-muted-foreground">
                Completed orders {trendMode === "weekly" ? "(last 12 weeks)" : "(last 12 months)"}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border p-0.5 shrink-0">
              <Button
                type="button"
                size="sm"
                variant={trendMode === "weekly" ? "default" : "ghost"}
                onClick={() => setTrendMode("weekly")}
                className="h-7 rounded-full px-3 text-[11px]"
              >
                Weekly
              </Button>
              <Button
                type="button"
                size="sm"
                variant={trendMode === "monthly" ? "default" : "ghost"}
                onClick={() => setTrendMode("monthly")}
                className="h-7 rounded-full px-3 text-[11px]"
              >
                Monthly
              </Button>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--primary) 10%, transparent)" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#6C47FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl glass-card p-4">
          <h3 className="font-semibold text-sm">Top performing services</h3>
          <p className="text-[11px] text-muted-foreground mb-3">By revenue</p>
          {topServices.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No completed sales yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {(() => {
                const max = Math.max(...topServices.map((s) => s.revenue), 1);
                return topServices.map((s) => (
                  <li key={s.name} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-medium truncate">{s.name}</span>
                      <span className="text-xs font-semibold whitespace-nowrap">
                        {formatNgn(s.revenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#6C47FF] to-[#00C896] transition-[width] duration-500"
                        style={{ width: `${Math.max(6, (s.revenue / max) * 100)}%` }}
                      />
                    </div>
                  </li>
                ));
              })()}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}