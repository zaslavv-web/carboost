// Parse uploaded HRD test document (Excel/PDF/DOCX) into structured questions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Ты — эксперт по построению HR-тестов. Получаешь сырой текст из файла HRD (Excel/PDF/DOCX), который содержит закрытые вопросы (один правильный ответ из нескольких).

Задача: вернуть СТРОГО валидный JSON по схеме:
{
  "title": "string — название теста, кратко",
  "description": "string — 1-2 предложения о теме теста",
  "questions": [
    {
      "id": "q1",
      "text": "формулировка вопроса",
      "competency": "название компетенции, к которой относится вопрос (например: Лидерство, Коммуникация, Аналитика). Если не указано в файле — выбери осмысленную исходя из вопроса.",
      "options": [{"id":"a","text":"вариант 1"},{"id":"b","text":"вариант 2"},{"id":"c","text":"вариант 3"},{"id":"d","text":"вариант 4"}],
      "correct_option_id": "буква id правильного варианта",
      "weight": 1
    }
  ]
}

Правила:
- Только закрытые вопросы. Пропускай открытые.
- Минимум 2, максимум 6 вариантов на вопрос.
- Если правильный ответ не указан явно (нет выделения, "*", "Ответ:", и т.п.) — пропусти вопрос целиком.
- Не выдумывай вопросы, которых нет в источнике.
- Возвращай только JSON, без markdown-обёрток.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl, fileName } = await req.json();
    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) throw new Error("Не удалось скачать файл");
    const fileBuffer = await fileResponse.arrayBuffer();
    const ext = (fileName || "").toLowerCase();

    let textContent = "";
    let base64Content = "";
    let mime = "application/octet-stream";

    if (ext.endsWith(".csv")) {
      textContent = new TextDecoder().decode(fileBuffer);
    } else if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      const XLSX = await import("npm:xlsx@0.18.5");
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
      const sheets: string[] = [];
      for (const name of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        sheets.push(`=== Лист: ${name} ===\n${csv}`);
      }
      textContent = sheets.join("\n\n");
    } else {
      // Encode as base64 for PDF/DOCX (Gemini can read PDFs natively)
      const bytes = new Uint8Array(fileBuffer);
      let binary = "";
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
      }
      base64Content = btoa(binary);
      if (ext.endsWith(".pdf")) mime = "application/pdf";
      else if (ext.endsWith(".docx")) mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      else if (ext.endsWith(".doc")) mime = "application/msword";
    }

    const LOVABLE_API_KEY = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userParts: any[] = [];
    if (textContent) {
      const truncated = textContent.length > 60000 ? textContent.slice(0, 60000) : textContent;
      userParts.push({ type: "text", text: `Извлеки тест из следующего содержимого:\n\n${truncated}` });
    } else if (base64Content) {
      userParts.push({ type: "text", text: "Извлеки тест из приложенного файла." });
      userParts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64Content}` } });
    }

    const aiResp = await fetch(`${Deno.env.get("AI_API_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userParts },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов к AI. Попробуйте позже." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Закончились кредиты Lovable AI. Пополните баланс." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("AI gateway failed");
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("Failed to parse AI JSON:", raw);
      throw new Error("Не удалось распарсить ответ AI");
    }

    // Normalize
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const normalized = questions
      .filter((q: any) => q && typeof q.text === "string" && Array.isArray(q.options) && q.options.length >= 2 && q.correct_option_id)
      .map((q: any, i: number) => ({
        id: q.id || `q${i + 1}`,
        text: String(q.text).trim(),
        competency: String(q.competency || "Общее").trim(),
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
        title: parsed.title || "Тест без названия",
        description: parsed.description || "",
        questions: normalized,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("parse-test-document error:", e);
    return new Response(JSON.stringify({ error: e.message || "Ошибка обработки" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
