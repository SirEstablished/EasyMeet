import { Logo } from "@/components/Logo";
import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-12 grid gap-8 md:grid-cols-3">
        <div>
          <Logo />
          <p className="text-sm text-muted-foreground mt-3 max-w-xs">
            Nigeria's trusted marketplace connecting customers with verified local professionals.
          </p>
        </div>
        <div className="text-sm">
          <div className="font-semibold mb-3">Company</div>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/about" className="hover:text-foreground">About</Link></li>
            <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="font-semibold mb-3">Contact</div>
          <a
            href="mailto:easymeetofficial@gmail.com"
            className="text-muted-foreground hover:text-foreground"
          >
            easymeetofficial@gmail.com
          </a>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} EasyMeet. All rights reserved.
        </div>
      </div>
    </footer>
  );
}