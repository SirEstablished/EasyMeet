import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, MapPin, Star, Sparkles } from "lucide-react";
import { supabase, formatNgn, SERVICE_CATEGORIES, type Profile } from "@/integrations/supabase/client";
import { ProfileCard } from "@/components/ProfileCard";
import { getBrowserLocation, haversineKm } from "@/lib/geo";
import { toast } from "sonner";
import { useLiveData } from "@/hooks/use-live-data";

export const Route = createFileRoute("/_authenticated/explore")({
  component: Explore,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
});

type QuickFilter = "all" | "services" | "products" | "businesses" | "verified";

const quickFilters: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "services", label: "Services" },
  { id: "products", label: "Products" },
  { id: "businesses", label: "Businesses" },
  { id: "verified", label: "Verified" },
];

const categoryStyles: Record<string, { color: string; text: string }> = {
  Technology: { color: "bg-sky-100", text: "text-sky-700" },
  Design: { color: "bg-violet-100", text: "text-violet-700" },
  "Food & Catering": { color: "bg-yellow-100", text: "text-yellow-700" },
  "Beauty & Wellness": { color: "bg-pink-100", text: "text-pink-700" },
  Education: { color: "bg-green-100", text: "text-green-700" },
  Legal: { color: "bg-indigo-100", text: "text-indigo-700" },
  Finance: { color: "bg-emerald-100", text: "text-emerald-700" },
  Construction: { color: "bg-orange-100", text: "text-orange-700" },
  Events: { color: "bg-rose-100", text: "text-rose-700" },
  Other: { color: "bg-gray-100", text: "text-gray-700" },
};

type RecentService = {
  id: string;
  title: string;
  price: number | null;
  provider_id: string;
  created_at: string;
};

