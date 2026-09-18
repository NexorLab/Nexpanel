import { useId } from "react";
import "./ProgressBar.css";

export type ProgressBarTone = "primary" | "success" | "warning" | "danger";

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  tone?: ProgressBarTone;
  label?: string;
  height?: number;
}

export function progressTone(value: number): ProgressBarTone {
  if (value >= 95) return "danger";
  if (value >= 80) return "warning";
  return "primary";
}

export default function ProgressBar({
  value,
  tone,
  label,
  height = 6,
}: ProgressBarProps) {
  const id = useId();
  const clamped = Math.min(100, Math.max(0, value));
  const effectiveTone = tone ?? progressTone(clamped);

  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? id}
    >
      <div
        className={`progress-fill progress-${effectiveTone}`}
        style={{ width: `${clamped}%`, height }}
      />
    </div>
  );
}
