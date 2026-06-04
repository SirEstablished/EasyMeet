import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="hidden md:flex fixed bottom-6 right-6 z-40 h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground glow-primary hover:scale-110 transition-transform animate-fade-in"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}