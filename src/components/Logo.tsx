import { Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  asLink?: boolean;
  className?: string;
}

export function Logo({ size = "md", asLink = true, className = "" }: LogoProps) {
  const text =
    size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-xl";
  const iconSize = size === "sm" ? 20 : size === "lg" ? 32 : 24;
  const ring = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";

  const inner = (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <span
        className={`${ring} rounded-xl bg-[#6C47FF]/10 flex items-center justify-center shrink-0`}
        aria-hidden
      >
        <Handshake size={iconSize} strokeWidth={2.2} color="#6C47FF" />
      </span>
      <span className={`${text} tracking-tight text-[#6C47FF]`}>EasyMeet</span>
    </span>
  );

  if (!asLink) return inner;
  return (
    <Link to="/" className="inline-flex items-center">
      {inner}
    </Link>
  );
}