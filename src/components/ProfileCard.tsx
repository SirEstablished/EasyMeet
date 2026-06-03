import { Link } from "@tanstack/react-router";
import type { Profile } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationTicks } from "./VerificationTicks";
import { StarRating } from "./StarRating";
import { MapPin } from "lucide-react";

export function ProfileCard({ p }: { p: Profile }) {
  const initials = (p.full_name || p.username || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Link
      to="/profile/$id"
      params={{ id: p.id }}
      className="group rounded-2xl border border-border bg-card p-5 hover:shadow-md hover:border-primary/40 transition-all"
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-14 w-14">
          <AvatarImage src={p.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold truncate group-hover:text-primary transition-colors">
              {p.full_name || p.username || "Unnamed"}
            </span>
            <VerificationTicks
              blue={p.blue_tick}
              white={p.white_tick}
              gold={p.gold_tick}
              size="sm"
            />
          </div>
          <div className="text-xs text-muted-foreground capitalize">{p.role}</div>
          {p.location && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {p.location}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3">
        <StarRating value={p.avg_rating} count={p.review_count} />
      </div>
    </Link>
  );
}