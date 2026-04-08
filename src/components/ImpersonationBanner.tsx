import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Eye, X } from "lucide-react";

const ImpersonationBanner = () => {
  const { impersonatedName, stopImpersonation } = useImpersonation();

  if (!impersonatedName) return null;

  return (
    <div className="bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-warning font-medium">
        <Eye className="w-4 h-4" />
        <span>Вы просматриваете как: <strong>{impersonatedName}</strong></span>
      </div>
      <button
        onClick={stopImpersonation}
        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-warning/20 text-warning text-xs font-medium hover:bg-warning/30 transition-colors"
      >
        <X className="w-3 h-3" /> Выйти из режима
      </button>
    </div>
  );
};

export default ImpersonationBanner;
