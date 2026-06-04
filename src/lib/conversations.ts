import { supabase, type Conversation } from "@/integrations/supabase/client";

/**
 * Find existing conversation between two users (either ordering), or create one.
 * Returns the conversation id.
 * When creating, user_a is always the caller (auth.uid()) and user_b is the target.
 */
export async function getOrCreateConversation(
  meId: string,
  otherId: string,
): Promise<string> {
  if (meId === otherId) throw new Error("Cannot message yourself");

  // Look up an existing conversation between the two users in either ordering.
  const { data: existing, error: findErr } = await supabase
    .from("conversations")
    .select("id, user_a, user_b")
    .or(
      `and(user_a.eq.${meId},user_b.eq.${otherId}),and(user_a.eq.${otherId},user_b.eq.${meId})`,
    )
    .limit(1);

  if (findErr) throw findErr;
  if (existing && existing.length > 0) return (existing[0] as Conversation).id;

  // Create with caller as user_a, target as user_b
  const { data: created, error: insErr } = await supabase
    .from("conversations")
    .insert({ user_a: meId, user_b: otherId })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return (created as Conversation).id;
}