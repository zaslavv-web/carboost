import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Plus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const Companies = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: companyCounts = {} } = useQuery({
    queryKey: ["company_user_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const p of data || []) {
        if (p.company_id) {
          counts[p.company_id] = (counts[p.company_id] || 0) + 1;
        }
      }
      return counts;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("companies").insert({ name, description: description || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Компания создана");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const { error } = await supabase
        .from("companies")
        .update({ name, description: description || null })
        .eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Компания обновлена");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Компания удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setName("");
    setDescription("");
  };

  const startEdit = (company: any) => {
    setEditId(company.id);
    setName(company.name);
    setDescription(company.description || "");
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Компании</h1>
          <p className="text-muted-foreground text-sm mt-1">Управление компаниями-клиентами</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{editId ? "Редактировать" : "Новая компания"}</h3>
            <button onClick={resetForm}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Название</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full mt-1.5 px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                placeholder="ООО «Название»"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full mt-1.5 px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary resize-none"
                placeholder="Краткое описание компании"
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {editId ? "Сохранить" : "Создать"}
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : companies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Компании ещё не созданы</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c: any) => (
            <div key={c.id} className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{companyCounts[c.id] || 0} сотрудников</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Удалить компанию?")) deleteMutation.mutate(c.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
              {c.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Companies;
