import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useNavigate } from "react-router-dom";
import { Eye, ArrowLeft } from "lucide-react";

const ImpersonationBanner = () => {
  const { impersonatedName, stopImpersonation } = useImpersonation();
  const navigate = useNavigate();

  if (!impersonatedName) return null;

  const handleReturn = () => {
    stopImpersonation();
    navigate("/users");
  };

  return (
    <div className="bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-warning font-medium">
        <Eye className="w-4 h-4" />
        <span>Вы просматриваете как: <strong>{impersonatedName}</strong></span>
      </div>
      <button
        onClick={handleReturn}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
      >
        <ArrowLeft className="w-3 h-3" /> Вернуться в суперадмин
      </button>
    </div>
  );
};

export default ImpersonationBanner;
