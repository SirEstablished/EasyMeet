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
  website: string | null;
  cover_url: string | null;
  blue_tick: boolean;
  white_tick: boolean;
  gold_tick: boolean;
  avg_rating: number;
  review_count: number;
}

export interface Service {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  price_ngn: number;
  image_url: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}