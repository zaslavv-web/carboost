// Shared AI gateway helper. Portable: configurable via env vars.
// Defaults to Lovable AI Gateway, but can point to OpenAI / OpenRouter / self-hosted vLLM.
//
// Env vars (set in Supabase project / self-hosted .env):
//   AI_API_URL    — full Chat Completions endpoint
//   AI_API_KEY    — bearer token (falls back to LOVABLE_API_KEY for backward compatibility)
//   AI_MODEL      — default model id used when caller doesn't pass one

export function getAIConfig() {
  const apiKey = Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
  const apiUrl =
    Deno.env.get("AI_API_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions";
  const defaultModel = Deno.env.get("AI_MODEL") ?? "google/gemini-2.5-flash";
  if (!apiKey) {
    throw new Error("AI gateway is not configured: set AI_API_KEY (or LOVABLE_API_KEY)");
  }
  return { apiKey, apiUrl, defaultModel };
}

export async function callAI(body: Record<string, unknown>): Promise<Response> {
  const { apiKey, apiUrl, defaultModel } = getAIConfig();
  const payload = { model: defaultModel, ...body };
  return fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
