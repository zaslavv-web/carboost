import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl, fileName } = await req.json();
    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Download file content
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
    
    const base64Content = textContent ? "" : btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    const systemPrompt = `Ты — HR-аналитик. Проанализируй документ "${fileName}" и извлеки:
1. Профиль компетенций — список навыков с требуемым уровнем (1-10)
2. Психологический портрет-эталон — список личностных черт с уровнем

Ответь СТРОГО в JSON:
{
  "competencies": [
    {"name": "название компетенции", "required_level": 7}
  ],
  "psychological_profile": [
    {"trait": "название черты", "level": "высокое"}
  ]
}

Уровни для черт: низкое, ниже среднего, среднее, выше среднего, высокое.
Если не удаётся извлечь какой-то раздел, верни пустой массив для него.`;

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
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { competencies: [], psychological_profile: [] };
    } catch {
      result = { competencies: [], psychological_profile: [] };
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
