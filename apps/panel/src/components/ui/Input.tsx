import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import "./Input.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export default function Input({
  label,
  error,
  hint,
  iconStart,
  iconEnd,
  className = "",
  id,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const hasIcon = Boolean(iconStart || iconEnd);

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label className="input-label" htmlFor={inputId}>
          {label}
        </label>
      )}

      <div className={`input-wrap${hasIcon ? " has-icon" : ""}${error ? " has-error" : ""}`}>
        {iconStart && <span className="input-icon input-icon-start">{iconStart}</span>}
        <input id={inputId} className="input" {...rest} />
        {iconEnd && <span className="input-icon input-icon-end">{iconEnd}</span>}
      </div>

      {error ? (
        <span className="input-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="input-hint">{hint}</span>
      ) : null}
    </div>
  );
}
