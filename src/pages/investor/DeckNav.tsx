import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Printer, Pencil, RotateCcw, Download, Upload } from "lucide-react";
import { useDeckCtx } from "./deck/DeckContentContext";

export default function DeckNav({
  index,
  total,
  onPrev,
  onNext,
  onFullscreen,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onFullscreen: () => void;
}) {
  const { editMode, setEditMode, reset, exportJson, importJson } = useDeckCtx();
  const [visible, setVisible] = useState(true);
  const hideT = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const ping = () => {
      setVisible(true);
      if (hideT.current) window.clearTimeout(hideT.current);
      hideT.current = window.setTimeout(() => {
        if (!editMode) setVisible(false);
      }, 2800);
    };
    ping();
    window.addEventListener("mousemove", ping);
    window.addEventListener("keydown", ping);
    window.addEventListener("touchstart", ping);
    return () => {
      window.removeEventListener("mousemove", ping);
      window.removeEventListener("keydown", ping);
      window.removeEventListener("touchstart", ping);
      if (hideT.current) window.clearTimeout(hideT.current);
    };
  }, [editMode]);

  const doExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "investor-deck-edits.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    if (!importJson(text)) alert("Не удалось импортировать: неверный формат JSON");
    e.target.value = "";
  };

  const btn = "rounded-full p-2 text-[#1B1D22] hover:bg-[#D5A52A]/20";

  return (
    <div
      className={`fixed right-4 bottom-4 z-50 flex flex-col items-center gap-2 rounded-2xl border border-[#D5A52A]/40 bg-white/90 px-2 py-2 backdrop-blur shadow-lg transition-opacity duration-500 print:hidden ${
        visible || editMode ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onMouseEnter={() => setVisible(true)}
    >
      <button onClick={onPrev} className={`${btn} disabled:opacity-30`} disabled={index === 0} title="Предыдущий">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="min-w-[3rem] text-center font-mono text-[12px] text-[#1B1D22]">
        {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
      </span>
      <button onClick={onNext} className={`${btn} disabled:opacity-30`} disabled={index === total - 1} title="Следующий">
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="my-1 h-px w-6 bg-[#D5A52A]/40" />

      <button
        onClick={() => setEditMode(!editMode)}
        className={`rounded-full p-2 hover:bg-[#D5A52A]/20 ${editMode ? "bg-[#D5A52A]/25 text-[#8C6A1A]" : "text-[#1B1D22]"}`}
        title={editMode ? "Выключить режим редактирования" : "Режим редактирования"}
      >
        <Pencil className="h-4 w-4" />
      </button>
      {editMode && (
        <>
          <button onClick={doExport} className={btn} title="Экспорт правок (JSON)">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={doImport} className={btn} title="Импорт правок (JSON)">
            <Upload className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onFile} className="hidden" />
          <button
            onClick={() => { if (confirm("Сбросить все правки к исходному варианту?")) reset(); }}
            className={btn}
            title="Сбросить правки"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </>
      )}

      <div className="my-1 h-px w-6 bg-[#D5A52A]/40" />

      <button onClick={onFullscreen} className={btn} title="Полноэкранный режим (F)">
        <Maximize2 className="h-4 w-4" />
      </button>
      <button onClick={() => window.print()} className={btn} title="Сохранить в PDF">
        <Printer className="h-4 w-4" />
      </button>
    </div>
  );
}
