import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { laravelDb } from "@/integrations/laravel/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Cloud, Server, Mail, Phone, Building2, Users } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  contacted: "В работе",
  won: "Закрыта продажей",
  lost: "Отказ",
};

export default function PricingInquiries() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pricing_inquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_inquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await laravelDb.from("pricing_inquiries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["pricing_inquiries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Заявки на тарифы</h1>
        <p className="text-muted-foreground">Запросы с публичной страницы тарифов</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Пока нет заявок</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {items.map((i: any) => {
            const Icon = i.plan === "cloud" ? Cloud : Server;
            return (
              <Card key={i.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{i.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(i.created_at), "d MMM yyyy, HH:mm", { locale: ru })} · {i.plan === "cloud" ? "Cloud" : "On-Premise"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={i.status === "new" ? "default" : i.status === "won" ? "secondary" : "outline"}>
                    {STATUS_LABEL[i.status]}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${i.email}`} className="text-primary hover:underline">{i.email}</a></div>
                    {i.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />{i.phone}</div>}
                    {i.company && <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{i.company}</div>}
                    {i.headcount && <div className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" />{i.headcount} чел.</div>}
                  </div>
                  {i.message && <div className="text-sm bg-muted p-3 rounded-md">{i.message}</div>}
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                    <Select value={i.status} onValueChange={(v) => update.mutate({ id: i.id, patch: { status: v } })}>
                      <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, l]) => (
                          <SelectItem key={k} value={k}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Заметки менеджера"
                      defaultValue={i.admin_notes ?? ""}
                      onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => update.mutate({ id: i.id, patch: { admin_notes: notes[i.id] ?? i.admin_notes } })}
                    >
                      Сохранить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
