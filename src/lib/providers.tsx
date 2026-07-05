import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, type Profile } from "@/integrations/supabase/client";

/* ---------------- Theme ---------------- */
type Theme = "light" | "dark";
interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}
const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Dark is the default; users can switch and the preference persists.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("em-theme") as Theme | null;
      if (stored === "light" || stored === "dark") setThemeState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("em-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: setThemeState,
        toggle: () => setThemeState((t) => (t === "light" ? "dark" : "light")),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const c = useContext(ThemeContext);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}

/* ---------------- Auth ---------------- */
interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    let profileRow = (data as Profile) ?? null;

    // Backfill signup metadata into the profile if missing
    // (covers email-confirm flow where the upsert at signup couldn't run).
    try {
      const { data: userData } = await supabase.auth.getUser();
      const meta = (userData.user?.user_metadata ?? {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (profileRow) {
        if (!profileRow.full_name && typeof meta.full_name === "string")
          updates.full_name = meta.full_name;
        if (!profileRow.profession && typeof meta.profession === "string")
          updates.profession = meta.profession;
        if (!profileRow.business_type && typeof meta.business_type === "string")
          updates.business_type = meta.business_type;
        if (
          (profileRow.sells_products === undefined || profileRow.sells_products === null) &&
          typeof meta.sells_products === "boolean"
        )
          updates.sells_products = meta.sells_products;
        if (
          (profileRow.offers_services === undefined || profileRow.offers_services === null) &&
          typeof meta.offers_services === "boolean"
        )
          updates.offers_services = meta.offers_services;
        if (meta.role && profileRow.role !== meta.role) updates.role = meta.role;
      } else {
        // No row yet — create one from metadata
        updates.id = uid;
        if (typeof meta.full_name === "string") updates.full_name = meta.full_name;
        if (typeof meta.role === "string") updates.role = meta.role;
        if (typeof meta.profession === "string") updates.profession = meta.profession;
        if (typeof meta.business_type === "string") updates.business_type = meta.business_type;
        if (typeof meta.sells_products === "boolean") updates.sells_products = meta.sells_products;
        if (typeof meta.offers_services === "boolean") updates.offers_services = meta.offers_services;

        // Google OAuth users are always customers — auto-provision profile
        // so they never see the role-selection screen.
        const appMeta = (userData.user?.app_metadata ?? {}) as Record<string, unknown>;
        const provider = (appMeta.provider as string | undefined) ?? "";
        const providers = (appMeta.providers as string[] | undefined) ?? [];
        const isGoogle = provider === "google" || providers.includes("google");
        if (isGoogle) {
          if (!updates.role) updates.role = "customer";
          if (!updates.full_name) {
            const gName =
              (meta.full_name as string | undefined) ||
              (meta.name as string | undefined) ||
              (userData.user?.email ?? "");
            if (gName) updates.full_name = gName;
          }
        }
      }
      if (Object.keys(updates).length > (profileRow ? 0 : 1)) {
        if (profileRow) {
          const { data: updated } = await supabase
            .from("profiles")
            .update(updates)
            .eq("id", uid)
            .select("*")
            .maybeSingle();
          if (updated) profileRow = updated as Profile;
        } else {
          const { data: inserted } = await supabase
            .from("profiles")
            .upsert(updates, { onConflict: "id" })
            .select("*")
            .maybeSingle();
          if (inserted) profileRow = inserted as Profile;
        }
      }
    } catch {
      // Non-fatal — fall through with whatever we have.
    }

    setProfile(profileRow);
    setProfileLoading(false);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id);
      else setProfileLoading(false);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        profileLoading,
        refreshProfile: async () => {
          if (user) await loadProfile(user.id);
        },
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

/* ---------------- Auth modal control ---------------- */
interface AuthModalCtx {
  open: boolean;
  mode: "login" | "signup";
  openModal: (mode?: "login" | "signup") => void;
  close: () => void;
  setMode: (m: "login" | "signup") => void;
}
const AuthModalContext = createContext<AuthModalCtx | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  return (
    <AuthModalContext.Provider
      value={{
        open,
        mode,
        openModal: (m = "signup") => {
          setMode(m);
          setOpen(true);
        },
        close: () => setOpen(false),
        setMode,
      }}
    >
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const c = useContext(AuthModalContext);
  if (!c) throw new Error("useAuthModal must be used inside AuthModalProvider");
  return c;
}