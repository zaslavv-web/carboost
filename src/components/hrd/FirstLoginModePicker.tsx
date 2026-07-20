import { useEffect, useState } from "react";
import { Sparkles, LayoutGrid } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { readHrdUiMode, writeHrdUiMode, type HrdUiMode } from "@/lib/hrdUiMode";

interface Props {
  onPick: (mode: HrdUiMode) => void;
}

/**
 * Shown once on first login for canary HRDs — asks whether to default the
 * workspace to Today (inbox-first) or Classic (full sidebar). The pick is
 * persisted locally so it doesn't fire again.
 */
const FirstLoginModePicker = ({ onPick }: Props) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readHrdUiMode() === null) setOpen(true);
  }, []);

  const choose = (mode: HrdUiMode) => {
    writeHrdUiMode(mode);
    setOpen(false);
    onPick(mode);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Как вам удобнее работать?</DialogTitle>
          <DialogDescription>
            Мы упростили интерфейс для HR. Выберите режим по умолчанию — сможете переключиться в любой момент из настроек.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <button
            type="button"
            onClick={() => choose("today")}
            className="text-left rounded-lg border border-border/60 hover:border-primary hover:bg-primary/5 transition-colors p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Ежедневный (Today)</span>
              <span className="text-[10px] rounded bg-primary/15 text-primary px-1.5 py-0.5">Рекомендуется</span>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Один экран: инбокс действий, KPI, быстрые действия. Модули — в 5 студиях слева.
            </p>
          </button>

          <button
            type="button"
            onClick={() => choose("classic")}
            className="text-left rounded-lg border border-border/60 hover:border-foreground/30 hover:bg-secondary/50 transition-colors p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Классический</span>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Полное боковое меню со всеми модулями — как сейчас.
            </p>
          </button>
        </div>

        <div className="text-[11px] text-muted-foreground text-center pt-1">
          Переключить режим можно в профиле.
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FirstLoginModePicker;
