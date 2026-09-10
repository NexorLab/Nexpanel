import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AdminRole = "owner" | "admin" | "viewer";

export interface Admin {
  id: string;
  username: string;
  role: AdminRole;
}

interface AuthContextValue {
  admin: Admin | null;
  token: string | null;
  login: (admin: Admin, token: string) => void;
  logout: () => void;
  isAdmin: boolean;
  isOwner: boolean;
}

const TOKEN_KEY = "nexpanel.token";
const ADMIN_KEY = "nexpanel.admin";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): { admin: Admin | null; token: string | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawAdmin = localStorage.getItem(ADMIN_KEY);
    if (token && rawAdmin) {
      const admin = JSON.parse(rawAdmin) as Admin;
      if (admin && admin.id && admin.username) {
        return { admin, token };
      }
    }
  } catch {
    // corrupted state — treat as signed out
  }
  return { admin: null, token: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => readStoredAuth());

  const login = useCallback((admin: Admin, token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
    } catch {
      // persistence is best-effort; session still works in memory
    }
    setState({ admin, token });
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ADMIN_KEY);
    } catch {
      // ignore
    }
    setState({ admin: null, token: null });
  }, []);

  const value = useMemo(
    () => ({
      admin: state.admin,
      token: state.token,
      login,
      logout,
      isAdmin: state.admin?.role === "owner" || state.admin?.role === "admin",
      isOwner: state.admin?.role === "owner",
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
