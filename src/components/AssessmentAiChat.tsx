import { useEffect, useRef, useState } from "react";
import { Loader2, Send, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

import { aiStream } from "@/integrations/laravel/client";
import RagSources, { type RagSource } from "@/components/ai/RagSources";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
}

interface Props {
  companyId: string | null | undefined;
  onExit: () => void;
}

/**
 * AI assessment chat: streams SSE from /ai/assessment-chat,
 * accumulates assistant tokens, shows RAG sources (X-Rag-Sources header)
 * under the last assistant message.
 */
const AssessmentAiChat = ({ companyId, onExit }: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Здравствуйте! Я проведу с вами интервью для оценки компетенций. Готовы начать? Расскажите, пожалуйста, о вашей роли и основных задачах.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const payload = next.map((m) => ({ role: m.role, content: m.content }));
      const res = await aiStream(
        "assessment-chat",
        { messages: payload, company_id: companyId || undefined },
        { signal: ac.signal },
      );

      if (!res.ok || !res.body) {
        if (res.status === 423) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "AI отключён администратором");
        }
        throw new Error(`Ошибка ${res.status}`);
      }

      // Parse RAG sources header (если бэкенд прислал)
      let sources: RagSource[] = [];
      const hdr = res.headers.get("X-Rag-Sources");
      if (hdr) {
        try {
          const parsed = JSON.parse(hdr);
          if (Array.isArray(parsed)) sources = parsed;
        } catch {
          /* ignore */
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta =
              json.choices?.[0]?.delta?.content ??
              json.choices?.[0]?.message?.content ??
              "";
            if (delta) {
              acc += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch {
            /* skip non-JSON chunks */
          }
        }
      }

      // attach sources to final assistant message
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: acc || copy[copy.length - 1].content,
          sources: sources.length ? sources : undefined,
        };
        return copy;
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error(e);
      toast.error(e.message || "Ошибка стрима AI");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onExit}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
          aria-label="Назад"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-lg md:text-xl font-bold text-foreground">AI-интервью</h1>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-2"
      >
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground text-sm whitespace-pre-wrap"
                  : "max-w-[90%] space-y-2"
              }
            >
              {m.role === "assistant" ? (
                <>
                  <div className="rounded-2xl px-4 py-2.5 bg-card border border-border text-sm text-foreground prose prose-sm dark:prose-invert max-w-none">
                    {m.content ? (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <RagSources sources={m.sources} />
                  )}
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-2 bg-card border border-border rounded-xl p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ваш ответ..."
          rows={2}
          disabled={streaming}
          className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground px-2 py-1.5"
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 flex-shrink-0"
          aria-label="Отправить"
        >
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export default AssessmentAiChat;
