import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, useAuthModal } from "@/lib/providers";
import { AppNavbar } from "@/components/AppNavbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { BackToTop } from "@/components/BackToTop";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  const { user, profile, loading, profileLoading } = useAuth();
  const { openModal } = useAuthModal();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/" });
      openModal("login");
    }
  }, [loading, user, navigate, openModal]);

  useEffect(() => {
    if (!loading && !profileLoading && user && !profile?.role && location.pathname !== "/select-role") {
      navigate({ to: "/select-role" });
    }
  }, [loading, profileLoading, user, profile, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="hidden md:block">
        <AppNavbar />
      </div>
      <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <MobileBottomNav />
      <BackToTop />
    </div>
  );
}