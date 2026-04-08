import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { documentId, fileUrl, fileName, documentType } = await req.json();
    if (!documentId || !fileUrl) {
      return new Response(JSON.stringify({ error: "documentId and fileUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Update status to processing
    await supabase.from("hr_documents").update({ processing_status: "processing" }).eq("id", documentId);

    // Download file
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) throw new Error("Failed to download file");
    
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const typeLabels: Record<string, string> = {
      talent_management: "политика управления талантами",
      hr_strategy: "HR-стратегия",
      motivation_strategy: "стратегия мотивации",
    };

    const systemPrompt = `Ты — HR-аналитик. Проанализируй загруженный документ "${fileName}" (тип: ${typeLabels[documentType] || documentType}).

Извлеки из документа структурированную информацию и создай сценарий оценки сотрудников на основе этого документа.

Ответ СТРОГО в формате JSON:
{
  "summary": "краткое описание документа",
  "key_points": ["ключевой пункт 1", "ключевой пункт 2"],
  "scenario": {
    "title": "название сценария оценки на основе документа",
    "description": "описание сценария",
    "questions": [
      {
        "question": "вопрос для оценки сотрудника",
        "criteria": "критерии оценки ответа",
        "max_score": 10
      }
    ],
    "competencies": ["компетенция1", "компетенция2"]
  }
}`;

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
          { role: "user", content: `Содержимое файла (base64): ${base64Content.substring(0, 50000)}. Файл: ${fileName}. Проанализируй и создай сценарий оценки.` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        await supabase.from("hr_documents").update({ processing_status: "failed", extracted_data: { error: "Превышен лимит запросов, попробуйте позже" } }).eq("id", documentId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      await supabase.from("hr_documents").update({ processing_status: "failed", extracted_data: { error: "AI processing failed" } }).eq("id", documentId);
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from AI response
    let extracted: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      extracted = { raw: content };
    }

    // Update document with extracted data
    await supabase.from("hr_documents").update({
      processing_status: "completed",
      extracted_data: extracted,
    }).eq("id", documentId);

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
