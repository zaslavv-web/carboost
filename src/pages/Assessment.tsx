import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, RotateCcw } from "lucide-react";

interface Message {
  id: number;
  role: "ai" | "user";
  text: string;
  options?: string[];
}

const initialMessages: Message[] = [
  {
    id: 1,
    role: "ai",
    text: "Привет! 👋 Я — карьерный ассистент на базе ИИ. Я помогу вам определить ваши сильные стороны, зоны роста и построить оптимальную карьерную траекторию. Давайте начнём?",
    options: ["Да, начнём!", "Расскажи подробнее"],
  },
];

const aiResponses: Record<string, Message> = {
  "Да, начнём!": {
    id: 0,
    role: "ai",
    text: "Отлично! Первый вопрос: Как бы вы оценили свой уровень удовлетворённости текущей ролью по шкале от 1 до 10?",
    options: ["1-3: Низкий", "4-6: Средний", "7-8: Высокий", "9-10: Очень высокий"],
  },
  "Расскажи подробнее": {
    id: 0,
    role: "ai",
    text: "Конечно! Я проведу с вами диалог из 10-15 вопросов о ваших навыках, интересах, амбициях и текущей роли. На основе ваших ответов я сформирую персональный отчёт с рекомендациями. Готовы?",
    options: ["Да, начнём!"],
  },
  default: {
    id: 0,
    role: "ai",
    text: "Спасибо за ответ! Следующий вопрос: Какие навыки вы хотели бы развить в ближайшие 6 месяцев?",
    options: ["Технические навыки", "Управление командой", "Стратегическое мышление", "Коммуникации"],
  },
};

const Assessment = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (text: string) => {
    const userMsg: Message = { id: Date.now(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setProgress((p) => Math.min(p + 15, 100));

    setTimeout(() => {
      const response = aiResponses[text] || aiResponses.default;
      setMessages((prev) => [...prev, { ...response, id: Date.now() + 1 }]);
      setIsTyping(false);
    }, 1200);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    addMessage(input.trim());
    setInput("");
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Карьерная оценка</h1>
          <p className="text-muted-foreground text-sm mt-1">Диалог с искусственным интеллектом</p>
        </div>
        <button
          onClick={() => { setMessages(initialMessages); setProgress(0); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Начать заново
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Прогресс оценки</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Chat */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="h-[500px] overflow-y-auto p-6 space-y-5">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "ai" ? "gradient-primary" : "bg-secondary"
                }`}
              >
                {msg.role === "ai" ? (
                  <Bot className="w-4 h-4 text-primary-foreground" />
                ) : (
                  <User className="w-4 h-4 text-secondary-foreground" />
                )}
              </div>
              <div className={`max-w-[75%] space-y-3`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "ai"
                      ? "bg-secondary text-secondary-foreground rounded-tl-md"
                      : "gradient-primary text-primary-foreground rounded-tr-md"
                  }`}
                >
                  {msg.text}
                </div>
                {msg.options && (
                  <div className="flex flex-wrap gap-2">
                    {msg.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => addMessage(opt)}
                        className="px-3 py-1.5 rounded-full border border-primary/30 text-sm text-primary hover:bg-accent transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
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
              placeholder="Введите ваш ответ..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
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
