import { useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import "./Select.css";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export default function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  className = "",
  id,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className={`select-group ${className}`}>
      {label && (
        <label className="select-label" htmlFor={selectId}>
          {label}
        </label>
      )}

      <div className={`select-wrap${error ? " has-error" : ""}`}>
        <select id={selectId} className="select" {...rest}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="select-chevron">
          <ChevronDown size={16} />
        </span>
      </div>

      {error ? (
        <span className="select-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="select-hint">{hint}</span>
      ) : null}
    </div>
  );
}
