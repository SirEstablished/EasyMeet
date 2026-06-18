import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MessageSchema = z.object({
  sender_id: z.string(),
  body: z.string().max(4000),
});

const DetectInput = z.object({
  messages: z.array(MessageSchema).max(80),
  meId: z.string(),
  otherId: z.string(),
});

const SuggestInput = z.object({
  messages: z.array(MessageSchema).max(80),
});

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAiJson<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "lovable-app",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("AI gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = json.choices?.[0]?.message?.content ?? "";
    return JSON.parse(txt) as T;
  } catch (err) {
    console.warn("AI call failed", err);
    return null;
  }
}

function transcript(messages: { sender_id: string; body: string }[], meId: string, otherId: string) {
  return messages
    .map((m) => {
      const who = m.sender_id === meId ? "USER_A" : m.sender_id === otherId ? "USER_B" : "OTHER";
      return `${who}: ${m.body}`;
    })
    .join("\n");
}

export interface RoleDetection {
  providerId: string | null;
  buyerId: string | null;
  confidence: number;
  reason?: string;
}

export const detectEscrowRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetectInput.parse(d))
  .handler(async ({ data, context }): Promise<RoleDetection> => {
    if (context.userId !== data.meId) {
      return { providerId: null, buyerId: null, confidence: 0 };
    }
    if (data.messages.length === 0) {
      return { providerId: null, buyerId: null, confidence: 0 };
    }
    const sys =
      "You analyze a chat between two users (USER_A and USER_B) to determine which one is the SERVICE PROVIDER / SELLER (the one offering work or goods for money) and which is the BUYER / CLIENT (the one hiring or purchasing). " +
      'Reply ONLY with strict JSON: {"provider":"USER_A"|"USER_B"|"unknown","confidence":0..1,"reason":"short"}';
    const user = `Conversation:\n${transcript(data.messages, data.meId, data.otherId)}\n\nWho is the service provider/seller?`;
    const result = await callAiJson<{ provider: string; confidence: number; reason?: string }>(sys, user);
    if (!result || result.provider === "unknown") {
      return { providerId: null, buyerId: null, confidence: result?.confidence ?? 0, reason: result?.reason };
    }
    const providerId = result.provider === "USER_A" ? data.meId : result.provider === "USER_B" ? data.otherId : null;
    const buyerId = providerId === data.meId ? data.otherId : providerId === data.otherId ? data.meId : null;
    return {
      providerId,
      buyerId,
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0)),
      reason: result.reason,
    };
  });

export interface AgreementSuggestion {
  title: string;
  description: string;
  price: number | null;
  terms: string;
}

export const suggestAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuggestInput.parse(d))
  .handler(async ({ data }): Promise<AgreementSuggestion> => {
    const empty: AgreementSuggestion = { title: "", description: "", price: null, terms: "" };
    if (data.messages.length === 0) return empty;
    const sys =
      "From the chat, draft a service agreement. Reply ONLY strict JSON: " +
      '{"title":"short job title <=80 chars","description":"clear scope of work <=600 chars","price":number_in_NGN_or_null,"terms":"timeline / deliverables / terms <=400 chars"}. ' +
      "If a price is mentioned (e.g. '50k', '₦100,000', 'NGN 75000'), normalize it to a plain integer in naira. If unsure, use null.";
    const lines = data.messages.map((m) => `- ${m.body}`).join("\n");
    const result = await callAiJson<AgreementSuggestion>(sys, `Conversation:\n${lines}\n\nDraft the agreement.`);
    if (!result) return empty;
    return {
      title: String(result.title ?? "").slice(0, 120),
      description: String(result.description ?? "").slice(0, 2000),
      price: typeof result.price === "number" && result.price > 0 ? Math.round(result.price) : null,
      terms: String(result.terms ?? "").slice(0, 1000),
    };
  });