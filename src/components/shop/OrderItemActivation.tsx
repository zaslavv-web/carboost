import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Sparkles, Truck, FileText, Handshake } from "lucide-react";
import { toast } from "sonner";

export type OrderItemRow = {
  id: string;
  product_title: string;
  fulfillment_kind?: string | null;
  activation_status?: string | null;
  activation_data?: any;
  fulfillment_ref_type?: string | null;
};

const KIND_META: Record<string, { label: string; icon: any; hint: string }> = {
  material: {
    label: "Материальный товар",
    icon: Truck,
    hint: "Укажите, где и когда вам удобно получить товар — HR получит уведомление.",
  },
  workflow: {
    label: "Рабочий процесс",
    icon: FileText,
    hint: "При активации автоматически формируется документ-согласование в вашем личном деле.",
  },
  partner: {
    label: "Закупка у партнёра",
    icon: Handshake,
    hint: "Ответственному сотруднику создана задача на закупку — активация не требуется.",
  },
  digital: {
    label: "Цифровой товар",
    icon: Sparkles,
    hint: "Активируйте, чтобы зафиксировать использование.",
  },
};

export function OrderItemActivation({ item, canActivate }: { item: OrderItemRow; canActivate: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState("");
  const [time, setTime] = useState("");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState("");

  const kind = (item.fulfillment_kind ?? "material") as keyof typeof KIND_META;
  const meta = KIND_META[kind] ?? KIND_META.material;
  const Icon = meta.icon;
  const status = item.activation_status ?? "pending";

  const activate = useMutation({
    mutationFn: async () => {
      const details = kind === "material" ? { place, time } : { comment, date };
      const { data, error } = await laravelRpc("activate_order_item", {
        _item_id: item.id,
        _details: details,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(kind === "workflow" ? "Активировано, документ сформирован" : "Товар активирован");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["shop_order"] });
      qc.invalidateQueries({ queryKey: ["shop_orders_my"] });
      qc.invalidateQueries({ queryKey: ["hr_documents"] });
    },
    onError: (e: any) => toast.error(e.message || "Не удалось активировать"),
  });

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" /> {item.product_title}
        </span>
        {status === "activated" ? (
          <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Активировано</Badge>
        ) : status === "processing" ? (
          <Badge variant="secondary">В обработке</Badge>
        ) : (
          <Badge variant="outline">Требует активации</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{meta.label}. {meta.hint}</p>

      {status === "activated" && item.activation_data && (
        <p className="text-xs text-muted-foreground">
          {typeof item.activation_data === "string"
            ? item.activation_data
            : Object.entries(item.activation_data)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
        </p>
      )}

      {canActivate && status === "pending" && kind !== "partner" && (
        <Button size="sm" onClick={() => setOpen(true)}>Активировать</Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Активация: {item.product_title}</DialogTitle>
            <DialogDescription>{meta.hint}</DialogDescription>
          </DialogHeader>
          {kind === "material" ? (
            <div className="space-y-3">
              <div>
                <Label>Место получения *</Label>
                <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Например: офис, ресепшн 3 этаж" />
              </div>
              <div>
                <Label>Удобное время *</Label>
                <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="Например: 28 августа, после 15:00" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {kind === "workflow" && (
                <div>
                  <Label>Желаемая дата</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              )}
              <div>
                <Label>Комментарий</Label>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Детали для HR" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={() => activate.mutate()}
              disabled={activate.isPending || (kind === "material" && (!place.trim() || !time.trim()))}
            >
              Активировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
