import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
}

const MetricCard = ({ title, value, subtitle, icon: Icon, trend, className = "" }: MetricCardProps) => (
  <div className={`bg-card rounded-xl p-6 shadow-card border border-border animate-fade-in overflow-hidden ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground font-medium truncate">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>}
        {trend && (
          <p className={`text-xs font-medium mt-2 ${trend.positive ? "text-success" : "text-destructive"}`}>
            {trend.positive ? "↑" : "↓"} {trend.value}
          </p>
        )}
      </div>
      <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-accent-foreground" />
      </div>
    </div>
  </div>
);

export default MetricCard;
