import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} size="sm">
      <div className="confirm-dialog">
        {danger && (
          <div className="confirm-icon">
            <AlertTriangle size={22} />
          </div>
        )}
        <p className="confirm-message">{message}</p>
      </div>

      <div className="confirm-actions">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel ?? "Cancel"}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}
