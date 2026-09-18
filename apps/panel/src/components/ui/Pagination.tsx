import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import "./Pagination.css";

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, perPage, total, onChange }: PaginationProps) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (totalPages <= 1) {
    return null;
  }

  const start = (page - 1) * perPage + 1;
  const end = Math.min(total, page * perPage);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {start}–{end} {t("common.of")} {total}
      </span>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-button"
          disabled={page <= 1}
          aria-label={t("common.previous")}
          onClick={() => onChange(page - 1)}
        >
          <ChevronRight size={16} className="pagination-flip" />
        </button>

        <span className="pagination-page">
          {t("common.page")} {page} {t("common.of")} {totalPages}
        </span>

        <button
          type="button"
          className="pagination-button"
          disabled={page >= totalPages}
          aria-label={t("common.next")}
          onClick={() => onChange(page + 1)}
        >
          <ChevronLeft size={16} className="pagination-flip" />
        </button>
      </div>
    </div>
  );
}
