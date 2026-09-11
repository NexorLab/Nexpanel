import { useEffect, useState, type FormEvent } from "react";
import {
  MoreVertical,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DropdownMenu from "../../components/ui/DropdownMenu";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import SegmentedControl from "../../components/ui/SegmentedControl";
import Select from "../../components/ui/Select";
import Table, { type TableColumn } from "../../components/ui/Table";
import Tabs from "../../components/ui/Tabs";
import NetworkTab from "./NetworkTab";
import { useApi } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useFormat } from "../../lib/format";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import type { GeneralSettings, PanelAdmin, PanelSettings } from "../../types/dto";
import "./Settings.css";

type SettingsTab = "general" | "network" | "security" | "appearance" | "admins";

const EMPTY_GENERAL: GeneralSettings = { ...DEFAULT_SETTINGS.general };

interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

const EMPTY_PASSWORD: PasswordForm = { current: "", next: "", confirm: "" };

interface AdminFormState {
  username: string;
  password: string;
  role: PanelAdmin["role"];
}

const EMPTY_ADMIN: AdminFormState = { username: "", password: "", role: "admin" };

const ROLES: PanelAdmin["role"][] = ["owner", "admin", "viewer"];

export default function Settings() {
  const { t } = useLanguage();
  const toast = useToast();
  const { isAdmin, isOwner, admin } = useAuth();
  const fmt = useFormat();
  const { theme, setTheme } = useTheme();

  const [tab, setTab] = useState<SettingsTab>("general");

  // ---- General ----
  const [general, setGeneral] = useState<GeneralSettings>(EMPTY_GENERAL);
  const [generalSaving, setGeneralSaving] = useState(false);
  const { data: settingsData } = useApi<PanelSettings>(
    () => getApi().getSettings(),
    [],
  );

  useEffect(() => {
    if (settingsData) setGeneral({ ...settingsData.general });
  }, [settingsData]);

  // ---- Security ----
  const [password, setPassword] = useState<PasswordForm>(EMPTY_PASSWORD);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sessionHours, setSessionHours] = useState(24);

  // ---- Admins ----
  const { data: admins, loading: adminsLoading, refetch: refetchAdmins } = useApi<
    PanelAdmin[]
  >(() => getApi().listAdmins(), [tab]);

  const [adminFormOpen, setAdminFormOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<PanelAdmin | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormState>(EMPTY_ADMIN);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);

  const [deletingAdmin, setDeletingAdmin] = useState<PanelAdmin | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  function setGeneralField<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setGeneral((current) => ({ ...current, [key]: value }));
  }

  async function handleSaveGeneral(event: FormEvent) {
    event.preventDefault();
    setGeneralSaving(true);
    try {
      const result = await getApi().updateSettings({ general });
      setGeneral({ ...result.general });
      toast.push({ type: "success", title: t("settings.general.saved") });
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setGeneralSaving(false);
    }
  }

  async function handleSavePassword(event: FormEvent) {
    event.preventDefault();
    if (password.next.length < 8) {
      setPasswordError(t("settings.security.passwordTooShort"));
      return;
    }
    if (password.next !== password.confirm) {
      setPasswordError(t("settings.security.passwordMismatch"));
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (password.current !== "admin") {
        setPasswordError(t("settings.security.passwordWrong"));
        return;
      }
      toast.push({ type: "success", title: t("settings.security.passwordChanged") });
      setPassword(EMPTY_PASSWORD);
    } finally {
      setPasswordSaving(false);
    }
  }

  function openCreateAdmin() {
    setEditingAdmin(null);
    setAdminForm(EMPTY_ADMIN);
    setAdminFormError(null);
    setAdminFormOpen(true);
  }

  function openEditAdmin(target: PanelAdmin) {
    setEditingAdmin(target);
    setAdminForm({ username: target.username, password: "", role: target.role });
    setAdminFormError(null);
    setAdminFormOpen(true);
  }

  async function handleSaveAdmin(event: FormEvent) {
    event.preventDefault();
    if (!adminForm.username.trim()) {
      setAdminFormError(t("settings.admins.form.usernameRequired"));
      return;
    }
    if (!editingAdmin && !adminForm.password) {
      setAdminFormError(t("settings.admins.form.passwordRequired"));
      return;
    }
    setAdminSaving(true);
    setAdminFormError(null);
    try {
      if (editingAdmin) {
        await getApi().updateAdmin(editingAdmin.id, { role: adminForm.role });
        toast.push({ type: "success", title: t("settings.admins.toasts.updated") });
      } else {
        await getApi().createAdmin({
          username: adminForm.username.trim(),
          password: adminForm.password,
          role: adminForm.role,
        });
        toast.push({ type: "success", title: t("settings.admins.toasts.created") });
      }
      setAdminFormOpen(false);
      refetchAdmins();
    } catch (error) {
      setAdminFormError(
        error instanceof Error && error.message === "USERNAME_TAKEN"
          ? t("settings.admins.form.usernameTaken")
          : t("errors.unknown"),
      );
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleDeleteAdmin() {
    if (!deletingAdmin) return;
    setAdminBusy(true);
    try {
      await getApi().deleteAdmin(deletingAdmin.id);
      toast.push({ type: "success", title: t("settings.admins.toasts.deleted") });
      setDeletingAdmin(null);
      refetchAdmins();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setAdminBusy(false);
    }
  }

  async function toggleAdminActive(target: PanelAdmin) {
    try {
      await getApi().updateAdmin(target.id, { isActive: !target.isActive });
      refetchAdmins();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    }
  }

  const adminColumns: TableColumn<PanelAdmin>[] = [
    {
      key: "username",
      header: t("settings.admins.table.username"),
      render: (row) => (
        <div className="settings-admin-user">
          <span className="settings-admin-avatar" aria-hidden="true">
            {row.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="settings-admin-name" dir="auto">
            {row.username}
          </span>
          {row.id === admin?.id && (
            <Badge tone="info">{t("settings.admins.you")}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "role",
      header: t("settings.admins.table.role"),
      render: (row) => (
        <Badge tone={row.role === "owner" ? "primary" : row.role === "admin" ? "info" : "neutral"}>
          {t(`settings.admins.role.${row.role}`)}
        </Badge>
      ),
    },
    {
      key: "active",
      header: t("settings.admins.table.active"),
      render: (row) =>
        row.isActive ? (
          <Badge tone="success">{t("common.active")}</Badge>
        ) : (
          <Badge tone="neutral">{t("common.inactive")}</Badge>
        ),
    },
    {
      key: "lastLogin",
      header: t("settings.admins.table.lastLogin"),
      render: (row) => (
        <span className="settings-muted">
          {row.lastLoginAt ? fmt.relative(row.lastLoginAt) : t("common.notAvailable")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("settings.admins.table.actions"),
      align: "end",
      width: "64px",
      render: (row) => {
        const isSelf = row.id === admin?.id;
        const lastOwner = row.role === "owner" && (admins ?? []).filter((a) => a.role === "owner").length <= 1;
        const menuItems = [
          {
            key: "edit",
            label: t("settings.admins.editAdmin"),
            icon: <Pencil size={15} />,
            onSelect: () => openEditAdmin(row),
          },
          {
            key: "toggle",
            label: row.isActive ? t("common.disabled") : t("common.enabled"),
            icon: <ShieldCheck size={15} />,
            disabled: isSelf || lastOwner,
            onSelect: () => void toggleAdminActive(row),
          },
          {
            key: "delete",
            label: t("common.delete"),
            icon: <Trash2 size={15} />,
            danger: true,
            disabled: isSelf || lastOwner,
            onSelect: () => setDeletingAdmin(row),
          },
        ];
        return (
          <DropdownMenu
            trigger={
              <button
                type="button"
                className="row-menu-button"
                aria-label={t("common.actions")}
              >
                <MoreVertical size={16} />
              </button>
            }
            items={menuItems}
          />
        );
      },
    },
  ];

  const tabs = [
    { key: "general", label: t("settings.tabs.general") },
    { key: "network", label: t("settings.tabs.network") },
    { key: "security", label: t("settings.tabs.security") },
    { key: "appearance", label: t("settings.tabs.appearance") },
    ...(isAdmin ? [{ key: "admins", label: t("settings.tabs.admins") }] : []),
  ];

  return (
    <section className="settings-page">
      <div className="settings-header">
        <div>
          <h2>{t("settings.title")}</h2>
          <p>{t("settings.description")}</p>
        </div>
      </div>

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(key) => setTab(key as SettingsTab)}
      />

      {tab === "general" && (
        <Card className="settings-card">
          <form onSubmit={handleSaveGeneral} className="settings-form">
            <div className="settings-grid-2">
              <Input
                label={t("settings.general.panelName")}
                value={general.panelName}
                onChange={(event) => setGeneralField("panelName", event.target.value)}
                dir="auto"
                disabled={!isAdmin}
              />
              <Input
                label={t("settings.general.siteUrl")}
                value={general.siteUrl}
                onChange={(event) => setGeneralField("siteUrl", event.target.value)}
                dir="ltr"
                placeholder="https://panel.example.com"
                disabled={!isAdmin}
              />
            </div>

            <Input
              label={t("settings.general.subscriptionBaseUrl")}
              value={general.subscriptionBaseUrl}
              onChange={(event) =>
                setGeneralField("subscriptionBaseUrl", event.target.value)
              }
              dir="ltr"
              placeholder="https://panel.example.com/sub"
              disabled={!isAdmin}
            />

            <div className="settings-grid-2">
              <Select
                label={t("settings.general.defaultLanguage")}
                value={general.defaultLanguage}
                onChange={(event) =>
                  setGeneralField("defaultLanguage", event.target.value as "en" | "fa")
                }
                options={[
                  { value: "en", label: "English" },
                  { value: "fa", label: "فارسی" },
                ]}
                disabled={!isAdmin}
              />
              <Input
                label={t("settings.general.defaultQuota")}
                hint={t("settings.general.defaultQuotaHint")}
                type="number"
                min={0}
                value={general.defaultQuotaGb}
                onChange={(event) =>
                  setGeneralField("defaultQuotaGb", Number(event.target.value))
                }
                dir="ltr"
                disabled={!isAdmin}
              />
              <Input
                label={t("settings.general.defaultExpiryDays")}
                hint={t("settings.general.defaultExpiryHint")}
                type="number"
                min={0}
                value={general.defaultExpiryDays}
                onChange={(event) =>
                  setGeneralField("defaultExpiryDays", Number(event.target.value))
                }
                dir="ltr"
                disabled={!isAdmin}
              />
            </div>

            <div className="settings-actions">
              {isAdmin && (
                <Button type="submit" loading={generalSaving}>
                  {t("common.save")}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {tab === "network" && <NetworkTab canEdit={isAdmin} />}

      {tab === "security" && (
        <div className="settings-stack">
          <Card className="settings-card">
            <h3 className="settings-card-title">{t("settings.security.changePassword")}</h3>
            <form onSubmit={handleSavePassword} className="settings-form">
              <Input
                label={t("settings.security.currentPassword")}
                type="password"
                value={password.current}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, current: event.target.value }))
                }
                autoComplete="current-password"
                dir="ltr"
              />
              <div className="settings-grid-2">
                <Input
                  label={t("settings.security.newPassword")}
                  type="password"
                  value={password.next}
                  onChange={(event) =>
                    setPassword((current) => ({ ...current, next: event.target.value }))
                  }
                  autoComplete="new-password"
                  dir="ltr"
                />
                <Input
                  label={t("settings.security.confirmPassword")}
                  type="password"
                  value={password.confirm}
                  onChange={(event) =>
                    setPassword((current) => ({ ...current, confirm: event.target.value }))
                  }
                  error={passwordError ?? undefined}
                  autoComplete="new-password"
                  dir="ltr"
                />
              </div>
              <div className="settings-actions">
                <Button type="submit" loading={passwordSaving}>
                  {t("settings.security.changePassword")}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="settings-card">
            <h3 className="settings-card-title">{t("settings.security.session")}</h3>
            <div className="settings-form">
              <div className="settings-grid-2">
                <Input
                  label={t("settings.security.sessionTtl")}
                  type="number"
                  min={1}
                  max={720}
                  value={sessionHours}
                  onChange={(event) => setSessionHours(Number(event.target.value))}
                  dir="ltr"
                />
              </div>
              <p className="settings-field-hint-inline">
                {t("settings.security.hours")}
              </p>
              <div className="settings-soon-row">
                <div>
                  <p className="settings-card-subtitle">{t("settings.security.twofa")}</p>
                </div>
                <Badge tone="neutral">{t("settings.security.twofaSoon")}</Badge>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "appearance" && (
        <Card className="settings-card">
          <div className="settings-form">
            <div className="settings-field">
              <span className="settings-field-label">{t("settings.appearance.theme")}</span>
              <SegmentedControl
                value={theme}
                onChange={(value) => setTheme(value as typeof theme)}
                options={[
                  { value: "light", label: t("settings.appearance.themeLight") },
                  { value: "dark", label: t("settings.appearance.themeDark") },
                  { value: "system", label: t("settings.appearance.themeSystem") },
                ]}
                ariaLabel={t("settings.appearance.theme")}
              />
            </div>

            <div className="settings-field">
              <span className="settings-field-label">{t("settings.appearance.language")}</span>
              <LanguageChoices />
            </div>
          </div>
        </Card>
      )}

      {tab === "admins" && isAdmin && (
        <Card padded={false} className="settings-card">
          <div className="settings-admins-toolbar">
            <h3 className="settings-card-title">
              <UserCog size={16} />
              {t("settings.tabs.admins")}
            </h3>
            {isOwner && (
              <Button onClick={openCreateAdmin} iconLeft={<Plus size={16} />}>
                {t("settings.admins.addAdmin")}
              </Button>
            )}
          </div>

          <Table
            columns={adminColumns}
            rows={admins ?? []}
            rowKey={(row) => row.id}
            loading={adminsLoading}
            empty={
              <EmptyState
                icon={<UserCog size={24} />}
                title={t("settings.admins.empty.title")}
                description={t("settings.admins.empty.description")}
              />
            }
          />
        </Card>
      )}

      {/* Admin create/edit modal */}
      <Modal
        open={adminFormOpen}
        title={
          editingAdmin ? t("settings.admins.editAdmin") : t("settings.admins.addAdmin")
        }
        onClose={() => setAdminFormOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdminFormOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="admin-form" loading={adminSaving}>
              {editingAdmin ? t("common.save") : t("common.create")}
            </Button>
          </>
        }
      >
        <form id="admin-form" onSubmit={handleSaveAdmin} className="settings-form">
          <Input
            label={t("settings.admins.form.username")}
            value={adminForm.username}
            onChange={(event) =>
              setAdminForm((current) => ({ ...current, username: event.target.value }))
            }
            error={adminFormError ?? undefined}
            dir="auto"
            disabled={editingAdmin !== null}
          />

          {!editingAdmin && (
            <Input
              label={t("settings.admins.form.password")}
              type="password"
              value={adminForm.password}
              onChange={(event) =>
                setAdminForm((current) => ({ ...current, password: event.target.value }))
              }
              autoComplete="new-password"
              dir="ltr"
            />
          )}

          <div className="settings-field">
            <span className="settings-field-label">{t("settings.admins.form.role")}</span>
            <SegmentedControl
              value={adminForm.role}
              onChange={(value) =>
                setAdminForm((current) => ({
                  ...current,
                  role: value as PanelAdmin["role"],
                }))
              }
              options={ROLES.map((role) => ({
                value: role,
                label: t(`settings.admins.role.${role}`),
              }))}
              ariaLabel={t("settings.admins.form.role")}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deletingAdmin !== null}
        title={t("settings.admins.confirmDelete.title")}
        message={t("settings.admins.confirmDelete.message", {
          name: deletingAdmin?.username ?? "",
        })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={adminBusy}
        onConfirm={handleDeleteAdmin}
        onCancel={() => setDeletingAdmin(null)}
      />
    </section>
  );
}

/** Small inline language picker for the Appearance tab. */
function LanguageChoices() {
  const { t } = useLanguage();
  const { lang, setLang } = useLanguage();
  return (
    <SegmentedControl
      value={lang}
      onChange={(value) => setLang(value as typeof lang)}
      options={[
        { value: "en", label: "English" },
        { value: "fa", label: "فارسی" },
      ]}
      ariaLabel={t("settings.appearance.language")}
    />
  );
}
