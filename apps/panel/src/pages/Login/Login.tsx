import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Languages, Moon, Sun, Zap } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import "./Login.css";

/**
 * Mock login: matches the mock API adapter credentials (admin/admin).
 * Will be replaced by POST /api/v1/auth/login in the backend phase.
 */
const MOCK_ACCOUNTS: Record<string, { password: string; role: "owner" | "viewer" }> = {
  admin: { password: "admin", role: "owner" },
  viewer: { password: "viewer", role: "viewer" },
};

export default function Login() {
  const { admin, login } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ??
    "/";

  if (admin) {
    return <Navigate to={from} replace />;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(false);

    // Simulated network latency; replaced by the real API in the backend phase
    window.setTimeout(() => {
      const account = MOCK_ACCOUNTS[username.trim().toLowerCase()];
      if (account && account.password === password) {
        login(
          {
            id: account.role === "owner" ? "admin-1" : "viewer-1",
            username: username.trim(),
            role: account.role,
          },
          "mock-token",
        );
        navigate(from, { replace: true });
      } else {
        setError(true);
        setSubmitting(false);
      }
    }, 400);
  }

  return (
    <div className="login-page">
      <div className="login-top-actions">
        <button
          type="button"
          className="login-icon-button"
          aria-label={t("common.language")}
          onClick={() => setLang(lang === "en" ? "fa" : "en")}
        >
          <Languages size={18} />
        </button>
        <button
          type="button"
          className="login-icon-button"
          aria-label={t("common.theme")}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="login-logo">
            <Zap size={24} strokeWidth={2.4} />
          </div>
          <h1>NexPanel</h1>
        </div>

        <div className="login-heading">
          <h2>{t("login.title")}</h2>
          <p>{t("login.subtitle")}</p>
        </div>

        {error && (
          <div className="login-error" role="alert">
            {t("login.invalidCredentials")}
          </div>
        )}

        <label className="login-field">
          <span>{t("login.username")}</span>
          <input
            type="text"
            value={username}
            autoComplete="username"
            placeholder={t("login.usernamePlaceholder")}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>

        <label className="login-field">
          <span>{t("login.password")}</span>
          <div className="login-password">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="current-password"
              placeholder={t("login.passwordPlaceholder")}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="login-password-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <button type="submit" className="login-submit" disabled={submitting}>
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>

        <p className="login-hint">{t("login.demoHint")}</p>
      </form>
    </div>
  );
}
