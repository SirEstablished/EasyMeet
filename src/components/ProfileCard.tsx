import { Link } from "@tanstack/react-router";
import type { Profile } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationTicks } from "./VerificationTicks";
import { StarRating } from "./StarRating";
import { MapPin } from "lucide-react";
import { formatDistance } from "@/lib/geo";

export function ProfileCard({ p, distanceKm }: { p: Profile; distanceKm?: number }) {
  const displayName = p.username ? `@${p.username}` : (p.full_name || "Unnamed");
  const initials = (p.full_name || p.username || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const bioPreview = p.bio
    ? p.bio.length > 60 ? p.bio.slice(0, 60) + "..." : p.bio
    : null;
  return (
    <Link
      to="/profile/$id"
      params={{ id: p.id }}
      className="group rounded-2xl glass-card p-5 lift-hover hover:-translate-y-1.5 hover:border-primary/60 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
    >
      <div className="flex items-start gap-3">
        <span className="avatar-ring shrink-0">
          <Avatar className="h-16 w-16 border-2 border-background">
            <AvatarImage src={p.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold truncate group-hover:text-primary transition-colors">
              {displayName}
            </span>
            <VerificationTicks
              blue={p.blue_tick}
              white={p.white_tick}
              gold={p.gold_tick}
              size="sm"
            />
          </div>
          {p.username && p.full_name && (
            <div className="text-xs text-muted-foreground truncate">{p.full_name}</div>
          )}
          <div className="text-xs text-muted-foreground capitalize">{p.role}</div>
          {p.location && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {p.location}
            </div>
          )}
          {typeof distanceKm === "number" && (
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/15 text-accent border border-accent/30">
              {formatDistance(distanceKm)} away
            </span>
          )}
          {bioPreview && (
            <p className="text-xs text-foreground/80 mt-1.5 leading-snug">{bioPreview}</p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <StarRating value={p.avg_rating} count={p.review_count} />
      </div>
    </Link>
  );
}