import { useState, useEffect, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Languages, Moon, Sun, Zap } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { getApi } from "../../lib/api";
import "./Login.css";

type LoginMode = "loading" | "login" | "setup";

/**
 * Login / first-run setup. On mount the page asks the API whether any
 * admin exists: if not it shows the setup form that creates the first
 * owner; otherwise the normal login form. Both go through ApiClient, so
 * switching from the mock adapter to the real HTTP backend changes
 * nothing here.
 */
export default function Login() {
  const { admin, login } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<LoginMode>("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ??
    "/";

  useEffect(() => {
    let cancelled = false;
    getApi()
      .getAuthStatus()
      .then((status) => {
        if (!cancelled) setMode(status.needsSetup ? "setup" : "login");
      })
      .catch(() => {
        // Backend unreachable: default to the login form.
        if (!cancelled) setMode("login");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (admin) {
    return <Navigate to={from} replace />;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === "setup") {
      if (password !== confirmPassword) {
        setError(t("login.passwordMismatch"));
        return;
      }
      setSubmitting(true);
      getApi()
        .setup({ username: username.trim(), password })
        .then((result) => {
          login(result.admin, result.token);
          navigate(from, { replace: true });
        })
        .catch((err: Error) => {
          if (err.message === "SETUP_ALREADY_DONE") {
            setMode("login");
          } else {
            setError(t("login.setupFailed"));
          }
          setSubmitting(false);
        });
      return;
    }

    setSubmitting(true);
    getApi()
      .login({ username: username.trim(), password })
      .then((result) => {
        login(result.admin, result.token);
        navigate(from, { replace: true });
      })
      .catch(() => {
        setError(t("login.invalidCredentials"));
        setSubmitting(false);
      });
  }

  const isSetup = mode === "setup";

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
          <h2>{isSetup ? t("login.setupTitle") : t("login.title")}</h2>
          <p>{isSetup ? t("login.setupSubtitle") : t("login.subtitle")}</p>
        </div>

        {mode === "loading" ? null : (
          <>
            {error && (
              <div className="login-error" role="alert">
                {error}
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
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  placeholder={t("login.passwordPlaceholder")}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={isSetup ? 8 : undefined}
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

            {isSetup && (
              <label className="login-field">
                <span>{t("login.confirmPassword")}</span>
                <div className="login-password">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    autoComplete="new-password"
                    placeholder={t("login.passwordPlaceholder")}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </label>
            )}

            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting
                ? isSetup
                  ? t("login.setupSubmitting")
                  : t("login.submitting")
                : isSetup
                  ? t("login.setupSubmit")
                  : t("login.submit")}
            </button>

            {!isSetup && <p className="login-hint">{t("login.demoHint")}</p>}
          </>
        )}
      </form>
    </div>
  );
}
