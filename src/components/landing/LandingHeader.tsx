import { Link } from "react-router-dom";
import { Briefcase } from "lucide-react";

interface Props {
  onOpenDemo?: () => void;
  showAnchors?: boolean;
}

const LandingHeader = ({ onOpenDemo, showAnchors = true }: Props) => (
  <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
    <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-tight">Карьерный трек</span>
      </Link>
      {showAnchors && (
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#pains" className="hover:text-foreground transition-colors">Решения</a>
          <a href="#features" className="hover:text-foreground transition-colors">Инструменты</a>
          <a href="#roles" className="hover:text-foreground transition-colors">Истории</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
      )}
      <div className="flex items-center gap-2">
        {onOpenDemo && (
          <button
            onClick={onOpenDemo}
            className="hidden sm:inline-flex px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-secondary transition-colors"
          >
            Запросить демо
          </button>
        )}
        <Link
          to="/login"
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Войти
        </Link>
      </div>
    </div>
  </header>
);

export default LandingHeader;
