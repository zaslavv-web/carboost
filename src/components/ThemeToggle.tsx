import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className = "" }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className={`relative p-2 rounded-lg hover:bg-secondary transition-colors focus-glow ${className}`}
    >
      <Sun className={`w-5 h-5 text-warning transition-all ${theme === "dark" ? "opacity-0 scale-0 rotate-90 absolute" : "opacity-100 scale-100 rotate-0"}`} />
      <Moon className={`w-5 h-5 text-primary transition-all ${theme === "dark" ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-0 -rotate-90 absolute"}`} />
    </button>
  );
};

export default ThemeToggle;
