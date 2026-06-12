import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, LifeBuoy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  const [defaults, setDefaults] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(false);

  // Preload "default" list (включает техподдержку наверху для не-суперадмина)
  useEffect(() => {
    let alive = true;
    chatApi.contacts("").then((res) => {
      if (!alive || res.error) return;
      setDefaults(res.data?.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  const supportPinned = defaults.filter((c) => c.is_support);
  const shown = query.trim() ? results : supportPinned;
  const showEmpty = query.trim() && !loading && results.length === 0;

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
      {(shown.length > 0 || showEmpty || loading) && (
        <ul className="max-h-56 overflow-y-auto border-t border-border">
          {loading && <li className="p-3 text-xs text-muted-foreground">…</li>}
          {showEmpty && <li className="p-3 text-xs text-muted-foreground">—</li>}
          {shown.map((c) => (
            <li key={c.user_id}>
              <button
                type="button"
                onClick={() => pick(c)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary text-left ${
                  c.is_support ? "bg-primary/5" : ""
                }`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={c.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {c.is_support ? (
                      <LifeBuoy className="w-4 h-4 text-primary" />
                    ) : (
                      (c.full_name ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {c.is_support ? t("support.title") : (c.full_name ?? "—")}
                    </span>
                    {c.is_support && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {t("support.badge")}
                      </Badge>
                    )}
                  </div>
                  {c.is_support ? (
                    <div className="text-[11px] text-muted-foreground truncate">{t("support.subtitle")}</div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[c.department, c.email, c.company_name].filter(Boolean).join(" • ") || ""}
                    </div>
                  )}
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
