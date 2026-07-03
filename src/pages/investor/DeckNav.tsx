import { ChevronLeft, ChevronRight, Maximize2, Printer } from "lucide-react";

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
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#D5A52A]/30 bg-[#1B1D22]/90 px-4 py-2 backdrop-blur print:hidden">
      <button
        onClick={onPrev}
        className="rounded-full p-2 text-[#F5F1E8] hover:bg-[#D5A52A]/20 disabled:opacity-30"
        disabled={index === 0}
        aria-label="Prev"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="min-w-[3.5rem] text-center font-mono text-sm text-[#F5F1E8]">
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      <button
        onClick={onNext}
        className="rounded-full p-2 text-[#F5F1E8] hover:bg-[#D5A52A]/20 disabled:opacity-30"
        disabled={index === total - 1}
        aria-label="Next"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="mx-1 h-6 w-px bg-[#D5A52A]/30" />
      <button
        onClick={onFullscreen}
        className="rounded-full p-2 text-[#F5F1E8] hover:bg-[#D5A52A]/20"
        aria-label="Fullscreen"
        title="Полноэкранный режим"
      >
        <Maximize2 className="h-5 w-5" />
      </button>
      <button
        onClick={() => window.print()}
        className="rounded-full p-2 text-[#F5F1E8] hover:bg-[#D5A52A]/20"
        aria-label="Print"
        title="Сохранить в PDF (Cmd/Ctrl+P)"
      >
        <Printer className="h-5 w-5" />
      </button>
    </div>
  );
}
