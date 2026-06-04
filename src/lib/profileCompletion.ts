import { supabase, type Profile } from "@/integrations/supabase/client";

export function calcCompletion(
  profile: Pick<Profile, "role" | "avatar_url" | "full_name" | "bio" | "location" | "phone" | "username">,
  servicesCount: number,
): number {
  if (profile.role === "customer") {
    return (
      (profile.avatar_url ? 25 : 0) +
      (profile.full_name && profile.bio ? 25 : 0) +
      (profile.location ? 25 : 0) +
      (profile.phone ? 25 : 0)
    );
  }
  return (
    (profile.avatar_url ? 20 : 0) +
    (profile.full_name && profile.bio ? 20 : 0) +
    (profile.location ? 20 : 0) +
    (profile.username ? 20 : 0) +
    (servicesCount > 0 ? 20 : 0)
  );
}

export async function fetchCompletion(userId: string): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, avatar_url, full_name, bio, location, phone, username")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return 0;
  let servicesCount = 0;
  if (profile.role !== "customer") {
    const { count } = await supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", userId);
    servicesCount = count ?? 0;
  }
  return calcCompletion(profile as any, servicesCount);
}