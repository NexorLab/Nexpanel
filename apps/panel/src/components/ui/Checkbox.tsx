import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import "./Checkbox.css";

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function Checkbox({
  label,
  checked,
  onChange,
  id,
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const checkboxId = id ?? autoId;

  return (
    <label className="checkbox" htmlFor={checkboxId}>
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="checkbox-input"
        {...rest}
      />
      <span className="checkbox-box" aria-hidden="true">
        <svg viewBox="0 0 12 10" className="checkbox-check">
          <path
            d="M1 5.5 4.2 8.5 11 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  );
}
