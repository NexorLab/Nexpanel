import type { ReactNode } from "react";
import "./SegmentedControl.css";

interface SegmentedControlProps {
  options: { value: string; label: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}

export default function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: SegmentedControlProps) {
  return (
    <div
      className={`segmented segmented-${size}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-option${value === option.value ? " segmented-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
