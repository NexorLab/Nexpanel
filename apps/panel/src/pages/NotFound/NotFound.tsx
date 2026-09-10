import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import "./NotFound.css";

export default function NotFound() {
  const { t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <div className="notfound-code">404</div>
        <h2>{t("notFound.title")}</h2>
        <p>{t("notFound.description")}</p>
        <a href="/">{t("notFound.goHome")}</a>
      </div>

      <button
        type="button"
        className="notfound-theme-toggle"
        aria-label={t("common.theme")}
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {resolvedTheme === "dark" ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
