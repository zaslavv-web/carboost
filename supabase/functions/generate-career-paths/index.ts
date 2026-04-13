import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { positions, departments } = await req.json();
    if (!positions?.length) {
      return new Response(JSON.stringify({ error: "Нет должностей для анализа" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Ты — HR-аналитик. На основе списка должностей и оргструктуры компании построй логичные карьерные пути.

Правила:
1. Карьерный путь — это переход от одной должности к другой (повышение или горизонтальный переход)
2. Учитывай иерархию отделов: внутри отдела карьерный рост идёт от младших к старшим позициям
3. Между отделами могут быть горизонтальные переходы на аналогичные уровни
4. Для каждого пути укажи примерное время в месяцах и краткое описание стратегии
5. Не создавай циклических путей

Ответь СТРОГО в JSON:
{
  "career_paths": [
    {
      "from_position_id": "id должности откуда",
      "to_position_id": "id должности куда",
      "estimated_months": 12,
      "strategy_description": "краткое описание стратегии перехода"
    }
  ]
}`;

    const userContent = `Должности:\n${JSON.stringify(positions.map((p: any) => ({
      id: p.id, title: p.title, department: p.department,
    })), null, 2)}\n\nОргструктура (отделы):\n${JSON.stringify(departments.map((d: any) => ({
      id: d.id, name: d.name, parent_id: d.parent_id,
    })), null, 2)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит запросов" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + aiResponse.status);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let result: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { career_paths: [] };
    } catch {
      result = { career_paths: [] };
    }

    // Validate that all position IDs exist
    const posIds = new Set(positions.map((p: any) => p.id));
    result.career_paths = (result.career_paths || []).filter(
      (cp: any) => posIds.has(cp.from_position_id) && posIds.has(cp.to_position_id) && cp.from_position_id !== cp.to_position_id
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
