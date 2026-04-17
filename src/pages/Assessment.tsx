import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, RotateCcw, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AssessmentResult {
  overall_score: number;
  competencies: { skill_name: string; skill_value: number }[];
  summary: string;
  strengths: string[];
  growth_areas: string[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assessment-chat`;

const Assessment = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-start the conversation
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      streamChat([]);
    }
  }, []);

  const streamChat = async (chatMessages: ChatMessage[]) => {
    setIsStreaming(true);
    let assistantContent = "";
    let toolCallArgs = "";
    let isToolCall = false;

    const appendAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
        }
        return [...prev, { role: "assistant", content: assistantContent }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: chatMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Ошибка сети" }));
        toast.error(err.error || "Ошибка AI");
        setIsStreaming(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              appendAssistant(delta.content);
            }
            // Handle tool calls
            if (delta?.tool_calls) {
              isToolCall = true;
              for (const tc of delta.tool_calls) {
                if (tc.function?.arguments) {
                  toolCallArgs += tc.function.arguments;
                }
              }
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Process tool call result
      if (isToolCall && toolCallArgs) {
        try {
          const result = JSON.parse(toolCallArgs) as AssessmentResult;
          setAssessmentResult(result);

          // Show summary as assistant message
          const summaryText = `## Результаты оценки\n\n**Общий балл: ${result.overall_score}/100**\n\n${result.summary}\n\n### Сильные стороны\n${result.strengths.map((s) => `- ${s}`).join("\n")}\n\n### Зоны роста\n${result.growth_areas.map((g) => `- ${g}`).join("\n")}\n\n### Компетенции\n${result.competencies.map((c) => `- **${c.skill_name}**: ${c.skill_value}/100`).join("\n")}`;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.content.trim()) {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: summaryText } : m));
            }
            return [...prev, { role: "assistant", content: summaryText }];
          });

          // Auto-save
          await saveResults(result);
        } catch (e) {
          console.error("Failed to parse assessment result:", e);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка подключения к AI");
    }

    setIsStreaming(false);
  };

  const saveResults = async (result: AssessmentResult) => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Save assessment
      const { error: assessError } = await supabase.from("assessments").insert({
        user_id: user.id,
        assessment_type: "ai",
        score: result.overall_score,
        assessment_data: result as any,
      });
      if (assessError) throw assessError;

      // Upsert competencies
      for (const comp of result.competencies) {
        const { data: existing } = await supabase
          .from("competencies")
          .select("id")
          .eq("user_id", user.id)
          .eq("skill_name", comp.skill_name)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("competencies")
            .update({ skill_value: comp.skill_value })
            .eq("id", existing.id);
        } else {
          await supabase.from("competencies").insert({
            user_id: user.id,
            skill_name: comp.skill_name,
            skill_value: comp.skill_value,
          });
        }
      }

      // Update profile overall_score
      await supabase
        .from("profiles")
        .update({ overall_score: result.overall_score })
        .eq("user_id", user.id);

      queryClient.invalidateQueries({ queryKey: ["competencies"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      toast.success("Результаты оценки сохранены!");
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка сохранения: " + e.message);
    }
    setIsSaving(false);
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    streamChat(newMessages);
  };

  const handleReset = () => {
    setMessages([]);
    setAssessmentResult(null);
    started.current = true;
    streamChat([]);
  };

  const questionCount = messages.filter((m) => m.role === "assistant").length;
  const progress = assessmentResult ? 100 : Math.min(Math.round((questionCount / 10) * 100), 95);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">AI Карьерная оценка</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1 hidden sm:block">Диалог с искусственным интеллектом</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs md:text-sm hover:bg-secondary/80 transition-colors flex-shrink-0"
        >
          <RotateCcw className="w-4 h-4" /> <span className="hidden sm:inline">Начать заново</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-between text-xs md:text-sm text-muted-foreground mb-2">
          <span>Прогресс оценки</span>
          <span className="flex items-center gap-1">
            {assessmentResult && <CheckCircle className="w-4 h-4 text-success" />}
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {progress}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Chat */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="h-[60vh] md:h-[500px] overflow-y-auto p-4 md:p-6 space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "assistant" ? "gradient-primary" : "bg-secondary"
                }`}
              >
                {msg.role === "assistant" ? (
                  <Bot className="w-4 h-4 text-primary-foreground" />
                ) : (
                  <User className="w-4 h-4 text-secondary-foreground" />
                )}
              </div>
              <div className="max-w-[75%]">
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-secondary text-secondary-foreground rounded-tl-md"
                      : "gradient-primary text-primary-foreground rounded-tr-md"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground animate-pulse" />
              </div>
              <div className="bg-secondary rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={assessmentResult ? "Оценка завершена" : "Введите ваш ответ..."}
              disabled={isStreaming || !!assessmentResult}
              className="flex-1 px-4 py-2.5 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || !!assessmentResult}
              className="px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Assessment;
