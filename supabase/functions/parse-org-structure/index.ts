import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl, fileName, extractPositions } = await req.json();
    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) throw new Error("Failed to download file");
    const fileBuffer = await fileResponse.arrayBuffer();

    const ext = (fileName || "").toLowerCase();
    let textContent = "";

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
    }

    let base64Content = "";
    if (!textContent) {
      const bytes = new Uint8Array(fileBuffer);
      let binary = "";
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
      }
      base64Content = btoa(binary);
    }

    const positionsBlock = extractPositions ? `

Также извлеки все должности/позиции, упомянутые в документе. Для каждой должности попробуй определить:
- К какому отделу она относится
- Профиль компетенций (навыки с требуемым уровнем 1-10)
- Психологический портрет (личностные черты)

Добавь в ответ поле "positions":
"positions": [
  {
    "title": "название должности",
    "department": "название отдела к которому относится",
    "description": "описание должности",
    "competency_profile": [
      {"name": "название компетенции", "required_level": 7}
    ],
    "psychological_profile": [
      {"trait": "название черты", "level": "высокое"}
    ]
  }
]

Уровни для черт: низкое, ниже среднего, среднее, выше среднего, высокое.
Если информации о компетенциях или психопортрете нет — оставь пустые массивы.` : "";

    const systemPrompt = `Ты — HR-аналитик. Проанализируй документ "${fileName}" и извлеки организационную структуру компании.

Извлеки список отделов/подразделений с их иерархией.

Ответь СТРОГО в JSON:
{
  "departments": [
    {"name": "название отдела", "description": "краткое описание", "parent": "название родительского отдела или null"}
  ]${extractPositions ? `,
  "positions": [...]` : ""}
}

Если родительский отдел не указан, поставь parent: null.
Извлеки максимум информации о структуре.${positionsBlock}`;

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
          { role: "user", content: textContent
            ? `Содержимое файла:\n${textContent.substring(0, 80000)}`
            : `Содержимое файла (base64, первые 50000 символов): ${base64Content.substring(0, 50000)}`
          },
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
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { departments: [] };
    } catch {
      result = { departments: [] };
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
