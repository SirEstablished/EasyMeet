import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { supabase, formatNgn, type Profile } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/use-live-data";
import { VerificationTicks } from "@/components/VerificationTicks";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { toast } from "sonner";
import {
  Plus,
  Briefcase,
  Wallet as WalletIcon,
  MessageCircle,
  Bell,
  Image,
  Zap,
  Megaphone,
  Award,
  Calendar,
  Rss,
} from "lucide-react";

type ProviderOrder = {
  id: string;
  customer_id: string;
  service_title: string;
  amount: number;
  payout_amount: number | null;
  status: string | null;
  escrow_status: string | null;
  created_at: string;
};

type JobTab = "new" | "active" | "completed";

const growthTips = [
  { Icon: Image, title: "Add portfolio photos", desc: "Profiles with photos get 3× more enquiries" },
  { Icon: Zap, title: "Respond within 2hrs", desc: "Fast replies increase job acceptance by 60%" },
  { Icon: Megaphone, title: "Post to Feed", desc: "Share your work and reach new customers" },
  { Icon: Award, title: "Request reviews", desc: "Ask completed clients for a review today" },
];

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function activeStatusMeta(job: ProviderOrder): { label: string; color: string } {
  const es = (job.escrow_status || "").toLowerCase();
  if (es === "in_progress") return { label: "In Progress", color: "bg-sky-100 text-sky-700" };
  if (es === "holding" || es === "pending_payment") return { label: "In Escrow", color: "bg-amber-100 text-amber-700" };
  return { label: "Confirmed", color: "bg-gray-100 text-gray-700" };
}

