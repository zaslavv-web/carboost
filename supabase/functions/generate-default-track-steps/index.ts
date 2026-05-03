// Edge function: генерирует дефолтные этапы карьерного трека через Lovable AI
// Структура каждого этапа: title, description, duration_months, goals[], pass_conditions[],
// rewards[], penalty, success_metrics[]

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateBody {
  template_title?: string;
  description?: string;
  from_position_title?: string;
  to_position_title?: string;
  estimated_months?: number;
}

const FALLBACK = (months: number) => {
  const per = Math.max(1, Math.round(months / 4));
  const baseMetrics = ["Отзыв руководителя ≥ 4/5", "Прохождение контрольного теста ≥ 80%"];
  const basePenalty =
    "Назначить дополнительное тестирование, выявляющее: (а) изменились ли цели сотрудника, (б) причины срыва перехода на следующий этап, (в) изменилась ли мотивация сотрудника.";
  return [
    {
      order: 0,
      title: "Адаптация и базовые знания",
      description: "Освоение базовых знаний, инструментов и регламентов компании.",
      duration_months: per,
      goals: ["Изучить регламенты и инструменты", "Сдать вводный тест"],
      pass_conditions: ["Завершить онбординг", "Тест ≥ 70%"],
      rewards: ["Бейдж «Адаптация пройдена»", "Запись в цифровой паспорт"],
      penalty: basePenalty,
      success_metrics: baseMetrics,
    },
    {
      order: 1,
      title: "Освоение функций",
      description: "Самостоятельное выполнение типовых задач роли.",
      duration_months: per,
      goals: ["Выполнить 3 типовые задачи", "Получить положительную обратную связь"],
      pass_conditions: ["Закрыть KPI этапа ≥ 80%", "Оценка руководителя ≥ 4/5"],
      rewards: ["Очки лояльности", "Достижение «Уверенный исполнитель»"],
      penalty: basePenalty,
      success_metrics: baseMetrics,
    },
    {
      order: 2,
      title: "Расширение зоны ответственности",
      description: "Решение нестандартных задач и работа в команде.",
      duration_months: per,
      goals: ["Возглавить мини-проект", "Менторить нового сотрудника"],
      pass_conditions: ["Оценка 360° ≥ 4/5", "Сдать профильный тест ≥ 80%"],
      rewards: ["Достижение «Лидер мини-проекта»", "Очки лояльности"],
      penalty: basePenalty,
      success_metrics: baseMetrics,
    },
    {
      order: 3,
      title: "Готовность к целевой роли",
      description: "Подтверждение готовности к целевой должности.",
      duration_months: per,
      goals: ["Пройти финальную ассессмент-сессию", "Подготовить план развития"],
      pass_conditions: ["Финальный ассессмент ≥ 85%", "Согласование с HRD"],
      rewards: ["Перевод на целевую должность", "Премия / нематериальная награда"],
      penalty: basePenalty,
      success_metrics: ["Финальный ассессмент ≥ 85%", "Подтверждение HRD"],
    },
  ];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: GenerateBody = await req.json().catch(() => ({}));
    const months = body.estimated_months && body.estimated_months > 0 ? body.estimated_months : 12;
    const apiKey = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));

    if (!apiKey) {
      return new Response(JSON.stringify({ steps: FALLBACK(months), source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      "Ты HR-эксперт. Сгенерируй структуру карьерного трека на русском языке. " +
      "Верни 4 последовательных этапа развития от начальной должности к целевой. " +
      "Для каждого этапа обязательно укажи: сроки (duration_months), 2-4 ключевые цели, 2-3 условия прохождения, 2-3 бонуса, " +
      "штраф/предложение при непрохождении (по умолчанию — дополнительное тестирование, выявляющее изменения целей, причины провала и изменения мотивации), " +
      "2-3 метрики успеха.";

    const userPrompt = `Трек: ${body.template_title || "Карьерный трек"}.
Описание: ${body.description || "—"}.
Из должности: ${body.from_position_title || "—"}.
В должность: ${body.to_position_title || "—"}.
Общая длительность: ~${months} месяцев.
Сгенерируй 4 этапа.`;

    const response = await fetch("${Deno.env.get("AI_API_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"}", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "build_track_steps",
              description: "Возвращает структурированные этапы карьерного трека",
              parameters: {
                type: "object",
                properties: {
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        order: { type: "number" },
                        title: { type: "string" },
                        description: { type: "string" },
                        duration_months: { type: "number" },
                        goals: { type: "array", items: { type: "string" } },
                        pass_conditions: { type: "array", items: { type: "string" } },
                        rewards: { type: "array", items: { type: "string" } },
                        penalty: { type: "string" },
                        success_metrics: { type: "array", items: { type: "string" } },
                      },
                      required: [
                        "order",
                        "title",
                        "description",
                        "duration_months",
                        "goals",
                        "pass_conditions",
                        "rewards",
                        "penalty",
                        "success_metrics",
                      ],
                    },
                  },
                },
                required: ["steps"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "build_track_steps" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429 || response.status === 402) {
        return new Response(
          JSON.stringify({ steps: FALLBACK(months), source: "fallback", error: response.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      return new Response(JSON.stringify({ steps: FALLBACK(months), source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let steps: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(parsed.steps)) steps = parsed.steps;
      } catch (e) {
        console.error("parse error", e);
      }
    }
    if (!steps.length) steps = FALLBACK(months);

    return new Response(JSON.stringify({ steps, source: "ai" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-default-track-steps error", e);
    return new Response(
      JSON.stringify({ steps: FALLBACK(12), source: "fallback", error: String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
