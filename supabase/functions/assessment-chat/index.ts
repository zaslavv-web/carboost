import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Ты — AI-карьерный ассистент для проведения профессиональной оценки компетенций сотрудника.

Правила:
1. Проведи диалог из 8-10 вопросов, оценивая ключевые компетенции: Лидерство, Технические навыки, Коммуникация, Аналитика, Управление проектами, Адаптивность.
2. Каждый вопрос должен быть практичным, основанным на реальных рабочих ситуациях.
3. После ответа пользователя задай следующий вопрос.
4. Когда все вопросы заданы, ОБЯЗАТЕЛЬНО вызови функцию complete_assessment с результатами оценки.
5. Будь дружелюбным, но профессиональным. Используй русский язык.
6. В начале разговора представься и объясни процесс.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body: any = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
      tools: [
        {
          type: "function",
          function: {
            name: "complete_assessment",
            description: "Вызывается после завершения всех вопросов оценки. Возвращает оценки по компетенциям и общий результат.",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "number", description: "Общий балл от 0 до 100" },
                competencies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill_name: { type: "string", description: "Название компетенции" },
                      skill_value: { type: "number", description: "Оценка от 0 до 100" },
                    },
                    required: ["skill_name", "skill_value"],
                  },
                },
                summary: { type: "string", description: "Краткое резюме оценки на русском" },
                strengths: {
                  type: "array",
                  items: { type: "string" },
                  description: "Сильные стороны",
                },
                growth_areas: {
                  type: "array",
                  items: { type: "string" },
                  description: "Зоны роста",
                },
              },
              required: ["overall_score", "competencies", "summary", "strengths", "growth_areas"],
            },
          },
        },
      ],
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Необходимо пополнить баланс AI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Ошибка AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("assessment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
