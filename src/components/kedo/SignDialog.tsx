import { useState } from "react";
import { kedo, KedoAction, KedoSignatureKind } from "@/integrations/laravel/kedo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, X } from "lucide-react";

interface SignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  action: KedoAction;
  signatureKind: KedoSignatureKind;
  onDone: () => void;
}

/** Подписание документа: ПЭП по коду, УКЭП открепленным файлом, согласование/ознакомление и отказ. */
export const SignDialog = ({
  open, onOpenChange, documentId, documentTitle, action, signatureKind, onDone,
}: SignDialogProps) => {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [certSubject, setCertSubject] = useState("");
  const [certSerial, setCertSerial] = useState("");
  const [reason, setReason] = useState("");

  const close = () => {
    setCode(""); setOtpSent(false); setSigFile(null);
    setCertSubject(""); setCertSerial(""); setReason("");
    onOpenChange(false);
  };

  const run = async (fn: () => Promise<unknown>, successText: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successText);
      onDone();
      close();
    } catch (e: any) {
      toast.error(e?.message || "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async () => {
    setBusy(true);
    try {
      const res = await kedo.requestOtp(documentId);
      setOtpSent(true);
      toast.success(`Код отправлен на вашу почту. Код: ${res.code}`, { duration: 15000 });
    } catch (e: any) {
      toast.error(e?.message || "Не удалось запросить код");
    } finally {
      setBusy(false);
    }
  };

  const allowUkep = signatureKind === "ukep" || signatureKind === "any";
  const allowPep = signatureKind !== "ukep";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {action === "sign" ? "Подписание документа" : action === "approve" ? "Согласование документа" : "Ознакомление с документом"}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{documentTitle}</DialogDescription>
        </DialogHeader>

        {action !== "sign" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {action === "approve"
                ? "Подтвердите согласование документа или отклоните его с указанием причины."
                : "Подтвердите факт ознакомления с документом."}
            </p>
            <Textarea placeholder="Причина отказа (для отклонения)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() => run(() => kedo.reject(documentId, reason), "Документ отклонён")}
              >
                <X className="h-4 w-4 mr-1" /> Отклонить
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    () => (action === "approve" ? kedo.approve(documentId) : kedo.acknowledge(documentId)),
                    action === "approve" ? "Документ согласован" : "Ознакомление зафиксировано",
                  )
                }
              >
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {action === "approve" ? "Согласовать" : "Ознакомлен(а)"}
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue={allowPep ? "pep" : "ukep"}>
            <TabsList className="w-full">
              {allowPep && <TabsTrigger value="pep" className="flex-1">ПЭП (код)</TabsTrigger>}
              {allowUkep && <TabsTrigger value="ukep" className="flex-1">УКЭП (файл подписи)</TabsTrigger>}
            </TabsList>

            {allowPep && (
              <TabsContent value="pep" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Подпись фиксирует ваш IP, устройство, время и хэш документа.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Код из письма"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                  />
                  <Button variant="outline" onClick={requestOtp} disabled={busy}>
                    <KeyRound className="h-4 w-4 mr-1" /> {otpSent ? "Ещё раз" : "Получить код"}
                  </Button>
                </div>
                <Button
                  className="w-full"
                  disabled={busy || code.trim().length < 4}
                  onClick={() => run(() => kedo.signPep(documentId, code.trim()), "Документ подписан")}
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                  Подписать ПЭП
                </Button>
              </TabsContent>
            )}

            {allowUkep && (
              <TabsContent value="ukep" className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label>Файл открепленной подписи (.sig / .p7s)</Label>
                  <Input type="file" accept=".sig,.p7s,.sgn,application/octet-stream" onChange={(e) => setSigFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Владелец сертификата</Label>
                  <Input value={certSubject} onChange={(e) => setCertSubject(e.target.value)} placeholder="CN=Иванов Иван Иванович" />
                </div>
                <div className="space-y-1.5">
                  <Label>Серийный номер сертификата</Label>
                  <Input value={certSerial} onChange={(e) => setCertSerial(e.target.value)} placeholder="00A1B2..." />
                </div>
                <Button
                  className="w-full"
                  disabled={busy || !sigFile}
                  onClick={() =>
                    run(
                      () => kedo.signUkep(documentId, sigFile as File, { cert_subject: certSubject, cert_serial: certSerial }),
                      "УКЭП принята",
                    )
                  }
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                  Приложить УКЭП
                </Button>
              </TabsContent>
            )}

            <div className="pt-4 border-t mt-4 space-y-2">
              <Textarea placeholder="Причина отказа от подписания" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button
                variant="outline"
                className="w-full"
                disabled={busy || !reason.trim()}
                onClick={() => run(() => kedo.reject(documentId, reason), "Документ отклонён")}
              >
                <X className="h-4 w-4 mr-1" /> Отказаться от подписания
              </Button>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SignDialog;
