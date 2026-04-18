// Edge function: генерирует дефолтный сценарий проверки этапа карьерного трека
// и (опционально) контрольный тест из 5 закрытых вопросов на основе целей этапа.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  template_id: string;
  step_order: number;
  step_title?: string;
  goals?: string[];
  pass_conditions?: string[];
  success_metrics?: string[];
  generate_test?: boolean;
}

const FALLBACK_INSTRUCTIONS = (title: string) =>
  `Для подтверждения этапа "${title}" пройдите контрольный тест (≥80%), загрузите минимум 1 подтверждающий файл (сертификат, скрин, отчёт) и оставьте короткий комментарий о выполненной работе.`;

const REINFORCED = (title: string) =>
  `Усиленный сценарий повторного прохождения этапа "${title}": пройдите тест ещё раз (≥85%), загрузите дополнительные материалы (минимум 2 файла) и развёрнуто опишите, какие изменения вы внесли после прошлого отклонения.`;

const FALLBACK_TEST = (goals: string[]) => {
  const base = goals.length ? goals : ["Базовые компетенции этапа"];
  return base.slice(0, 5).map((g, i) => ({
    id: `q${i + 1}`,
    question: `Какое утверждение лучше всего описывает цель: «${g}»?`,
    options: [
      "Выполнено в полном объёме согласно регламенту",
      "Выполнено частично без подтверждения",
      "Не выполнено",
      "Не относится к этапу",
    ],
    correct: 0,
    competency: "Этап трека",
  }));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Body = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const title = body.step_title || `Этап ${body.step_order + 1}`;
    const goals = body.goals || [];

    const fallback = {
      instructions: FALLBACK_INSTRUCTIONS(title),
      reinforced_instructions: REINFORCED(title),
      questions: body.generate_test ? FALLBACK_TEST(goals) : [],
    };

    if (!apiKey) {
      return new Response(JSON.stringify({ ...fallback, source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys =
      "Ты HR-эксперт. На основе данных этапа карьерного трека сгенерируй на русском: " +
      "(1) краткие инструкции для сотрудника по подтверждению этапа (что загрузить, что описать); " +
      "(2) инструкции для усиленного повторного прохождения (после отклонения); " +
      (body.generate_test
        ? "(3) 5 закрытых вопросов с 4 вариантами ответа и одним верным (поле correct — индекс 0..3) для проверки знаний этапа."
        : "");

    const user = `Этап: ${title}
Ключевые цели: ${goals.join("; ") || "—"}
Условия прохождения: ${(body.pass_conditions || []).join("; ") || "—"}
Метрики успеха: ${(body.success_metrics || []).join("; ") || "—"}`;

    const tools = [
      {
        type: "function",
        function: {
          name: "build_scenario",
          parameters: {
            type: "object",
            properties: {
              instructions: { type: "string" },
              reinforced_instructions: { type: "string" },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    question: { type: "string" },
                    options: { type: "array", items: { type: "string" } },
                    correct: { type: "number" },
                    competency: { type: "string" },
                  },
                  required: ["id", "question", "options", "correct"],
                },
              },
            },
            required: ["instructions", "reinforced_instructions"],
          },
        },
      },
    ];

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "build_scenario" } },
      }),
    });

    if (!r.ok) {
      console.error("AI gateway error", r.status, await r.text());
      return new Response(JSON.stringify({ ...fallback, source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: any = {};
    try {
      parsed = args ? JSON.parse(args) : {};
    } catch {}
    return new Response(
      JSON.stringify({
        instructions: parsed.instructions || fallback.instructions,
        reinforced_instructions: parsed.reinforced_instructions || fallback.reinforced_instructions,
        questions: body.generate_test ? parsed.questions || fallback.questions : [],
        source: "ai",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-step-scenario error", e);
    return new Response(
      JSON.stringify({
        instructions: "Подтвердите этап загрузкой материалов и комментарием.",
        reinforced_instructions: "Усиленный сценарий повторного прохождения.",
        questions: [],
        source: "error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
