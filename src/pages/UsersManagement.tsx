import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravel } from "@/integrations/laravel/client";
import { laravelAuthApi } from "@/integrations/laravel/auth";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Eye, Loader2, Search, CheckCircle, XCircle, Trash2, UserPlus, X, KeyRound, IdCard } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserProfile";
import { useRealPrimaryRole } from "@/hooks/useUserProfile";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/ui/responsive-table";

type StatusFilter = "all" | "verified" | "pending";

const UsersManagement = () => {
  const { t } = useTranslation("admin");
  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const realRole = useRealPrimaryRole();
  const isSuperadmin = realRole === "superadmin";

  const roleLabelMap: Record<string, string> = {
    employee: t("users.roleEmployee"),
    manager: t("users.roleManager"),
    hrd: t("users.roleHrd"),
    company_admin: t("users.roleCompanyAdmin"),
    superadmin: t("users.roleSuperadmin"),
  };

  const roleBadge: Record<string, { label: string; cls: string }> = {
    employee: { label: t("users.roleEmployee"), cls: "bg-secondary text-secondary-foreground" },
    manager: { label: t("users.roleManager"), cls: "bg-info/10 text-info" },
    hrd: { label: t("users.roleHrd"), cls: "bg-warning/10 text-warning" },
    company_admin: { label: t("users.roleCompanyAdmin"), cls: "bg-primary/10 text-primary" },
    superadmin: { label: t("users.roleSuperadmin"), cls: "bg-destructive/10 text-destructive" },
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>(
    () => searchParams.get("companyId") || "all"
  );
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  // Sync company filter from URL (?companyId=...) — enables quick-filter deep-linking from Companies list.
  useEffect(() => {
    const cid = searchParams.get("companyId");
    if (cid && cid !== companyFilter) {
      setCompanyFilter(cid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateCompanyFilter = (value: string) => {
    setCompanyFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("companyId");
    else next.set("companyId", value);
    setSearchParams(next, { replace: true });
  };

  const { data: companies = [] } = useQuery({
    queryKey: ["companies_list"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("companies").select("id, name");
      if (error) return [];
      return data || [];
    },
    enabled: isSuperadmin,
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin_users_list"],
    queryFn: async () => {
      const [profilesRes, rolesRes, emailsRes] = await Promise.all([
        laravelDb.from("profiles").select("*"),
        laravelDb.from("user_roles").select("user_id, role"),
        laravel.get<{ data: any[] } | any[]>("/profiles?per_page=500"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const roleMap = new Map<string, AppRole>();
      for (const r of rolesRes.data) {
        const current = roleMap.get(r.user_id);
        const priority: Record<string, number> = { superadmin: 5, company_admin: 4, hrd: 3, manager: 2, employee: 1 };
        if (!current || priority[r.role as string] > (priority[current] || 0)) {
          roleMap.set(r.user_id, r.role as AppRole);
        }
      }

      const emailMap = new Map<string, string>();
      const emailItems: any[] = Array.isArray(emailsRes.data)
        ? (emailsRes.data as any[])
        : ((emailsRes.data as any)?.data || []);
      for (const p of emailItems) {
        if (p?.user_id && p?.email) emailMap.set(p.user_id, p.email);
      }

      return (profilesRes.data || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id) || "employee",
        email: emailMap.get(p.user_id) || null,
      }));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await laravelRpc("verify_user", { _target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success(t("users.toastVerified"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await laravelRpc("reject_user", { _target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success(t("users.toastRejected"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { user: currentUser } = useAuth();

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await laravelRpc("delete_user", { _target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success(t("users.toastDeleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await laravelAuthApi.adminSendPasswordReset(userId);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        data?.email
          ? t("users.toastResetSentEmail", { email: data.email })
          : t("users.toastResetSent"),
      );
    },
    onError: (e: any) => toast.error(e.message || t("users.toastResetFail")),
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await laravelRpc("assign_role", { _target_user_id: userId, _new_role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success(t("users.toastRoleChanged"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignCompanyMutation = useMutation({
    mutationFn: async ({ userId, companyId }: { userId: string; companyId: string | null }) => {
      const { error } = await laravelAuthApi.adminAssignCompany(userId, companyId);
      if (error) {
        const err: any = new Error(error.message);
        err.status = (error as any).status;
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success(t("users.toastCompanyUpdated"));
    },
    onError: (e: any) => {
      const msg = String(e?.message || "");
      if (e?.status === 404 || /could not be found|route .* not found/i.test(msg)) {
        toast.error(t("users.toastCompanyEndpointError"));
        return;
      }
      toast.error(msg || t("users.toastCompanyFail"));
    },
  });

  const departments = Array.from(
    new Set(users.map((u: any) => (u.department || "").trim()).filter(Boolean)),
  ).sort() as string[];

  const filtered = users.filter((u: any) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      u.full_name.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q) ||
      (u.position || "").toLowerCase().includes(q) ||
      roleLabelMap[u.role]?.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "verified" && u.is_verified) ||
      (statusFilter === "pending" && !u.is_verified);
    const matchesCompany =
      companyFilter === "all" ||
      (companyFilter === "none" && !u.company_id) ||
      u.company_id === companyFilter;
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesDepartment =
      departmentFilter === "all" ||
      (departmentFilter === "none" && !(u.department || "").trim()) ||
      (u.department || "").trim() === departmentFilter;
    return matchesSearch && matchesStatus && matchesCompany && matchesRole && matchesDepartment;
  });

  const pendingCount = users.filter((u: any) => !u.is_verified).length;

  const handleImpersonate = async (user: any) => {
    try {
      await startImpersonation(user.user_id, user.full_name, {
        roles: [user.role],
        profile: user,
      });
      navigate("/dashboard");
    } catch {
      /* toast shown inside startImpersonation */
    }
  };

  const statusFilters: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: t("users.filterAll"), count: users.length },
    { value: "pending", label: t("users.filterPending"), count: pendingCount },
    { value: "verified", label: t("users.filterVerified"), count: users.length - pendingCount },
  ];

  // ---- Create user dialog ----
  const [createOpen, setCreateOpen] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("employee");
  const [newCompanyId, setNewCompanyId] = useState<string>("");

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await laravelAuthApi.adminCreateUser({
        full_name: newFullName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole as any,
        company_id: isSuperadmin ? (newCompanyId || null) : undefined,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      toast.success(t("users.toastCreated"));
      setCreateOpen(false);
      setNewFullName("");
      setNewEmail("");
      setNewRole("employee");
      setNewCompanyId("");
    },
    onError: (e: any) => toast.error(e.message || t("users.toastCreateFail")),
  });

  const canCreate = newFullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("users.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("users.subtitle")}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> {t("users.createBtn")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("users.searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-secondary text-sm text-foreground border-none focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="all">{t("users.allRoles")}</option>
            {Object.entries(roleLabelMap).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-secondary text-sm text-foreground border-none focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="all">{t("users.allDepts")}</option>
            <option value="none">{t("users.noDept")}</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {isSuperadmin && companies.length > 0 && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary text-sm text-foreground border-none focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="all">{t("users.allCompanies")}</option>
              <option value="none">{t("users.noCompany")}</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {(roleFilter !== "all" || departmentFilter !== "all" || companyFilter !== "all" || statusFilter !== "all" || search) && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCompanyFilter("all");
                setRoleFilter("all");
                setDepartmentFilter("all");
              }}
              className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              {t("users.resetFilters")}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <ResponsiveTable
            items={filtered}
            tableMinWidth={900}
            table={
              <>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("users.colUser")}</th>
                    {isSuperadmin && <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("users.colCompany")}</th>}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("users.colDept")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("users.colRole")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("users.colStatus")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("users.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u: any) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">{u.position || "—"}</p>
                        {u.email && (
                          <a href={`mailto:${u.email}`} className="text-xs text-primary hover:underline">
                            {u.email}
                          </a>
                        )}
                      </td>
                      {isSuperadmin && (
                        <td className="px-4 py-3">
                          <select
                            value={u.company_id || ""}
                            onChange={(e) =>
                              assignCompanyMutation.mutate({
                                userId: u.user_id,
                                companyId: e.target.value || null,
                              })
                            }
                            disabled={assignCompanyMutation.isPending}
                            className="px-2 py-1 rounded border border-input bg-background text-foreground text-xs max-w-[180px]"
                          >
                            <option value="">{t("users.noCompanyOption")}</option>
                            {companies.map((c: any) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="px-4 py-3 text-foreground">{u.department || "—"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => assignRoleMutation.mutate({ userId: u.user_id, role: e.target.value as AppRole })}
                          className="px-2 py-1 rounded border border-input bg-background text-foreground text-xs"
                        >
                          {Object.entries(roleLabelMap).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_verified ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            {t("users.verified")}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => verifyMutation.mutate(u.user_id)}
                              disabled={verifyMutation.isPending}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> {t("users.confirm")}
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(u.user_id)}
                              disabled={rejectMutation.isPending}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" /> {t("users.reject")}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            to={`/users/${u.user_id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
                          >
                            <IdCard className="w-3.5 h-3.5" /> Карточка
                          </Link>
                          <button
                            onClick={() => handleImpersonate(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> {t("users.impersonate")}
                          </button>
                          <button
                            onClick={() => resetPasswordMutation.mutate(u.user_id)}
                            disabled={resetPasswordMutation.isPending && resetPasswordMutation.variables === u.user_id}
                            title={t("users.resetPasswordTitle")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors disabled:opacity-50"
                          >
                            {resetPasswordMutation.isPending && resetPasswordMutation.variables === u.user_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="w-3.5 h-3.5" />
                            )}
                            {t("users.resetPassword")}
                          </button>
                        </div>
                        {u.user_id !== currentUser?.id && (
                          confirmDeleteId === u.user_id ? (
                            <div className="flex items-center gap-1 mt-1.5">
                              <button
                                onClick={() => { deleteMutation.mutate(u.user_id); setConfirmDeleteId(null); }}
                                disabled={deleteMutation.isPending}
                                className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
                              >
                                {t("users.deleteConfirmYes")}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                              >
                                {t("users.cancel")}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(u.user_id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 mt-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> {t("users.delete")}
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            }
            renderCard={(u: any) => (
              <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.position || "—"}</p>
                    {u.email && (
                      <a href={`mailto:${u.email}`} className="text-xs text-primary hover:underline break-all">
                        {u.email}
                      </a>
                    )}
                  </div>
                  {u.is_verified ? (
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                      {t("users.verified")}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-1">{t("users.colDept")}</p>
                    <p className="text-foreground">{u.department || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">{t("users.colRole")}</p>
                    <select
                      value={u.role}
                      onChange={(e) => assignRoleMutation.mutate({ userId: u.user_id, role: e.target.value as AppRole })}
                      className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-xs"
                    >
                      {Object.entries(roleLabelMap).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  {isSuperadmin && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground mb-1">{t("users.colCompany")}</p>
                      <select
                        value={u.company_id || ""}
                        onChange={(e) =>
                          assignCompanyMutation.mutate({
                            userId: u.user_id,
                            companyId: e.target.value || null,
                          })
                        }
                        disabled={assignCompanyMutation.isPending}
                        className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-xs"
                      >
                        <option value="">{t("users.noCompanyOption")}</option>
                        {companies.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {!u.is_verified && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => verifyMutation.mutate(u.user_id)}
                      disabled={verifyMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> {t("users.confirm")}
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(u.user_id)}
                      disabled={rejectMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" /> {t("users.reject")}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border">
                  <Link
                    to={`/users/${u.user_id}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
                  >
                    <IdCard className="w-3.5 h-3.5" /> Карточка
                  </Link>
                  <button
                    onClick={() => handleImpersonate(u)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> {t("users.impersonate")}
                  </button>
                  <button
                    onClick={() => resetPasswordMutation.mutate(u.user_id)}
                    disabled={resetPasswordMutation.isPending && resetPasswordMutation.variables === u.user_id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors disabled:opacity-50"
                  >
                    {resetPasswordMutation.isPending && resetPasswordMutation.variables === u.user_id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    {t("users.resetPassword")}
                  </button>
                  {u.user_id !== currentUser?.id && (
                    confirmDeleteId === u.user_id ? (
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => { deleteMutation.mutate(u.user_id); setConfirmDeleteId(null); }}
                          disabled={deleteMutation.isPending}
                          className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
                        >
                          {t("users.deleteConfirmYes")}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                        >
                          {t("users.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(u.user_id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 ml-auto rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t("users.delete")}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          />
          <div className="px-1 pt-3 text-sm text-muted-foreground">
            {t("users.shownOf", { filtered: filtered.length, total: users.length })}
          </div>
        </>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => !createUserMutation.isPending && setCreateOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{t("users.createDialogTitle")}</h2>
              <button
                onClick={() => setCreateOpen(false)}
                disabled={createUserMutation.isPending}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("users.labelFullName")}</label>
                <input
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder={t("users.fullNamePlaceholder")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("users.labelEmail")}</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("users.labelRole")}</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AppRole)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {Object.entries(roleLabelMap)
                    .filter(([val]) => val !== "superadmin" || isSuperadmin)
                    .map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                </select>
              </div>

              {isSuperadmin && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("users.labelCompany")}</label>
                  <select
                    value={newCompanyId}
                    onChange={(e) => setNewCompanyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">{t("users.noCompanyOpt")}</option>
                    {companies.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-1">
                {t("users.inviteHint")}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCreateOpen(false)}
                disabled={createUserMutation.isPending}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                {t("users.cancel")}
              </button>
              <button
                onClick={() => createUserMutation.mutate()}
                disabled={!canCreate || createUserMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createUserMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("users.createAndInvite")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