export default function ProfessionalHome() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<ProviderOrder[]>([]);
  const [customerMap, setCustomerMap] = useState<Map<string, Pick<Profile, "id" | "full_name" | "avatar_url">>>(
    new Map(),
  );
  const [available, setAvailableBalance] = useState(0);
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<JobTab>("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [respondedCount, setRespondedCount] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [walletRes, ordersRes] = await Promise.all([
      supabase
        .from("wallets" as never)
        .select("available_balance, escrow_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, customer_id, service_title, amount, payout_amount, status, escrow_status, created_at")
        .eq("provider_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    const w = walletRes.data as { available_balance?: number; escrow_balance?: number } | null;
    setAvailableBalance(Number(w?.available_balance ?? 0));
    setEscrowBalance(Number(w?.escrow_balance ?? 0));
    const orderRows = (ordersRes.data ?? []) as ProviderOrder[];
    setOrders(orderRows);

    const customerIds = [...new Set(orderRows.map((o) => o.customer_id).filter(Boolean))];
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", customerIds);
      setCustomerMap(new Map((customers ?? []).map((c) => [c.id, c as Pick<Profile, "id" | "full_name" | "avatar_url">])));
    }

    let accepted = 0;
    let responded = 0;
    for (const o of orderRows) {
      const os = (o.status || "").toLowerCase();
      if (os === "confirmed" || os === "completed" || os === "cancelled") {
        responded++;
        if (os !== "cancelled") accepted++;
      }
    }
    setAcceptedCount(accepted);
    setRespondedCount(responded);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveData(user ? ["orders", "wallets"] : [], load);

  const { newJobs, activeJobs, completedJobs, pendingAmount, lifetimeEarnings } = useMemo(() => {
    const newJ: ProviderOrder[] = [];
    const activeJ: ProviderOrder[] = [];
    const doneJ: ProviderOrder[] = [];
    let pending = 0;
    let lifetime = 0;
    for (const o of orders) {
      const es = (o.escrow_status || "").toLowerCase();
      const os = (o.status || "").toLowerCase();
      const isCompleted = es === "released" || es === "completed" || os === "completed";
      const isActive = es === "holding" || es === "in_progress" || es === "pending_payment" || os === "confirmed";
      const isNew = os === "pending" && !isActive && !isCompleted;
      if (isCompleted) {
        doneJ.push(o);
        lifetime += Number(o.payout_amount ?? o.amount ?? 0) || 0;
      } else if (isActive) activeJ.push(o);
      else if (isNew) {
        newJ.push(o);
        pending += Number(o.amount ?? 0) || 0;
      }
    }
    return { newJobs: newJ, activeJobs: activeJ, completedJobs: doneJ, pendingAmount: pending, lifetimeEarnings: lifetime };
  }, [orders]);

  const tabCounts = { new: newJobs.length, active: activeJobs.length, completed: completedJobs.length };
  const acceptanceRate = respondedCount > 0 ? Math.round((acceptedCount / respondedCount) * 100) : null;

  const updateStatus = async (orderId: string, status: string) => {
    setBusyId(orderId);
    const { error } = await supabase.from("orders").update({ status } as never).eq("id", orderId);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(status === "confirmed" ? "Job accepted" : "Job declined");
    void load();
  };

  const name = profile?.full_name || user?.email?.split("@")[0] || "there";

  return (
    <div className="bg-gray-50 min-h-full pb-28 md:pb-10">
      {/* Header */}
      <div className="bg-indigo-900 px-5 pt-6 pb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-56 h-56 bg-indigo-800 rounded-full -translate-y-1/3 translate-x-1/4 opacity-50 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-indigo-700 bg-indigo-800">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-indigo-900 ${
                    isAvailable ? "bg-emerald-400" : "bg-gray-400"
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-white font-bold text-lg leading-tight">{name}</h1>
                  <VerificationTicks blue={profile?.blue_tick} white={profile?.white_tick} gold={profile?.gold_tick} size="sm" />
                </div>
                <p className="text-indigo-300 text-sm">{profile?.profession || "Professional"}</p>
              </div>
            </div>
            <Link to="/settings" className="relative w-9 h-9 bg-indigo-800 rounded-full flex items-center justify-center">
              <Bell className="w-4 h-4 text-indigo-200" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full border border-indigo-900" />
            </Link>
          </div>

          {/* Availability toggle */}
          <button
            onClick={() => setIsAvailable((v) => !v)}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border transition-all ${
              isAvailable
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                : "bg-gray-700/30 border-gray-600/30 text-gray-400"
            }`}
          >
            <span
              className={`w-9 h-5 rounded-full flex items-center transition-all relative ${
                isAvailable ? "bg-emerald-500" : "bg-gray-600"
              }`}
            >
              <span
                className={`w-4 h-4 bg-white rounded-full absolute transition-all shadow-sm ${
                  isAvailable ? "left-[22px]" : "left-0.5"
                }`}
              />
            </span>
            <span className="text-sm font-semibold">{isAvailable ? "Available for new jobs" : "Not available"}</span>
          </button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="px-5 -mt-2 pt-4">
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-3 py-3.5">
            <WalletIcon className="w-4 h-4 text-emerald-600" />
            <p className="font-bold text-sm mt-1.5 text-emerald-700">{formatNgn(available)}</p>
            <p className="text-gray-500 text-[10px] font-medium mt-0.5">Available</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-3.5">
            <Briefcase className="w-4 h-4 text-amber-600" />
            <p className="font-bold text-sm mt-1.5 text-amber-700">{formatNgn(escrowBalance)}</p>
            <p className="text-gray-500 text-[10px] font-medium mt-0.5">In Escrow</p>
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-2xl px-3 py-3.5">
            <Briefcase className="w-4 h-4 text-violet-600" />
            <p className="font-bold text-sm mt-1.5 text-violet-700">{formatNgn(pendingAmount)}</p>
            <p className="text-gray-500 text-[10px] font-medium mt-0.5">Pending</p>
          </div>
        </div>

        {/* Lifetime stat */}
        <div className="bg-indigo-900 rounded-2xl px-4 py-3.5 flex items-center justify-between mb-4">
          <div>
            <p className="text-indigo-300 text-xs font-medium">Lifetime Earnings</p>
            <p className="text-white font-bold text-xl mt-0.5">{formatNgn(lifetimeEarnings)}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-amber-400 text-sm">★</span>
              <span className="text-white font-bold text-sm">{(profile?.avg_rating ?? 0).toFixed(1)}</span>
              <span className="text-indigo-300 text-xs">/ 5.0</span>
            </div>
            <p className="text-indigo-300 text-xs mt-0.5">{profile?.review_count ?? 0} reviews</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border-y border-gray-100 px-5 py-4">
        <div className="grid grid-cols-6 gap-2">
          <Link to="/my-services" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-600 text-white rounded-2xl flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Add Service</span>
          </Link>
          <Link to="/my-orders" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">My Jobs</span>
          </Link>
          <button
            onClick={() => setIsAvailable((v) => !v)}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Availability</span>
          </button>
          <button
            onClick={() => setWithdrawOpen(true)}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center">
              <WalletIcon className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Withdraw</span>
          </button>
          <Link to="/messages" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Messages</span>
          </Link>
          <Link to="/feed" className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <div className="w-11 h-11 bg-violet-50 text-violet-700 rounded-2xl flex items-center justify-center">
              <Rss className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight">Post to Feed</span>
          </Link>
        </div>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Jobs Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-900 font-bold text-base">Jobs</h2>
            <Link to="/my-orders" className="text-indigo-600 text-sm font-medium">
              View all
            </Link>
          </div>

          <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-4">
            {(["new", "active", "completed"] as JobTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all relative ${
                  activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tabCounts[tab] > 0 && activeTab !== tab && (
                  <span className="ml-1 bg-indigo-600 text-white text-[9px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {tabCounts[tab]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tabCounts[activeTab] === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">No {activeTab} jobs right now.</p>
          )}

          {activeTab === "new" && (
            <div className="space-y-3">
              {newJobs.map((job) => {
                const customer = customerMap.get(job.customer_id);
                return (
                  <div key={job.id} className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-indigo-100 bg-gray-100 flex-shrink-0">
                        {customer?.avatar_url && (
                          <img src={customer.avatar_url} alt={customer.full_name ?? ""} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-gray-900 text-sm">{customer?.full_name || "Customer"}</p>
                          <span className="text-gray-400 text-[11px]">{timeAgo(job.created_at)}</span>
                        </div>
                        <p className="text-gray-600 text-xs">{job.service_title}</p>
                        <p className="text-gray-400 text-[11px] mt-0.5">
                          {new Date(job.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-indigo-700 font-bold text-base">{formatNgn(job.amount)}</p>
                      <div className="flex gap-2">
                        <button
                          disabled={busyId === job.id}
                          onClick={() => updateStatus(job.id, "cancelled")}
                          className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          disabled={busyId === job.id}
                          onClick={() => updateStatus(job.id, "confirmed")}
                          className="bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-xl disabled:opacity-50"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "active" && (
            <div className="space-y-3">
              {activeJobs.map((job) => {
                const customer = customerMap.get(job.customer_id);
                const meta = activeStatusMeta(job);
                return (
                  <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-100 bg-gray-100 flex-shrink-0">
                        {customer?.avatar_url && (
                          <img src={customer.avatar_url} alt={customer.full_name ?? ""} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="font-bold text-gray-900 text-sm">{customer?.full_name || "Customer"}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                        </div>
                        <p className="text-gray-600 text-xs">{job.service_title}</p>
                        <p className="text-gray-400 text-[11px] mt-0.5">
                          {new Date(job.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                      <p className="text-gray-900 font-bold text-sm">
                        {formatNgn(job.amount)} <span className="text-amber-600 font-medium text-xs">· {meta.label}</span>
                      </p>
                      <Link to="/my-orders" className="bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-xl">
                        Mark Done
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "completed" && (
            <div className="space-y-3">
              {completedJobs.map((job) => {
                const customer = customerMap.get(job.customer_id);
                return (
                  <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                      {customer?.avatar_url && (
                        <img src={customer.avatar_url} alt={customer.full_name ?? ""} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{customer?.full_name || "Customer"}</p>
                      <p className="text-gray-500 text-xs">{job.service_title}</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">
                        Completed · {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-emerald-600 font-bold text-sm">{formatNgn(job.payout_amount ?? job.amount)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Performance */}
        <section>
          <h2 className="text-gray-900 font-bold text-base mb-3">My Performance</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
              <div className="px-4 py-3.5">
                <p className="text-gray-400 text-[11px] font-medium">Profile Views</p>
                <p className="text-gray-900 font-bold text-xl mt-0.5">—</p>
                <p className="text-gray-400 text-[10px]">not tracked yet</p>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-gray-400 text-[11px] font-medium">Service Views</p>
                <p className="text-gray-900 font-bold text-xl mt-0.5">—</p>
                <p className="text-gray-400 text-[10px]">not tracked yet</p>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-gray-400 text-[11px] font-medium">Acceptance Rate</p>
                <p className="text-gray-900 font-bold text-xl mt-0.5">{acceptanceRate !== null ? `${acceptanceRate}%` : "—"}</p>
                <p className="text-gray-400 text-[10px]">of job requests</p>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-gray-400 text-[11px] font-medium">Avg. Response</p>
                <p className="text-gray-900 font-bold text-xl mt-0.5">—</p>
                <p className="text-gray-400 text-[10px]">not tracked yet</p>
              </div>
            </div>
          </div>
        </section>

        {/* Growth Tips */}
        <section>
          <h2 className="text-gray-900 font-bold text-base mb-3">Grow Your Profile</h2>
          <div className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-1">
            {growthTips.map((tip) => (
              <div key={tip.title} className="flex-shrink-0 w-44 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <tip.Icon className="w-5 h-5 text-indigo-600" />
                <p className="text-gray-900 font-bold text-sm mt-2 leading-tight">{tip.title}</p>
                <p className="text-gray-400 text-xs mt-1 leading-snug">{tip.desc}</p>
                <Link to="/settings" className="mt-3 text-indigo-600 text-xs font-bold block">
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
