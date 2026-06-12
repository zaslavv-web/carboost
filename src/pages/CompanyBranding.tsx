import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Palette, RotateCcw, Wand2 } from "lucide-react";
import { laravel } from "@/integrations/laravel/client";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { useBranding, type CompanyBranding } from "@/contexts/BrandingContext";
import {
  extractDominantColor,
  hexToHsl,
  hslToHex,
  hslToVar,
  varToHsl,
} from "@/lib/color";
import { translateBackendError } from "@/lib/translateBackendError";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_BYTES = 800 * 1024; // 800 KB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const CompanyBrandingPage = () => {
  const { t } = useTranslation();
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const { branding, refetch } = useBranding();
  const companyId = profile?.company_id ?? null;

  const canEdit = role === "hrd" || role === "company_admin" || role === "superadmin";

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [primaryHex, setPrimaryHex] = useState<string>("#D4AF37");
  const [accentHex, setAccentHex] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const fileLightRef = useRef<HTMLInputElement>(null);
  const fileDarkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!branding) return;
    setLogoUrl(branding.logo_url);
    setLogoDarkUrl(branding.logo_dark_url);
    const p = varToHsl(branding.primary_hsl);
    if (p) setPrimaryHex(hslToHex(p));
    const a = varToHsl(branding.accent_hsl);
    setAccentHex(a ? hslToHex(a) : "");
  }, [branding]);

  const primaryHsl = useMemo(() => hexToHsl(primaryHex), [primaryHex]);
  const accentHsl = useMemo(() => (accentHex ? hexToHsl(accentHex) : null), [accentHex]);

  const onPickFile = async (variant: "light" | "dark", file: File | null) => {
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error("Поддерживаются только PNG, JPG, SVG или WebP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Файл слишком большой (максимум 800 КБ)");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    if (variant === "light") setLogoUrl(dataUrl);
    else setLogoDarkUrl(dataUrl);
  };

  const autoExtract = async () => {
    if (!logoUrl) {
      toast.error("Сначала загрузите логотип");
      return;
    }
    toast.loading("Подбираем цвет из логотипа…", { id: "extract" });
    const hsl = await extractDominantColor(logoUrl);
    toast.dismiss("extract");
    if (!hsl) {
      toast.error("Не удалось определить доминирующий цвет");
      return;
    }
    setPrimaryHex(hslToHex(hsl));
    toast.success("Цвет подобран — не забудьте сохранить");
  };

  const save = async () => {
    if (!companyId) return;
    if (!primaryHsl) {
      toast.error("Неверный фирменный цвет");
      return;
    }
    setSaving(true);
    const payload: Partial<CompanyBranding> = {
      logo_url: logoUrl,
      logo_dark_url: logoDarkUrl,
      primary_hsl: hslToVar(primaryHsl),
      primary_glow_hsl: hslToVar({
        h: primaryHsl.h,
        s: primaryHsl.s,
        l: Math.min(100, primaryHsl.l + 12),
      }),
      accent_hsl: accentHsl ? hslToVar(accentHsl) : null,
    };
    const { error } = await laravel.put(`/companies/${companyId}/branding`, payload);
    setSaving(false);
    if (error) {
      toast.error(translateBackendError(error.message));
      return;
    }
    await refetch();
    toast.success("Брендинг компании обновлён");
  };

  const reset = async () => {
    if (!companyId) return;
    if (!confirm("Сбросить фирменный стиль к значениям по умолчанию?")) return;
    setSaving(true);
    const { error } = await laravel.delete(`/companies/${companyId}/branding`);
    setSaving(false);
    if (error) {
      toast.error(translateBackendError(error.message));
      return;
    }
    setLogoUrl(null);
    setLogoDarkUrl(null);
    setPrimaryHex("#D4AF37");
    setAccentHex("");
    await refetch();
    toast.success("Фирменный стиль сброшен");
  };

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">
          Доступ к настройке фирменного стиля есть только у HRD, администратора компании и суперадмина.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Фирменный стиль компании</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Загрузите логотип и задайте основной цвет — интерфейс автоматически перекрасится для всех сотрудников вашей компании.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Логотип
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <LogoSlot
              label="Для светлой темы"
              previewBg="bg-white border border-border"
              url={logoUrl}
              onPick={(f) => onPickFile("light", f)}
              onClear={() => setLogoUrl(null)}
              inputRef={fileLightRef}
            />
            <LogoSlot
              label="Для тёмной темы (опционально)"
              previewBg="bg-[hsl(220_11%_14%)]"
              url={logoDarkUrl}
              onPick={(f) => onPickFile("dark", f)}
              onClear={() => setLogoDarkUrl(null)}
              inputRef={fileDarkRef}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Рекомендуем квадратный PNG/SVG ≤ 800&nbsp;КБ. Если тёмный вариант не задан — будет использоваться основной логотип.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" /> Фирменный цвет
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="primary">Основной (акцент)</Label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  id="primary"
                  type="color"
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  className="h-10 w-14 rounded border border-border bg-transparent cursor-pointer"
                />
                <Input
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  className="w-32"
                />
                <Button type="button" variant="outline" size="sm" onClick={autoExtract}>
                  <Wand2 className="w-4 h-4 mr-1" /> Из логотипа
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="accent">Дополнительный (необязательно)</Label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  id="accent"
                  type="color"
                  value={accentHex || "#778899"}
                  onChange={(e) => setAccentHex(e.target.value)}
                  className="h-10 w-14 rounded border border-border bg-transparent cursor-pointer"
                />
                <Input
                  value={accentHex}
                  placeholder="Не задан"
                  onChange={(e) => setAccentHex(e.target.value)}
                  className="w-32"
                />
                {accentHex && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAccentHex("")}>
                    Очистить
                  </Button>
                )}
              </div>
            </div>
          </div>

          <BrandPreview primaryHex={primaryHex} accentHex={accentHex} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={reset} disabled={saving}>
          <RotateCcw className="w-4 h-4 mr-1" /> Сбросить
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t("actions.save")}
        </Button>
      </div>
    </div>
  );
};

