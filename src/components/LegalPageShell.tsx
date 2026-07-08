import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function LegalPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 glass-panel">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <Logo />
          <Button asChild variant="ghost" size="sm">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Home</Link>
          </Button>
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-5 sm:px-8 lg:px-12 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">
          {title}
        </h1>
        <div className="h-1 w-16 rounded-full bg-primary mb-8" />
        <div className="prose prose-sm sm:prose-base max-w-none text-foreground/90 space-y-4 leading-relaxed">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}