import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const safeJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await safeJson(req);
    const answers = body?.answers;
    const skillGaps = Array.isArray(body?.skillGaps) ? body.skillGaps : [];
    const positionTitle = String(body?.positionTitle || "").slice(0, 160);

    if (!answers || typeof answers !== "object") {
      return new Response(JSON.stringify({ error: "answers are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Сформируй черновик цифрового профиля сотрудника на русском языке по анкете. Верни только JSON без markdown.
Схема:
{
  "summary": "3-4 предложения о профиле",
  "strengths": ["3-5 сильных сторон"],
  "growth_areas": ["3-5 зон роста"],
  "recommendations": ["4-6 конкретных рекомендаций обучения/практики"],
  "career_focus": "рекомендуемый фокус карьерного развития",
  "risk_notes": ["0-3 поведенческих/мотивационных риска без диагнозов"]
}
Должность: ${positionTitle || "не указана"}
Skill gaps: ${JSON.stringify(skillGaps).slice(0, 6000)}
Анкета: ${JSON.stringify(answers).slice(0, 14000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Ты HRD-аналитик. Пиши конкретно, без медицинских диагнозов, без завышенных выводов. Ответ — только валидный JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI profile generation failed", response.status, text);
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: cleaned, strengths: [], growth_areas: [], recommendations: [], career_focus: "", risk_notes: [] };
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-questionnaire-profile error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
