import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  count?: number;
  size?: number;
  className?: string;
  showNumber?: boolean;
}

export function StarRating({ value, count, size = 16, className, showNumber = true }: Props) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="inline-flex">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i + 1 <= Math.round(v);
          return (
            <Star
              key={i}
              width={size}
              height={size}
              className={cn(filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
            />
          );
        })}
      </span>
      {showNumber && (
        <span className="text-xs text-muted-foreground">
          {v.toFixed(1)}
          {typeof count === "number" && ` (${count})`}
        </span>
      )}
    </span>
  );
}