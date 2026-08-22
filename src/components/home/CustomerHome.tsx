import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers";
import { supabase, formatNgn, type Profile, type Product } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/use-live-data";
import { VerificationTicks } from "@/components/VerificationTicks";
import { StarRating } from "@/components/StarRating";
import { Search, Lock, Package, Bell, ShieldCheck } from "lucide-react";

type CustomerOrder = {
  id: string;
  service_title: string;
  amount: number;
  status: string | null;
  escrow_status: string | null;
  kind: string | null;
  created_at: string;
  provider_id: string | null;
};

const quickActions = [
  { label: "Find a Pro", to: "/explore", Icon: Search, color: "bg-violet-50 text-violet-700" },
  { label: "Services", to: "/explore", Icon: ShieldCheck, color: "bg-amber-50 text-amber-700" },
  { label: "Shop", to: "/shop", Icon: Package, color: "bg-emerald-50 text-emerald-700" },
  { label: "My Orders", to: "/my-orders", Icon: Package, color: "bg-sky-50 text-sky-700" },
];

function activityLabel(order: CustomerOrder): { status: string; color: string; icon: typeof Lock } {
  const es = (order.escrow_status || "").toLowerCase();
  const os = (order.status || "").toLowerCase();
  if (es === "holding" || es === "pending_payment") {
    return { status: "In Escrow", color: "bg-amber-100 text-amber-700", icon: Lock };
  }
  if (os === "pending" || os === "confirmed") {
    return { status: "Processing", color: "bg-sky-100 text-sky-700", icon: Package };
  }
  return { status: os || "Active", color: "bg-gray-100 text-gray-700", icon: Package };
}