interface LogoSlotProps {
  label: string;
  previewBg: string;
  url: string | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const LogoSlot = ({ label, previewBg, url, onPick, onClear, inputRef }: LogoSlotProps) => (
  <div>
    <p className="text-sm font-medium text-foreground mb-2">{label}</p>
    <div className={`rounded-lg p-6 flex items-center justify-center min-h-[120px] ${previewBg}`}>
      {url ? (
        <img src={url} alt="logo preview" className="max-h-20 max-w-full object-contain" />
      ) : (
        <p className="text-xs text-muted-foreground">Логотип не загружен</p>
      )}
    </div>
    <div className="flex items-center gap-2 mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="w-4 h-4 mr-1" /> Загрузить
      </Button>
      {url && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Удалить
        </Button>
      )}
    </div>
  </div>
);

const BrandPreview = ({ primaryHex, accentHex }: { primaryHex: string; accentHex: string }) => {
  const p = hexToHsl(primaryHex);
  if (!p) return null;
  const primaryVar = hslToVar(p);
  const accent = accentHex ? hexToHsl(accentHex) : null;
  return (
    <div
      className="rounded-lg border border-border p-4 flex flex-wrap items-center gap-3"
      style={{ ["--demo-primary" as any]: primaryVar }}
    >
      <div
        className="h-10 px-4 rounded-md flex items-center text-sm font-medium"
        style={{ background: `hsl(${primaryVar})`, color: "white" }}
      >
        Основная кнопка
      </div>
      <div
        className="h-10 px-4 rounded-md flex items-center text-sm border"
        style={{ borderColor: `hsl(${primaryVar})`, color: `hsl(${primaryVar})` }}
      >
        Вторичная
      </div>
      <div
        className="h-10 px-3 rounded-md flex items-center text-xs"
        style={{ background: `hsl(${primaryVar} / 0.15)`, color: `hsl(${primaryVar})` }}
      >
        Бейдж / чип
      </div>
      {accent && (
        <div
          className="h-10 px-3 rounded-md flex items-center text-xs"
          style={{
            background: `hsl(${hslToVar(accent)})`,
            color: "white",
          }}
        >
          Акцент
        </div>
      )}
    </div>
  );
};

export default CompanyBrandingPage;
