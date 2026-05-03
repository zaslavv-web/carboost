import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Ты — СТРОГИЙ AI-эксперт по оценке компетенций сотрудников. Твоя задача — провести профессиональное интервью и честно оценить кандидата, а не просто принять любые ответы.

КЛЮЧЕВЫЕ ПРИНЦИПЫ ОЦЕНКИ:
1. НИКОГДА не принимай общие ответы вроде «я хорошо лажу с людьми», «я лидер», «я всё умею». Требуй КОНКРЕТИКУ: цифры, кейсы, метрики, результаты, сроки.
2. Если ответ слишком общий, расплывчатый, бахвальный или без доказательств — обязательно задай уточняющий follow-up вопрос («Приведите конкретный пример», «Какие были метрики?», «Сколько человек?», «Какой результат в цифрах?»).
3. Если кандидат на follow-up снова отвечает общими фразами — это сигнал низкого балла по этой компетенции.
4. Хвалить можно только за КОНКРЕТНЫЕ доказательства (числа, кейсы, последствия решений).

СТРУКТУРА ИНТЕРВЬЮ (12-14 вопросов):
- 2 вопроса на ЛИДЕРСТВО (через ситуационные кейсы: «Подчинённый систематически срывает дедлайны. Опишите шаги.»)
- 2 на ТЕХНИЧЕСКИЕ НАВЫКИ (через конкретный проект: «Опишите самую сложную техническую задачу за последний год: контекст, ваше решение, результат.»)
- 2 на КОММУНИКАЦИЮ (кейс: «Вам нужно отказать важному стейкхолдеру в его требовании. Как вы это сделаете?»)
- 2 на АНАЛИТИКУ (кейс: «Метрика X упала на 20%. Ваши шаги по диагностике?»)
- 2 на УПРАВЛЕНИЕ ПРОЕКТАМИ (кейс с конкретными ограничениями)
- 2 на АДАПТИВНОСТЬ/СТРЕССОУСТОЙЧИВОСТЬ (реальный кейс провала или резкого изменения)

ПРАВИЛА FOLLOW-UP:
- После каждого основного вопроса оцени про себя ответ по шкале 0-10. Если < 6 — обязательно задай follow-up прежде, чем переходить к следующему вопросу.
- Максимум 1 follow-up на каждый основной вопрос (чтобы не растягивать).
- Перед каждым новым вопросом кратко (1 строка) подтверди, что услышал ответ — но БЕЗ оценочных суждений вроде «отлично», «прекрасно».

ИТОГОВАЯ ОЦЕНКА (после всех вопросов):
- Вызови функцию complete_assessment.
- Каждая компетенция оценивается СТРОГО по шкале 0-100:
  * 0-30: ответы общие, без примеров, признаки отсутствия опыта
  * 31-50: есть базовое понимание, но мало конкретики или слабые результаты
  * 51-70: уверенный уровень с примерами, но без выдающихся результатов
  * 71-85: сильные кейсы с измеримыми результатами
  * 86-100: исключительные доказательства (только при наличии конкретных цифр и масштабных результатов)
- ПО УМОЛЧАНИЮ ставь оценки в диапазоне 40-65. Высокие баллы (>75) — только если кандидат предоставил конкретные метрики и результаты.
- overall_score = средневзвешенное по компетенциям, но НЕ выше максимальной оценки по компетенциям.
- В summary честно укажи и сильные, и слабые стороны. Не приукрашивай.
- В growth_areas обязательно укажи минимум 2 конкретные области, даже если ответы хорошие.

Тон: профессиональный, нейтральный, без избыточных похвал. Русский язык.
В начале представься коротко (2-3 строки) и сразу задай первый вопрос.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body: any = {
      model: "google/gemini-2.5-pro",
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
            description: "Вызывается ПОСЛЕ всех 12-14 вопросов и follow-up. Возвращает строгую оценку с обоснованием.",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "number", description: "Общий балл 0-100, среднее по компетенциям" },
                competencies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill_name: { type: "string" },
                      skill_value: { type: "number", description: "0-100 строго по rubric" },
                      justification: { type: "string", description: "1-2 предложения: почему именно такой балл, со ссылкой на ответы" },
                    },
                    required: ["skill_name", "skill_value", "justification"],
                  },
                },
                summary: { type: "string", description: "Честное резюме 3-5 предложений с указанием слабых сторон" },
                strengths: { type: "array", items: { type: "string" }, description: "Только подтверждённые конкретными примерами" },
                growth_areas: { type: "array", items: { type: "string" }, description: "Минимум 2 области роста" },
              },
              required: ["overall_score", "competencies", "summary", "strengths", "growth_areas"],
            },
          },
        },
      ],
    };

    const response = await fetch("${Deno.env.get("AI_API_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"}", {
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
