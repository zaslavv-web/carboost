import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { aiInvoke } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Plus, X, Edit2, Trash2, ChevronDown, ChevronRight, Target, Loader2, Route, Users, Clock, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Step {
  order: number;
  title: string;
  description: string;
  duration_months: number;
  goals?: string[];
  pass_conditions?: string[];
  rewards?: string[];
  penalty?: string;
  success_metrics?: string[];
}

interface TemplateForm {
  title: string;
  description: string;
  motivation_text: string;
  from_position_id: string;
  to_position_id: string;
  estimated_months: number;
  steps: Step[];
}

const emptyForm: TemplateForm = {
  title: "",
  description: "",
  motivation_text: "",
  from_position_id: "",
  to_position_id: "",
  estimated_months: 12,
  steps: [],
};

const CareerTracksManagement = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"templates" | "assignments">("templates");

  const companyId = profile?.company_id;

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", companyId],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("positions").select("id, title, department").order("title");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["career_track_templates", companyId],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("career_track_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["career_level_actions", companyId],
    queryFn: async () => {
      const templateIds = templates.map(tpl => tpl.id);
      if (!templateIds.length) return [];
      const { data, error } = await laravelDb
        .from("career_level_actions")
        .select("*")
        .in("template_id", templateIds)
        .order("action_order");
      if (error) throw error;
      return data || [];
    },
    enabled: templates.length > 0,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["employee_career_assignments", companyId],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("employee_career_assignments")
        .select("*")
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all_profiles"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("profiles").select("user_id, full_name, position, department");
      if (error) throw error;
      return data || [];
    },
  });

  const [actionTexts, setActionTexts] = useState<Record<string, string>>({});

  const generateStepsAI = async (): Promise<Step[]> => {
    const fromTitle = positions.find((p) => p.id === form.from_position_id)?.title;
    const toTitle = positions.find((p) => p.id === form.to_position_id)?.title;
    const { data, error } = await aiInvoke("generate-default-track-steps", {
      body: {
        template_title: form.title,
        description: form.description,
        from_position_title: fromTitle,
        to_position_title: toTitle,
        estimated_months: form.estimated_months,
      },
    });
    if (error) throw error;
    return (data?.steps || []) as Step[];
  };

  const generateStepsMutation = useMutation({
    mutationFn: generateStepsAI,
    onSuccess: (steps) => {
      setForm((f) => ({ ...f, steps }));
      toast.success(t("careerTracks.toastStepsGenerated"));
    },
    onError: () => toast.error(t("careerTracks.errorGenerate")),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let stepsToSave = form.steps;
      if (!stepsToSave || stepsToSave.length === 0) {
        try {
          stepsToSave = await generateStepsAI();
        } catch (e) {
          console.error("auto-gen failed", e);
        }
      }
      const payload = {
        title: form.title,
        description: form.description || null,
        motivation_text: form.motivation_text || null,
        from_position_id: form.from_position_id || null,
        to_position_id: form.to_position_id || null,
        estimated_months: form.estimated_months || null,
        steps: stepsToSave as any,
        company_id: companyId,
        created_by: user!.id,
      };
      if (editingId) {
        const { error } = await laravelDb.from("career_track_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await laravelDb.from("career_track_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_track_templates"] });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(t(editingId ? "careerTracks.toastUpdated" : "careerTracks.toastCreated"));
    },
    onError: () => toast.error(t("careerTracks.errorSave")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("career_track_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_track_templates"] });
      toast.success(t("careerTracks.toastDeleted"));
    },
  });

  const addActionMutation = useMutation({
    mutationFn: async ({ templateId, text }: { templateId: string; text: string }) => {
      const count = actions.filter(a => a.template_id === templateId).length;
      const { error } = await laravelDb.from("career_level_actions").insert({
        template_id: templateId,
        action_text: text,
        action_order: count,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["career_level_actions"] }),
  });

  const deleteActionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("career_level_actions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["career_level_actions"] }),
  });

  // Assign template to employee
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState("");

  const assignMutation = useMutation({
    mutationFn: async ({ templateId, userId }: { templateId: string; userId: string }) => {
      const { error } = await laravelDb.from("employee_career_assignments").insert({
        template_id: templateId,
        user_id: userId,
        company_id: companyId,
        assigned_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee_career_assignments"] });
      setAssignModal(null);
      setAssignUserId("");
      toast.success(t("careerTracks.toastAssigned"));
    },
    onError: () => toast.error(t("careerTracks.errorAssign")),
  });

  const editTemplate = (t: any) => {
    setForm({
      title: t.title,
      description: t.description || "",
      motivation_text: t.motivation_text || "",
      from_position_id: t.from_position_id || "",
      to_position_id: t.to_position_id || "",
      estimated_months: t.estimated_months || 12,
      steps: (t.steps as Step[]) || [],
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const addStep = () => {
    setForm({
      ...form,
      steps: [...form.steps, { order: form.steps.length, title: "", description: "", duration_months: 3 }],
    });
  };

  const updateStep = (idx: number, field: keyof Step, value: any) => {
    const updated = [...form.steps];
    updated[idx] = { ...updated[idx], [field]: value };
    setForm({ ...form, steps: updated });
  };

  const removeStep = (idx: number) => {
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })) });
  };

  const posMap = Object.fromEntries(positions.map(p => [p.id, p]));
  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("careerTracks.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("careerTracks.subtitle")}</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
          <Plus className="w-4 h-4" /> {t("careerTracks.newTrackBtn")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("templates")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "templates" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          <Route className="w-4 h-4 inline mr-1.5" />{t("careerTracks.tabTemplates", { count: templates.length })}
        </button>
        <button onClick={() => setTab("assignments")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "assignments" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          <Users className="w-4 h-4 inline mr-1.5" />{t("careerTracks.tabAssignments", { count: assignments.length })}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card rounded-xl p-6 shadow-card border border-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{t(editingId ? "careerTracks.formEditTitle" : "careerTracks.formNewTitle")}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <input type="text" placeholder={t("careerTracks.titlePlaceholder")} value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
          <textarea placeholder={t("careerTracks.descPlaceholder")} value={form.description} rows={2}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
          <textarea placeholder={t("careerTracks.motivationPlaceholder")} value={form.motivation_text} rows={2}
            onChange={e => setForm({ ...form, motivation_text: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("careerTracks.fromPositionLabel")}</label>
              <select value={form.from_position_id} onChange={e => setForm({ ...form, from_position_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground">
                <option value="">{t("careerTracks.notSelected")}</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.title} ({p.department})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("careerTracks.toPositionLabel")}</label>
              <select value={form.to_position_id} onChange={e => setForm({ ...form, to_position_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground">
                <option value="">{t("careerTracks.notSelected")}</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.title} ({p.department})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("careerTracks.estimatedLabel")}</label>
            <input type="number" value={form.estimated_months} min={1}
              onChange={e => setForm({ ...form, estimated_months: parseInt(e.target.value) || 12 })}
              className="w-32 px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h4 className="text-sm font-medium text-foreground">{t("careerTracks.stepsTitle")}</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => generateStepsMutation.mutate()}
                  disabled={generateStepsMutation.isPending}
                  className="text-xs text-primary flex items-center gap-1 px-2 py-1 rounded border border-primary/30 hover:bg-primary/5 disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  {t(generateStepsMutation.isPending ? "careerTracks.generating" : "careerTracks.generateAI")}
                </button>
                <button onClick={addStep} className="text-xs text-primary flex items-center gap-1">
                  <Plus className="w-3 h-3" /> {t("careerTracks.addStepBtn")}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {t("careerTracks.autoGenHint")}
            </p>
            <div className="space-y-3">
              {form.steps.map((step, idx) => (
                <div key={idx} className="bg-secondary/30 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="text-xs text-muted-foreground mt-2.5 w-6">{idx + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <input type="text" placeholder={t("careerTracks.stepTitlePlaceholder")} value={step.title}
                        onChange={e => updateStep(idx, "title", e.target.value)}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm" />
                      <input type="text" placeholder={t("careerTracks.stepDescPlaceholder")} value={step.description}
                        onChange={e => updateStep(idx, "description", e.target.value)}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm" />
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">{t("careerTracks.stepDuration")}</label>
                        <input type="number" value={step.duration_months} min={1}
                          onChange={e => updateStep(idx, "duration_months", parseInt(e.target.value) || 3)}
                          className="w-20 px-3 py-1.5 rounded border border-input bg-background text-sm" />
                      </div>
                      <textarea placeholder={t("careerTracks.goalPlaceholder")} rows={2}
                        value={(step.goals || []).join("\n")}
                        onChange={e => updateStep(idx, "goals", e.target.value.split("\n").filter(Boolean))}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-xs" />
                      <textarea placeholder={t("careerTracks.passCondPlaceholder")} rows={2}
                        value={(step.pass_conditions || []).join("\n")}
                        onChange={e => updateStep(idx, "pass_conditions", e.target.value.split("\n").filter(Boolean))}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-xs" />
                      <textarea placeholder={t("careerTracks.rewardsPlaceholder")} rows={2}
                        value={(step.rewards || []).join("\n")}
                        onChange={e => updateStep(idx, "rewards", e.target.value.split("\n").filter(Boolean))}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-xs" />
                      <textarea placeholder={t("careerTracks.penaltyPlaceholder")} rows={2}
                        value={step.penalty || ""}
                        onChange={e => updateStep(idx, "penalty", e.target.value)}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-xs" />
                      <textarea placeholder={t("careerTracks.metricsPlaceholder")} rows={2}
                        value={(step.success_metrics || []).join("\n")}
                        onChange={e => updateStep(idx, "success_metrics", e.target.value.split("\n").filter(Boolean))}
                        className="w-full px-3 py-1.5 rounded border border-input bg-background text-xs" />
                    </div>
                    <button onClick={() => removeStep(idx)} className="mt-2"><X className="w-4 h-4 text-muted-foreground" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}
            className="px-6 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50">
            {t(saveMutation.isPending ? "careerTracks.saving" : editingId ? "careerTracks.updateBtn" : "careerTracks.createBtn")}
          </button>
        </div>
      )}

      {/* Templates tab */}
      {tab === "templates" && (
        <div className="space-y-3">
          {templates.length === 0 && (
            <div className="bg-card rounded-xl p-12 text-center border border-border">
              <Route className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">{t("careerTracks.emptyTemplates")}</h3>
              <p className="text-sm text-muted-foreground">{t("careerTracks.emptyTemplatesHint")}</p>
            </div>
          )}
          {templates.map(tpl => {
            const isExpanded = expandedId === tpl.id;
            const tActions = actions.filter(a => a.template_id === tpl.id);
            const tAssignments = assignments.filter(a => a.template_id === tpl.id);
            const fromPos = tpl.from_position_id ? posMap[tpl.from_position_id] : null;
            const toPos = tpl.to_position_id ? posMap[tpl.to_position_id] : null;
            const steps = (tpl.steps as unknown as Step[]) || [];
            return (
              <div key={tpl.id} className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
                <div className="p-5 flex items-center gap-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : tpl.id)}>
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                    <Route className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{tpl.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {fromPos ? fromPos.title : "—"} → {toPos ? toPos.title : "—"}
                      {tpl.estimated_months && <span className="ml-2">· {t("careerTracks.months", { n: tpl.estimated_months })}</span>}
                      <span className="ml-2">· {t("careerTracks.assignments", { n: tAssignments.length })}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); setAssignModal(tpl.id); }}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors" title={t("careerTracks.assignModalTitle")}>
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); editTemplate(tpl); }}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(tpl.id); }}
                      className="p-2 rounded-lg hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border/50 space-y-4">
                    {tpl.description && <p className="text-sm text-muted-foreground mt-3">{tpl.description}</p>}
                    {tpl.motivation_text && (
                      <div className="bg-primary/5 rounded-lg p-3">
                        <p className="text-xs font-medium text-primary mb-1">{t("careerTracks.motivationBadge")}</p>
                        <p className="text-sm text-foreground">{tpl.motivation_text}</p>
                      </div>
                    )}

                    {/* Steps */}
                    {steps.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2">{t("careerTracks.stepsSection")}</h4>
                        <div className="space-y-2">
                          {steps.map((s, i) => (
                            <div key={i} className="flex items-start gap-3 p-2.5 bg-secondary/30 rounded-lg">
                              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">{s.title}</p>
                                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                              </div>
                              <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{t("careerTracks.durationMonths", { n: s.duration_months })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">{t("careerTracks.actionsSection")}</h4>
                      <div className="space-y-1.5">
                        {tActions.map(a => (
                          <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="text-sm text-foreground flex-1">{a.action_text}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-accent text-muted-foreground">{a.category}</span>
                            <button onClick={() => deleteActionMutation.mutate(a.id)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <input type="text" placeholder={t("careerTracks.addActionPlaceholder")} value={actionTexts[tpl.id] || ""}
                          onChange={e => setActionTexts({ ...actionTexts, [tpl.id]: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === "Enter" && actionTexts[tpl.id]?.trim()) {
                              addActionMutation.mutate({ templateId: tpl.id, text: actionTexts[tpl.id].trim() });
                              setActionTexts({ ...actionTexts, [tpl.id]: "" });
                            }
                          }}
                          className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                        <button onClick={() => {
                          if (actionTexts[tpl.id]?.trim()) {
                            addActionMutation.mutate({ templateId: tpl.id, text: actionTexts[tpl.id].trim() });
                            setActionTexts({ ...actionTexts, [tpl.id]: "" });
                          }
                        }} className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>

                    {/* Assigned employees */}
                    {tAssignments.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2">{t("careerTracks.assignedSection")}</h4>
                        <div className="space-y-1.5">
                          {tAssignments.map(a => {
                            const p = profileMap[a.user_id];
                            return (
                              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">
                                  {p?.full_name?.charAt(0) || "?"}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-foreground">{p?.full_name || "—"}</p>
                                  <p className="text-xs text-muted-foreground">{p?.position || ""}</p>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === "completed" ? "bg-success/20 text-success" : a.status === "paused" ? "bg-warning/20 text-warning" : "bg-info/20 text-info"}`}>
                                  {a.status === "completed" ? t("careerTracks.statusCompleted") : a.status === "paused" ? t("careerTracks.statusPaused") : t("careerTracks.statusActive")}
                                </span>
                                <span className="text-xs text-muted-foreground">{t("careerTracks.step", { n: a.current_step + 1 })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments tab */}
      {tab === "assignments" && (
        <div className="space-y-3">
          {assignments.length === 0 && (
            <div className="bg-card rounded-xl p-12 text-center border border-border">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">{t("careerTracks.emptyAssignments")}</h3>
              <p className="text-sm text-muted-foreground">{t("careerTracks.emptyAssignmentsHint")}</p>
            </div>
          )}
          {assignments.map(a => {
            const p = profileMap[a.user_id];
            const tpl = templates.find(tpl => tpl.id === a.template_id);
            return (
              <div key={a.id} className="bg-card rounded-xl p-5 shadow-card border border-border flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                  {p?.full_name?.charAt(0) || "?"}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{p?.full_name || "—"}</h3>
                  <p className="text-xs text-muted-foreground">{p?.position || ""} · {tpl?.title || "—"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === "completed" ? "bg-success/20 text-success" : "bg-info/20 text-info"}`}>
                  {a.status === "completed" ? t("careerTracks.statusCompleted") : t("careerTracks.statusActive")}
                </span>
                <span className="text-sm text-foreground font-medium">{t("careerTracks.step", { n: a.current_step + 1 })}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAssignModal(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground mb-4">{t("careerTracks.assignModalTitle")}</h3>
            <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm mb-4">
              <option value="">{t("careerTracks.selectEmployee")}</option>
              {profiles.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name} — {p.position || "—"}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAssignModal(null)} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">{t("careerTracks.cancelBtn")}</button>
              <button onClick={() => assignMutation.mutate({ templateId: assignModal, userId: assignUserId })}
                disabled={!assignUserId || assignMutation.isPending}
                className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50">
                {assignMutation.isPending ? "..." : t("careerTracks.assignBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CareerTracksManagement;