function Explore() {
  const { q: initialQ } = Route.useSearch();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recentServices, setRecentServices] = useState<RecentService[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map());
  const [providerMap, setProviderMap] = useState<Map<string, Pick<Profile, "id" | "full_name" | "username" | "avatar_url">>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearMeActive, setNearMeActive] = useState(false);

  const enableNearMe = async () => {
    if (userCoords) {
      setNearMeActive(true);
      return;
    }
    try {
      const coords = await getBrowserLocation();
      setUserCoords(coords);
      setNearMeActive(true);
    } catch {
      toast.error("Couldn't get your location. Please allow location access.");
    }
  };

  const load = useCallback(async () => {
    const [profilesRes, servicesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["professional", "business"])
        .order("avg_rating", { ascending: false }),
      supabase
        .from("services")
        .select("id, title, price, provider_id, category, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
    ]);
    setProfiles((profilesRes.data as Profile[]) ?? []);

    const services = (servicesRes.data ?? []) as (RecentService & { category: string | null })[];
    setRecentServices(services.slice(0, 5));

    const counts = new Map<string, number>();
    for (const s of services) {
      const key = s.category || "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    setCategoryCounts(counts);

    const providerIds = [...new Set(services.map((s) => s.provider_id))];
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", providerIds);
      setProviderMap(
        new Map((providers ?? []).map((p) => [p.id, p as Pick<Profile, "id" | "full_name" | "username" | "avatar_url">])),
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useLiveData(["profiles", "services"], load);

  const isBrowsing = !q.trim() && quickFilter === "all" && !category;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = profiles.filter((p) => {
      if (quickFilter === "services" && p.offers_services === false) return false;
      if (quickFilter === "products" && !p.sells_products) return false;
      if (quickFilter === "businesses" && p.role !== "business") return false;
      if (quickFilter === "verified" && !(p.blue_tick || p.white_tick || p.gold_tick)) return false;
      if (category && (p.profession || "") !== category) return false;
      if (!needle) return true;
      return (
        (p.full_name || "").toLowerCase().includes(needle) ||
        (p.username || "").toLowerCase().includes(needle) ||
        (p.bio || "").toLowerCase().includes(needle) ||
        (p.location || "").toLowerCase().includes(needle)
      );
    });
    if (nearMeActive && userCoords) {
      const withDist = list.map((p) => {
        const lat = p.latitude == null ? null : Number(p.latitude);
        const lng = p.longitude == null ? null : Number(p.longitude);
        const dist =
          lat != null && lng != null && !isNaN(lat) && !isNaN(lng)
            ? haversineKm(userCoords, { lat, lng })
            : null;
        return { p, dist };
      });
      withDist.sort((a, b) => {
        if (a.dist == null && b.dist == null) return 0;
        if (a.dist == null) return 1;
        if (b.dist == null) return -1;
        return a.dist - b.dist;
      });
      return withDist;
    }
    return list
      .slice()
      .sort((a, b) => (b.gold_tick ? 1 : 0) - (a.gold_tick ? 1 : 0))
      .map((p) => ({ p, dist: null as number | null }));
  }, [profiles, q, quickFilter, category, nearMeActive, userCoords]);

  const featured = useMemo(
    () => profiles.filter((p) => p.cover_url || p.avatar_url).slice(0, 3),
    [profiles],
  );

  return (
    <div className="bg-white min-h-full pb-28 md:pb-10">
      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-4 sticky top-0 z-10 border-b border-gray-100">
        <h1 className="text-gray-900 font-bold text-xl mb-3">Explore</h1>
        <div className="flex items-center gap-3 bg-gray-100 rounded-2xl px-4 py-3">
          <Search className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Services, professionals, products..."
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-gray-400 flex-shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={enableNearMe}
            className={`flex-shrink-0 p-1 rounded-full ${nearMeActive ? "text-violet-600" : "text-gray-400"}`}
            title="Near me"
          >
            <MapPin className="h-4 w-4" />
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5">
          {quickFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setQuickFilter(f.id);
                setCategory(null);
              }}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                quickFilter === f.id ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isBrowsing ? (
        <div className="px-5 py-5 space-y-7">
          {/* Category Grid */}
          <section>
            <h2 className="text-gray-900 font-bold text-base mb-3">Browse by Category</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {SERVICE_CATEGORIES.map((cat) => {
                const style = categoryStyles[cat] ?? categoryStyles.Other;
                const count = categoryCounts.get(cat) ?? 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3.5 text-left shadow-sm active:scale-95 transition-transform"
                  >
                    <span className={`w-10 h-10 ${style.color} ${style.text} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm leading-tight truncate">{cat}</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">{count} service{count === 1 ? "" : "s"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recently Added Services */}
          {recentServices.length > 0 && (
            <section>
              <h2 className="text-gray-900 font-bold text-base mb-3">Recently Added</h2>
              <div className="space-y-0 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
                {recentServices.map((s, i) => {
                  const provider = providerMap.get(s.provider_id);
                  return (
                    <Link
                      key={s.id}
                      to="/profile/$id"
                      params={{ id: s.provider_id }}
                      className="flex items-center justify-between px-4 py-3 w-full text-left hover:bg-violet-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-gray-300 font-bold text-sm w-5 flex-shrink-0">#{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-gray-800 text-sm font-medium truncate">{s.title}</p>
                          <p className="text-gray-400 text-[11px] truncate">
                            {provider?.full_name || "Provider"}
                          </p>
                        </div>
                      </div>
                      {s.price != null && (
                        <span className="text-gray-500 text-xs flex-shrink-0">{formatNgn(s.price)}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Featured Providers */}
          {featured.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-gray-900 font-bold text-base">Featured Providers</h2>
                <button onClick={() => setQuickFilter("all")} className="text-violet-600 text-sm font-medium">
                  See all
                </button>
              </div>
              <div className="space-y-3">
                {featured.map((f) => (
                  <Link
                    key={f.id}
                    to="/profile/$id"
                    params={{ id: f.id }}
                    className="w-full bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm text-left active:scale-[0.99] transition-transform block"
                  >
                    <div className="h-40 bg-gray-100 relative overflow-hidden">
                      {f.cover_url ? (
                        <img src={f.cover_url} alt={f.full_name ?? ""} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-violet-50" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                        <div className="min-w-0">
                          <p className="text-white font-bold text-base leading-tight truncate">{f.full_name}</p>
                          <p className="text-white/80 text-xs truncate">
                            {f.profession || f.business_type || "Provider"}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${
                            f.role === "business" ? "bg-amber-400 text-amber-900" : "bg-violet-600 text-white"
                          }`}
                        >
                          {f.role === "business" ? "Business" : "Professional"}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-violet-100 bg-gray-100 flex-shrink-0">
                          {f.avatar_url && <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-gray-800 text-xs font-bold">{(f.avg_rating ?? 0).toFixed(1)}</span>
                            <span className="text-gray-400 text-xs">· {f.review_count ?? 0} reviews</span>
                          </div>
                          <p className="text-gray-400 text-xs truncate">{f.location || "Nigeria"}</p>
                        </div>
                      </div>
                      <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0">
                        View
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* Search / filter results */
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-900 font-bold text-base">
              {category ? category : "Results"}
            </h2>
            <div className="flex items-center gap-2">
              {category && (
                <button
                  onClick={() => setCategory(null)}
                  className="text-violet-600 text-xs font-semibold flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
              <span className="text-gray-400 text-xs font-semibold">
                {loading ? "" : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-violet-50 grid place-items-center text-violet-600">
                <Search className="h-5 w-5" />
              </div>
              Nothing found
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filtered.map(({ p, dist }) => (
                <ProfileCard key={p.id} p={p} distanceKm={dist ?? undefined} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
