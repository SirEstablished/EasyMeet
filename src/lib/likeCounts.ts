import { supabase } from "@/integrations/supabase/client";

export async function fetchLikeCount(postId: string): Promise<number> {
  const { count } = await supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);
  return count ?? 0;
}