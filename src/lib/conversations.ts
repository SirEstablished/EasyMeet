import { supabase, type Conversation } from "@/integrations/supabase/client";

/**
 * Find existing conversation between two users (either ordering), or create one.
 * Returns the conversation id.
 */
export async function getOrCreateConversation(
  meId: string,
  otherId: string,
): Promise<string> {
  if (meId === otherId) throw new Error("Cannot message yourself");

  const { data: existing, error: findErr } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(user_a.eq.${meId},user_b.eq.${otherId}),and(user_a.eq.${otherId},user_b.eq.${meId})`,
    )
    .maybeSingle();

  if (findErr && findErr.code !== "PGRST116") throw findErr;
  if (existing) return (existing as Conversation).id;

  // Deterministic ordering: smaller id as user_a
  const [a, b] = meId < otherId ? [meId, otherId] : [otherId, meId];
  const { data: created, error: insErr } = await supabase
    .from("conversations")
    .insert({ user_a: a, user_b: b })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return (created as Conversation).id;
}