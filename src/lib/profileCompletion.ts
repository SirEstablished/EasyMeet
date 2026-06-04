import { supabase, type Profile } from "@/integrations/supabase/client";

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export function calcCompletion(
  profile: Pick<Profile, "role" | "avatar_url" | "full_name" | "bio" | "location" | "phone" | "username">,
  _servicesCount?: number,
): number {
  if (profile.role === "customer") {
    return (
      (filled(profile.avatar_url) ? 25 : 0) +
      (filled(profile.full_name) && filled(profile.bio) ? 25 : 0) +
      (filled(profile.location) ? 25 : 0) +
      (filled(profile.phone) ? 25 : 0)
    );
  }
  return (
    (filled(profile.avatar_url) ? 20 : 0) +
    (filled(profile.full_name) ? 20 : 0) +
    (filled(profile.bio) ? 20 : 0) +
    (filled(profile.location) ? 20 : 0) +
    (filled(profile.phone) ? 20 : 0)
  );
}

export async function fetchCompletion(userId: string): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, avatar_url, full_name, bio, location, phone, username")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return 0;
  return calcCompletion(profile as any);
}