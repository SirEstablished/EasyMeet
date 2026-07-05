import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, LayoutGrid, User, Building2, Star, BadgeCheck, MapPin } from "lucide-react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ProfileCard } from "@/components/ProfileCard";
import { getBrowserLocation, haversineKm } from "@/lib/geo";
import { toast } from "sonner";
import { useLiveData } from "@/hooks/use-live-data";

export const Route = createFileRoute("/_authenticated/explore")({
  component: Explore,
});

type Filter = "all" | "professional" | "business" | "top" | "verified" | "near";

const filters: { id: Filter; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "all", label: "All", Icon: LayoutGrid },
  { id: "professional", label: "Pros", Icon: User },
  { id: "business", label: "Business", Icon: Building2 },
  { id: "top", label: "Top", Icon: Star },
  { id: "verified", label: "Verified", Icon: BadgeCheck },
  { id: "near", label: "Near Me", Icon: MapPin },
];

function Explore() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const enableNearMe = async () => {
    if (userCoords) {
      setFilter("near");
      return;
    }
    try {
      const coords = await getBrowserLocation();
      setUserCoords(coords);
      setFilter("near");
    } catch {
      toast.error("Couldn't get your location. Please allow location access.");
    }
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["professional", "business"])
      .order("avg_rating", { ascending: false });
    setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useLiveData(["profiles"], load);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = profiles.filter((p) => {
      if (filter === "professional" && p.role !== "professional") return false;
      if (filter === "business" && p.role !== "business") return false;
      if (filter === "top" && !p.gold_tick) return false;
      if (filter === "verified" && !(p.blue_tick || p.white_tick)) return false;
      if (!needle) return true;
      return (
        (p.full_name || "").toLowerCase().includes(needle) ||
        (p.username || "").toLowerCase().includes(needle) ||
        (p.bio || "").toLowerCase().includes(needle) ||
        (p.location || "").toLowerCase().includes(needle)
      );
    });
    if (filter === "near" && userCoords) {
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
    return list.map((p) => ({ p, dist: null as number | null }));
  }, [profiles, q, filter, userCoords]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-28 md:pb-10">
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Explore</h1>

      {/* Search */}
      <div className="mt-5 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search services, products, or professionals…"
          className="h-12 pl-11 pr-4 rounded-2xl bg-card border-border/60 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      {/* Category filter chips */}
      <div className="mt-6 -mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
        <div className="flex items-start gap-4 px-4 sm:px-0 min-w-max sm:min-w-0 sm:flex-wrap">
          {filters.map(({ id, label, Icon }) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => (id === "near" ? enableNearMe() : setFilter(id))}
                className="flex flex-col items-center gap-1.5 w-16 shrink-0"
              >
                <span
                  className={
                    "h-14 w-14 rounded-full grid place-items-center transition " +
                    (active
                      ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_color-mix(in_oklab,var(--primary)_65%,transparent)]"
                      : "bg-card border border-border/60 text-foreground/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-primary/30 hover:text-primary")
                  }
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={
                    "text-[11px] font-semibold " +
                    (active ? "text-primary" : "text-muted-foreground")
                  }
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results section */}
      <section className="mt-6 rounded-3xl bg-card border border-border/60 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-20px_rgba(15,23,42,0.15)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold tracking-tight">Top Professionals</h2>
          <span className="text-xs font-semibold text-muted-foreground">
            {loading ? "" : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 grid place-items-center text-primary">
              <Search className="h-5 w-5" />
            </div>
            No professionals found
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map(({ p, dist }) => (
              <ProfileCard key={p.id} p={p} distanceKm={dist ?? undefined} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}