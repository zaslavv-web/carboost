// AI-generate a closed-question test tailored to employee's position and competencies
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Ты — эксперт по корпоративной оценке. Сгенерируй тест из 12 закрытых вопросов с одним правильным ответом, ориентированный на указанную должность и список компетенций.

Требования:
- Каждый вопрос — практический рабочий кейс или ситуация, не общий теоретический.
- 4 варианта ответа, только один правильный. Дистракторы должны быть правдоподобными.
- Покрытие: каждая компетенция из списка должна получить минимум 1 вопрос.
- Никакой воды и риторики, лаконичные формулировки.

Верни СТРОГО валидный JSON:
{
  "title": "Тест: <должность>",
  "description": "1 предложение",
  "questions": [
    {
      "id":"q1",
      "text":"...",
      "competency":"<одна из переданных компетенций>",
      "options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],
      "correct_option_id":"a|b|c|d",
      "weight":1
    }
  ]
}

Без markdown, только JSON.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { positionTitle, competencies } = await req.json();

    const compList = Array.isArray(competencies) && competencies.length
      ? competencies
      : ["Коммуникация", "Аналитическое мышление", "Командная работа", "Решение проблем", "Адаптивность"];

    const prompt = `Должность: ${positionTitle || "Сотрудник"}
Ключевые компетенции: ${compList.join(", ")}

Сгенерируй тест из 12 закрытых вопросов. Распредели вопросы равномерно между компетенциями.`;

    const LOVABLE_API_KEY = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch(`${Deno.env.get("AI_API_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Слишком много запросов" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Закончились кредиты Lovable AI" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway failed");
    }

    const data = await aiResp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const normalized = questions
      .filter((q: any) => q && q.text && Array.isArray(q.options) && q.options.length >= 2 && q.correct_option_id)
      .map((q: any, i: number) => ({
        id: q.id || `q${i + 1}`,
        text: String(q.text).trim(),
        competency: String(q.competency || compList[0]).trim(),
        options: q.options.map((o: any, j: number) => ({
          id: o.id || String.fromCharCode(97 + j),
          text: String(o.text || "").trim(),
        })),
        correct_option_id: String(q.correct_option_id),
        weight: Number(q.weight) || 1,
      }))
      .filter((q: any) => q.options.some((o: any) => o.id === q.correct_option_id));

    return new Response(
      JSON.stringify({
        title: parsed.title || `Тест: ${positionTitle || "Сотрудник"}`,
        description: parsed.description || "AI-сгенерированный тест под вашу должность",
        questions: normalized,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("generate-closed-test error:", e);
    return new Response(JSON.stringify({ error: e.message || "Ошибка" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
