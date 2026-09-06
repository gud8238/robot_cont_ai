import type { ReactNode } from "react";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "error" | "busy";
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}`} role="status" aria-live="polite" aria-atomic="true">
      <span className="status-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