export default function CustomerHome() {
  const { user, profile } = useAuth();
  const name = profile?.full_name || user?.email?.split("@")[0] || "there";

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [topPros, setTopPros] = useState<Profile[]>([]);
  const [topBusinesses, setTopBusinesses] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [ordersRes, prosRes, bizRes, productsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, service_title, amount, status, escrow_status, kind, created_at, provider_id")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "professional")
        .eq("is_banned", false)
        .order("avg_rating", { ascending: false })
        .limit(6),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "business")
        .eq("is_banned", false)
        .order("avg_rating", { ascending: false })
        .limit(4),
      supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

    setOrders((ordersRes.data ?? []) as CustomerOrder[]);
    setTopPros((prosRes.data ?? []) as Profile[]);
    setTopBusinesses((bizRes.data ?? []) as Profile[]);
    setProducts((productsRes.data as Product[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveData(user ? ["orders", "products"] : [], load);

  return (
    <div className="bg-gray-50 min-h-full">
      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs">Welcome back</p>
            <p className="font-bold text-gray-900 text-lg">{name}</p>
          </div>
          <Link
            to="/settings"
            className="relative w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center"
          >
            <Bell className="w-4 h-4 text-gray-500" />
          </Link>
        </div>
        <Link
          to="/explore"
          className="mt-4 flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-3 text-gray-400 text-sm"
        >
          <Search className="w-4 h-4" />
          Find professionals, services, products...
        </Link>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${action.color}`}
            >
              <action.Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold text-center leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* Active Activity */}
        {orders.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-gray-900 font-bold text-base">Active Activity</h2>
                <span className="w-5 h-5 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {orders.length}
                </span>
              </div>
              <Link to="/my-orders" className="text-violet-600 text-sm font-medium">
                See all
              </Link>
            </div>
            <div className="space-y-2.5">
              {orders.map((order) => {
                const meta = activityLabel(order);
                return (
                  <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <meta.icon className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="font-bold text-gray-900 text-sm truncate pr-2">{order.service_title}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.color}`}>
                            {meta.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-gray-900 font-bold text-sm">{formatNgn(order.amount)}</span>
                          <Link
                            to="/my-orders"
                            className="text-violet-600 text-xs font-semibold border border-violet-200 px-3 py-1 rounded-xl"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recommended Professionals */}
        {topPros.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gray-900 font-bold text-base">Recommended for You</h2>
              <Link to="/explore" className="text-violet-600 text-sm font-medium">
                See all
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-1">
              {topPros.map((pro) => (
                <Link
                  key={pro.id}
                  to="/profile/$id"
                  params={{ id: pro.id }}
                  className="flex-shrink-0 w-44 bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm text-left active:scale-95 transition-transform"
                >
                  <div className="relative h-36 bg-gray-100">
                    {pro.avatar_url ? (
                      <img src={pro.avatar_url} alt={pro.full_name ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl font-bold">
                        {(pro.full_name ?? "?").charAt(0)}
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <VerificationTicks blue={pro.blue_tick} white={pro.white_tick} gold={pro.gold_tick} size="sm" />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-bold text-gray-900 text-sm truncate">{pro.full_name}</p>
                    <p className="text-gray-500 text-xs truncate mb-1.5">{pro.profession || "Professional"}</p>
                    <StarRating value={pro.avg_rating} count={pro.review_count} />
                    <p className="text-[10px] text-gray-400 mt-1.5 truncate">{pro.location || "Nigeria"}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Businesses Near You */}
        {topBusinesses.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gray-900 font-bold text-base">Businesses Near You</h2>
              <Link to="/explore" className="text-violet-600 text-sm font-medium">
                See all
              </Link>
            </div>
            <div className="space-y-3">
              {topBusinesses.map((biz) => (
                <Link
                  key={biz.id}
                  to="/profile/$id"
                  params={{ id: biz.id }}
                  className="w-full bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm text-left active:scale-[0.99] transition-transform block"
                >
                  <div className="h-32 bg-gray-100 relative overflow-hidden">
                    {biz.cover_url ? (
                      <img src={biz.cover_url} alt={biz.full_name ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-violet-50" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between">
                      <div>
                        <p className="text-white font-bold text-sm">{biz.full_name}</p>
                        <p className="text-white/75 text-[11px]">{biz.business_type || "Business"}</p>
                      </div>
                      <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Business
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-violet-100 bg-gray-100 flex-shrink-0">
                        {biz.avatar_url && <img src={biz.avatar_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <VerificationTicks blue={biz.blue_tick} white={biz.white_tick} gold={biz.gold_tick} size="sm" />
                          <StarRating value={biz.avg_rating} count={biz.review_count} />
                        </div>
                        <p className="text-gray-400 text-[11px]">{biz.location || "Nigeria"}</p>
                      </div>
                    </div>
                    <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl">
                      Visit
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured Products */}
        {products.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-gray-900 font-bold text-base">Featured Products</h2>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Shop
                </span>
              </div>
              <Link to="/shop" className="text-violet-600 text-sm font-medium">
                Browse
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {products.map((product) => (
                <Link
                  key={product.id}
                  to="/product/$id"
                  params={{ id: product.id }}
                  className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm text-left active:scale-95 transition-transform"
                >
                  <div className="h-32 bg-gray-100 relative overflow-hidden">
                    {product.image_urls?.[0] && (
                      <img src={product.image_urls[0]} alt={product.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-bold text-gray-900 text-xs leading-tight line-clamp-2">{product.title}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-violet-600 font-bold text-sm">{formatNgn(product.price)}</p>
                      {!!product.avg_rating && (
                        <span className="text-gray-600 text-[10px] font-semibold">★ {product.avg_rating.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty state for a brand-new customer */}
        {!loading && orders.length === 0 && topPros.length === 0 && topBusinesses.length === 0 && products.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-400 text-sm">Nothing here yet — start by exploring professionals and businesses.</p>
            <Link
              to="/explore"
              className="inline-block mt-3 bg-violet-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
            >
              Explore EasyMeet
            </Link>
          </div>
        )}

        {/* EasyMeet Promise */}
        <div className="bg-gradient-to-r from-violet-700 to-violet-500 rounded-2xl p-4 flex items-center gap-4">
          <ShieldCheck className="w-8 h-8 text-white flex-shrink-0" />
          <div>
            <p className="text-white font-bold text-sm">EasyMeet Promise</p>
            <p className="text-violet-200 text-xs mt-0.5 leading-snug">
              Pay safely. Funds held in escrow until you confirm your service is complete.
            </p>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
