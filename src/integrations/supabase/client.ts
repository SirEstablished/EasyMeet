import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ewegltvkmpbjmgsoihcq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3ZWdsdHZrbXBiam1nc29paGNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0Nzc2MjQsImV4cCI6MjA5NjA1MzYyNH0.XteQpi8xaO2IIpBrKEF2-MskTNcK3GYIB5o2UIP85uQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type AppRole = "customer" | "professional" | "business";

export interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  role: AppRole;
  email_notifications: boolean;
  in_app_notifications: boolean;
}