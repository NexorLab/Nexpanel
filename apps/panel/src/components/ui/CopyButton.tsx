import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import "./CopyButton.css";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Fallback for non-secure contexts
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export default function CopyButton({ value, label, className = "" }: CopyButtonProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const success = await copyToClipboard(value);
    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <button
      type="button"
      className={`copy-button${copied ? " copy-button-copied" : ""} ${className}`}
      onClick={handleCopy}
      title={copied ? t("common.copied") : label ?? t("common.copy")}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {label && <span>{copied ? t("common.copied") : label}</span>}
    </button>
  );
}
