import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { kedo, KedoDocument, KEDO_ACTION_LABELS, KEDO_CATEGORY_LABELS, KEDO_STATUS_LABELS } from "@/integrations/laravel/kedo";
import SignDialog from "@/components/kedo/SignDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSignature, FileText, Loader2 } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", in_review: "secondary", signed: "default", rejected: "destructive", cancelled: "outline",
};

/** Личный кабинет КЭДО: документы на подпись, согласование и ознакомление. */
const MyDocuments = () => {
  const qc = useQueryClient();
  const [openDoc, setOpenDoc] = useState<KedoDocument | null>(null);
  const [signing, setSigning] = useState<KedoDocument | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["kedo.my"], queryFn: kedo.myDocuments });
  const docs = data?.data ?? [];
  const todo = docs.filter((d) => d.action_required);
  const rest = docs.filter((d) => !d.action_required);

  const { data: detail } = useQuery({
    queryKey: ["kedo.my.doc", openDoc?.id],
    queryFn: () => kedo.getDocument(openDoc!.id),
    enabled: !!openDoc,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["kedo.my"] });
    qc.invalidateQueries({ queryKey: ["kedo.my.doc"] });
  };

  const Row = ({ d }: { d: KedoDocument }) => (
    <Card className="overflow-hidden">
      <CardContent className="p-3 flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <button className="flex-1 min-w-0 text-left" onClick={() => setOpenDoc(d)}>
          <div className="font-medium truncate">{d.title}</div>
          <div className="text-xs text-muted-foreground">
            {KEDO_CATEGORY_LABELS[d.category] ?? d.category} · {d.number}
          </div>
        </button>
        <Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>{KEDO_STATUS_LABELS[d.status]}</Badge>
        {d.action_required && d.my_action && (
          <Button size="sm" onClick={() => setSigning(d)}>
            <FileSignature className="h-4 w-4 mr-1" /> {KEDO_ACTION_LABELS[d.my_action]}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Мои документы</h1>
        <p className="text-sm text-muted-foreground">Кадровые документы для подписания и ознакомления.</p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Документов пока нет.
        </div>
      ) : (
        <div className="space-y-6">
          {todo.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Требуют действия ({todo.length})</h2>
              {todo.map((d) => <Row key={d.id} d={d} />)}
            </section>
          )}
          {rest.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">История</h2>
              {rest.map((d) => <Row key={d.id} d={d} />)}
            </section>
          )}
        </div>
      )}

      {openDoc && (
        <Dialog open onOpenChange={(v) => !v && setOpenDoc(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{openDoc.title}</DialogTitle>
              <DialogDescription>
                № {openDoc.number} · {KEDO_STATUS_LABELS[openDoc.status]}
              </DialogDescription>
            </DialogHeader>
            <div
              className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-3"
              dangerouslySetInnerHTML={{ __html: detail?.document?.body_html ?? openDoc.body_html ?? "" }}
            />
            {(detail?.signatures ?? []).length > 0 && (
              <ScrollArea className="max-h-32">
                {detail!.signatures.map((s) => (
                  <div key={s.id} className="text-xs text-muted-foreground py-0.5">
                    {s.kind.toUpperCase()} · {s.name} · {s.signed_at}
                  </div>
                ))}
              </ScrollArea>
            )}
            {openDoc.action_required && openDoc.my_action && (
              <Button onClick={() => { setSigning(openDoc); setOpenDoc(null); }}>
                <FileSignature className="h-4 w-4 mr-1" /> {KEDO_ACTION_LABELS[openDoc.my_action]}
              </Button>
            )}
          </DialogContent>
        </Dialog>
      )}

      {signing && signing.my_action && (
        <SignDialog
          open
          onOpenChange={(v) => !v && setSigning(null)}
          documentId={signing.id}
          documentTitle={signing.title}
          action={signing.my_action}
          signatureKind={signing.signature_kind}
          onDone={refresh}
        />
      )}
    </div>
  );
};

export default MyDocuments;
