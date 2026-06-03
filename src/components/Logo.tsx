import { Link } from "@tanstack/react-router";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  asLink?: boolean;
  className?: string;
}

export function Logo({ size = "md", asLink = true, className = "" }: LogoProps) {
  const text =
    size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-xl";
  const dot = size === "sm" ? "h-2.5 w-2.5" : size === "lg" ? "h-4 w-4" : "h-3 w-3";
  const ring = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-10 w-10" : "h-8 w-8";

  const inner = (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <span
        className={`relative ${ring} rounded-full bg-secondary flex items-center justify-center`}
        aria-hidden
      >
        <span className={`absolute left-1 ${dot} rounded-full bg-primary`} />
        <span className={`absolute right-1 ${dot} rounded-full bg-accent`} />
      </span>
      <span className={`${text} tracking-tight text-foreground`}>EasyMeet</span>
    </span>
  );

  if (!asLink) return inner;
  return (
    <Link to="/" className="inline-flex items-center">
      {inner}
    </Link>
  );
}