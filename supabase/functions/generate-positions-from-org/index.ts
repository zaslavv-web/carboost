import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { departments } = await req.json();
    if (!departments?.length) {
      return new Response(JSON.stringify({ error: "Нет отделов для анализа" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Ты — HR-аналитик. На основе организационной структуры компании (список отделов с иерархией) сгенерируй типовые должности для каждого отдела.

Для каждой должности определи:
1. Название должности
2. К какому отделу относится
3. Описание обязанностей
4. Профиль компетенций (навыки с требуемым уровнем 1-10)
5. Психологический портрет (личностные черты с уровнем)

Правила:
- Для каждого отдела создай 2-4 должности разного уровня (руководитель, специалист, младший специалист)
- Компетенции должны быть релевантны отделу
- Уровни для черт: низкое, ниже среднего, среднее, выше среднего, высокое

Ответь СТРОГО в JSON:
{
  "positions": [
    {
      "title": "название должности",
      "department": "название отдела",
      "description": "описание должности",
      "competency_profile": [
        {"name": "название компетенции", "required_level": 7}
      ],
      "psychological_profile": [
        {"trait": "название черты", "level": "высокое"}
      ]
    }
  ]
}`;

    const deptTree = departments.map((d: any) => ({
      name: d.name,
      description: d.description,
      parent_id: d.parent_id,
    }));

    const aiResponse = await fetch(`${Deno.env.get("AI_API_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Оргструктура компании:\n${JSON.stringify(deptTree, null, 2)}\n\nСгенерируй должности для каждого отдела.` },
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
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { positions: [] };
    } catch {
      result = { positions: [] };
    }

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
