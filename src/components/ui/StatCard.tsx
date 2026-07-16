import React from "react";
import { Card } from "./Card";
import { cn } from "@/lib/utils";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
    // positive semantics: is "up" good or bad?
    upIsGood?: boolean;
  };
  sparklineData?: { v: number }[];
  className?: string;
}

const iconColorMap: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "var(--accent-blue)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
  trend,
  sparklineData,
  className,
}: StatCardProps) {
  const trendColor = trend
    ? trend.direction === "flat"
      ? "text-[var(--text-muted)]"
      : (trend.direction === "up") === (trend.upIsGood ?? true)
      ? "text-[var(--color-success)]"
      : "text-[var(--color-danger)]"
    : "";

  return (
    <Card className={cn("flex flex-col justify-between min-h-[110px]", className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <span style={{ color: iconColorMap[tone] }} className="flex items-center">
              {icon}
            </span>
          )}
          <div className="section-header">{label}</div>
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="data-value truncate">{value}</div>
          {hint && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</div>
          )}
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="w-24 h-8 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={iconColorMap[tone]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {trend && (
        <div className={cn("mt-2 text-xs flex items-center gap-1.5", trendColor)}>
          {trend.direction === "up" && <TrendingUp size={12} />}
          {trend.direction === "down" && <TrendingDown size={12} />}
          {trend.direction === "flat" && <Minus size={12} />}
          <span>{trend.label}</span>
        </div>
      )}
    </Card>
  );
}
