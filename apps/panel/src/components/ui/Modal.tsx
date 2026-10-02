import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./Modal.css";

export type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: ModalProps) {
  // Stable identity: parents pass inline arrow functions, so `onClose` would
  // otherwise change on every render and re-trigger the effect below — which
  // steals focus from the input the user is typing into (one char, then re-click).
  const handleClose = useCallback(() => onClose(), [onClose]);

  // Only focus the modal when it *opens*. Re-running on every render yanks focus
  // away from a text input the user is actively typing in.
  const previousOpen = useRef(open);

  useEffect(() => {
    if (!open) {
      previousOpen.current = false;
      return;
    }

    const isOpening = !previousOpen.current;
    previousOpen.current = true;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    // Focus the modal container for keyboard users — only on open.
    if (isOpening) {
      const modal = document.querySelector(".modal-box");
      (modal as HTMLElement | null)?.focus();
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={handleClose}>
      <div
        className={`modal-box modal-size-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
