import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  blue?: boolean;
  white?: boolean;
  gold?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabels?: boolean;
}

const sizeMap = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};
const wrapMap = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function VerificationTicks({
  blue,
  white,
  gold,
  size = "md",
  className,
  showLabels = false,
}: Props) {
  if (!blue && !white && !gold) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
      {blue && (
        <span
          title="Verified Professional"
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-[#1d9bf0] text-white shadow-[0_0_10px_rgba(29,155,240,0.55)]",
            wrapMap[size],
          )}
        >
          <Check className={cn(sizeMap[size], "stroke-[3]")} />
          {showLabels && <span className="ml-1 text-xs">Verified Professional</span>}
        </span>
      )}
      {white && (
        <span
          title="Verified Organisation"
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-white text-slate-700 border border-slate-300 shadow-[0_0_10px_rgba(203,213,225,0.7)]",
            wrapMap[size],
          )}
        >
          <Check className={cn(sizeMap[size], "stroke-[3]")} />
        </span>
      )}
      {gold && (
        <span
          title="Top Rated"
          className={cn(
            "inline-flex items-center justify-center rounded-full text-white gold-shimmer shadow-[0_0_12px_rgba(245,193,74,0.7)]",
            wrapMap[size],
          )}
        >
          <Star className={cn(sizeMap[size], "fill-white")} />
        </span>
      )}
    </span>
  );
}