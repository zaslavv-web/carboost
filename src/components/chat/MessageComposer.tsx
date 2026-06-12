import { KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const QUICK_EMOJI = ["😀", "😂", "😉", "😍", "🤔", "👍", "👏", "🙏", "🎉", "🔥", "❤️", "✅"];

const MessageComposer = ({ onSend }: { onSend: (body: string) => Promise<boolean> }) => {
  const { t } = useTranslation("chat");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onSend(body);
    setSending(false);
    if (!ok) {
      toast.error(t("errors.sendFailed"));
      return;
    }
    setText("");
    ref.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const insert = (s: string) => {
    setText((v) => v + s);
    ref.current?.focus();
  };

  return (
    <div className="border-t border-border p-2 bg-card">
      <div className="relative flex items-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            className="p-2 rounded-md hover:bg-secondary text-muted-foreground"
            aria-label="emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-10 left-0 bg-popover border border-border rounded-lg shadow-lg p-1 flex flex-wrap gap-0.5 w-[200px] z-10">
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    insert(e);
                    setEmojiOpen(false);
                  }}
                  className="text-lg hover:bg-secondary rounded p-1 leading-none"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder={t("typeMessage")}
          className="flex-1 min-h-[40px] max-h-32 resize-none py-2"
        />
        <Button size="icon" onClick={submit} disabled={!text.trim() || sending} aria-label={t("send")}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default MessageComposer;
