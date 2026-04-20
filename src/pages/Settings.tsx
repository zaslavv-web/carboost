import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Camera, Save, User } from "lucide-react";

const Settings = () => {
  const { user } = useAuth();
  const { data: profile, isLoading } = useUserProfile();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [positionId, setPositionId] = useState<string>("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: positions = [], isLoading: positionsLoading } = useQuery({
    queryKey: ["positions_for_settings", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("id, title, department")
        .eq("company_id", profile.company_id)
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  if (profile && !initialized) {
    setFullName(profile.full_name || "");
    setPositionId(profile.position_id || "");
    setAvatarPreview(profile.avatar_url);
    setInitialized(true);
  }

  const selectedPosition = useMemo(
    () => positions.find((p) => p.id === positionId),
    [positions, positionId],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Максимальный размер файла — 2 МБ");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      let avatarUrl = profile?.avatar_url || null;

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const companySegment = profile?.company_id ?? user.id;
        const path = `${companySegment}/${user.id}/avatar.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          position_id: positionId || null,
          position: selectedPosition?.title ?? "",
          department: selectedPosition?.department ?? "",
          avatar_url: avatarUrl,
        })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Профиль обновлён");
      setAvatarFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Настройки профиля</h1>
        <p className="text-muted-foreground text-sm mt-1">Обновите ваши личные данные</p>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden group"
        >
          {avatarPreview ? (
            <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-muted-foreground" />
          )}
          <div className="absolute inset-0 bg-foreground/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-6 h-6 text-primary-foreground" />
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <p className="text-xs text-muted-foreground">Нажмите для загрузки (макс. 2 МБ). Форматы: JPG, PNG, GIF, WebP</p>
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <label className="text-sm font-medium text-foreground">Полное имя</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={100}
            className="w-full mt-1.5 px-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Должность</label>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            disabled={positionsLoading || positions.length === 0}
            className="w-full mt-1.5 px-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50"
          >
            <option value="">— Выберите должность —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}{p.department ? ` · ${p.department}` : ""}
              </option>
            ))}
          </select>
          {!positionsLoading && positions.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              В компании пока нет должностей. Их создаёт HRD в разделе «Должности».
            </p>
          )}
          {selectedPosition?.department && (
            <p className="mt-1 text-xs text-muted-foreground">
              Отдел: <span className="text-foreground">{selectedPosition.department}</span>
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </form>
    </div>
  );
};

export default Settings;
