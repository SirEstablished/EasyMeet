import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "@/components/ProfileCard";
import { getBrowserLocation, haversineKm } from "@/lib/geo";
import { toast } from "sonner";
import { useLiveData } from "@/hooks/use-live-data";

export const Route = createFileRoute("/_authenticated/explore")({
  component: Explore,
});

type Filter = "all" | "professional" | "business" | "top" | "verified" | "near";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "professional", label: "Professionals" },
  { id: "business", label: "Businesses" },
  { id: "top", label: "Top Rated" },
  { id: "verified", label: "Verified" },
  { id: "near", label: "Near Me" },
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-tri">Explore</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Find verified professionals and businesses across Nigeria.
      </p>

      <div className="mt-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, username or service…"
          className="search-pill pl-10"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => (f.id === "near" ? enableNearMe() : setFilter(f.id))}
            className={
              "px-4 py-1.5 text-sm font-semibold " +
              (filter === f.id ? "pill-active" : "pill-glass")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl glass-card border-dashed p-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-brand grid place-items-center text-white">
              <Search className="h-5 w-5" />
            </div>
            No professionals found
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(({ p, dist }) => (
              <ProfileCard key={p.id} p={p} distanceKm={dist ?? undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}