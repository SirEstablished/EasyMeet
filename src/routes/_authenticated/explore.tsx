import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "@/components/ProfileCard";

export const Route = createFileRoute("/_authenticated/explore")({
  component: Explore,
});

type Filter = "all" | "professional" | "business" | "top" | "verified";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "professional", label: "Professionals" },
  { id: "business", label: "Businesses" },
  { id: "top", label: "Top Rated" },
  { id: "verified", label: "Verified" },
];

function Explore() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .in("role", ["professional", "business"])
      .order("avg_rating", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setProfiles((data as Profile[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return profiles.filter((p) => {
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
  }, [profiles, q, filter]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Explore</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Find verified professionals and businesses across Nigeria.
      </p>

      <div className="mt-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, username or service…"
          className="pl-9 h-11"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => setFilter(f.id)}
            className={filter === f.id ? "bg-gradient-brand" : ""}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No professionals found
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProfileCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}