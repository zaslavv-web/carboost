import { useEffect, useState } from "react";
import { security, type TwoFactorStatus } from "@/integrations/laravel/security";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Copy, Loader2 } from "lucide-react";

/**
 * Личная настройка второго фактора (TOTP): секрет → подтверждение кодом → резервные коды.
 * QR рисуется внешним сервисом не используется — показываем секрет и otpauth-ссылку.
 */
export const TwoFactorCard = () => {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const load = async () => {
    try {
      setStatus(await security.twoFactorStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await security.twoFactorSetup();
      setSecret(res.secret);
      setOtpauth(res.otpauth_url);
      setBackupCodes(null);
    } catch (e: any) {
      toast.error(e.message || "Не удалось начать настройку");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await security.twoFactorConfirm(code.trim());
      setBackupCodes(res.backup_codes);
      setSecret(null);
      setCode("");
      toast.success("Двухфакторная аутентификация включена");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Неверный код");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await security.twoFactorDisable(code.trim());
      setCode("");
      toast.success("Двухфакторная аутентификация отключена");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Неверный код");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {status?.enabled ? <ShieldCheck className="h-5 w-5 text-primary" /> : <ShieldAlert className="h-5 w-5 text-muted-foreground" />}
              Двухфакторная аутентификация
            </CardTitle>
            <CardDescription>
              Одноразовые коды из приложения-аутентификатора (Google Authenticator, Яндекс.Ключ, 1Password).
            </CardDescription>
          </div>
          {status?.enabled ? <Badge>Включена</Badge> : <Badge variant="outline">Выключена</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {!loading && !status?.enabled && !secret && (
          <Button onClick={startSetup} disabled={busy}>Настроить</Button>
        )}

        {secret && (
          <div className="space-y-3">
            <div>
              <Label>Секретный ключ</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={secret} className="font-mono" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { navigator.clipboard.writeText(secret); toast.success("Скопировано"); }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {otpauth && (
                <p className="text-xs text-muted-foreground mt-1 break-all">
                  Или откройте ссылку в приложении: {otpauth}
                </p>
              )}
            </div>
            <div>
              <Label>Код из приложения</Label>
              <div className="flex gap-2 mt-1">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} />
                <Button onClick={confirm} disabled={busy || code.trim().length < 6}>Подтвердить</Button>
              </div>
            </div>
          </div>
        )}

        {backupCodes && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">Резервные коды — сохраните их сейчас</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-sm">
              {backupCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(backupCodes.join("\n")); toast.success("Скопировано"); }}
            >
              <Copy className="h-4 w-4 mr-2" /> Скопировать все
            </Button>
          </div>
        )}

        {status?.enabled && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">
              Осталось резервных кодов: {status.backup_codes_left}
            </p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Код для отключения"
                className="max-w-xs"
              />
              <Button variant="destructive" onClick={disable} disabled={busy || !code.trim()}>Отключить</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TwoFactorCard;
