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
  profession?: string | null;
  business_type?: string | null;
  sells_products?: boolean;
  offers_services?: boolean;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_banned?: boolean;
}

export interface Service {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  created_at: string;
  category?: string | null;
  is_active?: boolean;
  provider?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url" | "role" | "blue_tick" | "white_tick" | "gold_tick"> | null;
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
  body: string | null;
  content?: string | null;
  image_url?: string | null;
  media_urls: string[] | null;
  media_type: "image" | "video" | null;
  is_boosted: boolean;
  boost_until: string | null;
  created_at: string;
  author?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url" | "role" | "blue_tick" | "white_tick" | "gold_tick"> | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
}

export interface Conversation {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string | null;
  created_at: string;
  other?: Profile | null;
  last_message?: Message | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed";

export interface Order {
  id: string;
  customer_id: string;
  provider_id: string;
  service_id: string | null;
  product_id?: string | null;
  kind?: "service" | "product";
  service_title: string;
  amount: number;
  notes: string | null;
  payment_ref: string | null;
  payment_status: PaymentStatus;
  status: OrderStatus;
  created_at: string;
  customer?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
  provider?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url"> | null;
}

export const SERVICE_CATEGORIES = [
  "Technology",
  "Design",
  "Food & Catering",
  "Beauty & Wellness",
  "Education",
  "Legal",
  "Finance",
  "Construction",
  "Events",
  "Other",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const PRODUCT_CATEGORIES = [
  "Fashion & Clothing",
  "Electronics & Gadgets",
  "Beauty & Cosmetics",
  "Food & Groceries",
  "Home & Living",
  "Health & Wellness",
  "Books & Stationery",
  "Digital Downloads",
  "Art & Crafts",
  "Other",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PROFESSIONS = [
  "Plumber",
  "Electrician",
  "Carpenter",
  "Painter",
  "Tailor/Fashion Designer",
  "Graphic Designer",
  "Web/App Developer",
  "Photographer",
  "Videographer",
  "Chef/Cook",
  "Teacher/Tutor",
  "Lawyer",
  "Accountant",
  "Doctor/Healthcare",
  "Fitness Trainer",
  "Hair Stylist",
  "Makeup Artist",
  "Event Planner",
  "Security Guard",
  "Cleaner",
  "Driver/Logistics",
  "Other",
] as const;

export const BUSINESS_TYPES = [
  "Food & Catering",
  "Fashion & Clothing",
  "Electronics & Gadgets",
  "Beauty & Cosmetics",
  "Health & Pharmacy",
  "Education & Training",
  "Events & Entertainment",
  "Construction & Real Estate",
  "Logistics & Delivery",
  "Agriculture",
  "Financial Services",
  "Other",
] as const;

export type ProductType = "physical" | "digital";

export interface Product {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  category: string | null;
  product_type: ProductType;
  image_urls: string[] | null;
  digital_file_url: string | null;
  stock_count: number;
  is_active: boolean;
  created_at: string;
  seller?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url" | "role" | "blue_tick" | "white_tick" | "gold_tick"> | null;
}

export function formatNgn(n: number | null | undefined): string {
  const v = typeof n === "number" ? n : 0;
  return "₦" + v.toLocaleString("en-NG");
}