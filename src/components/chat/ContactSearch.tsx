import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { chatApi, ChatContact } from "@/integrations/laravel/chat";
import { useChat } from "@/contexts/ChatContext";
import { toast } from "sonner";

const ContactSearch = ({
  query,
  setQuery,
  onPicked,
}: {
  query: string;
  setQuery: (s: string) => void;
  onPicked: (conversationId: string) => void;
}) => {
  const { t } = useTranslation("chat");
  const { openOrCreateDirect } = useChat();
  const [results, setResults] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const tid = setTimeout(async () => {
      setLoading(true);
      const res = await chatApi.contacts(query.trim());
      setLoading(false);
      if (res.error) return;
      setResults(res.data?.data ?? []);
    }, 250);
    return () => clearTimeout(tid);
  }, [query]);

  const pick = async (contact: ChatContact) => {
    const id = await openOrCreateDirect(contact.user_id);
    if (!id) {
      toast.error(t("errors.createFailed"));
      return;
    }
    setQuery("");
    setResults([]);
    onPicked(id);
  };

  return (
    <div className="border-b border-border">
      <div className="relative p-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="pl-9 h-9"
        />
      </div>
      {query.trim() && (
        <ul className="max-h-48 overflow-y-auto border-t border-border">
          {loading && <li className="p-3 text-xs text-muted-foreground">…</li>}
          {!loading && results.length === 0 && (
            <li className="p-3 text-xs text-muted-foreground">—</li>
          )}
          {results.map((c) => (
            <li key={c.user_id}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary text-left"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={c.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(c.full_name ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.full_name ?? "—"}</div>
                  {c.department && <div className="text-[11px] text-muted-foreground truncate">{c.department}</div>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ContactSearch;
