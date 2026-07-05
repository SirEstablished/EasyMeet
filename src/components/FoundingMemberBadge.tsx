import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  active?: boolean | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};
const padMap = {
  sm: "px-1.5 py-0.5 text-[10px] gap-0.5",
  md: "px-2 py-0.5 text-[11px] gap-1",
  lg: "px-2.5 py-1 text-xs gap-1",
};

/**
 * Permanent badge shown next to a user's name when
 * `profiles.is_founding_member = true`. This badge is intentionally
 * read-only from the client — users cannot remove it. Only an admin
 * flipping the DB flag (or the account being deleted) can hide it.
 */
export function FoundingMemberBadge({
  active,
  size = "sm",
  showLabel = false,
  className,
}: Props) {
  if (!active) return null;
  return (
    <span
      title="Founding Member"
      aria-label="Founding Member"
      className={cn(
        "inline-flex items-center align-middle rounded-full font-semibold text-amber-950 border border-amber-300/70 shadow-[0_0_10px_rgba(245,193,74,0.45)]",
        "bg-gradient-to-br from-amber-200 via-yellow-300 to-amber-500",
        padMap[size],
        className,
      )}
    >
      <Crown className={cn(sizeMap[size], "fill-amber-100")} strokeWidth={2.25} />
      {showLabel && <span className="leading-none">Founding Member</span>}
    </span>
  );
}
