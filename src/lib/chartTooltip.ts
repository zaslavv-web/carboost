import type { CSSProperties } from "react";

export const chartTooltipContentStyle: CSSProperties = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,.25)",
  fontSize: 12,
  padding: "8px 10px",
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: "hsl(var(--foreground))",
  fontWeight: 600,
  marginBottom: 4,
};

export const chartTooltipItemStyle: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
};

export const chartTooltipCursorBar = { fill: "hsl(var(--muted) / 0.35)" };
export const chartTooltipCursorLine = { stroke: "hsl(var(--border))" };

export function tooltipProps(kind: "bar" | "line" | "none" = "bar") {
  const base = {
    contentStyle: chartTooltipContentStyle,
    labelStyle: chartTooltipLabelStyle,
    itemStyle: chartTooltipItemStyle,
  };
  if (kind === "bar") return { ...base, cursor: chartTooltipCursorBar };
  if (kind === "line") return { ...base, cursor: chartTooltipCursorLine };
  return base;
}
