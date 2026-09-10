import { useState, type FormEvent } from "react";
import {
  Ban,
  CheckCircle2,
  KeyRound,
  MoreVertical,
  Pencil,
  RefreshCcw,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import Card from "../../components/ui/Card";
import Table, { type TableColumn } from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DropdownMenu from "../../components/ui/DropdownMenu";
import Pagination from "../../components/ui/Pagination";
import Switch from "../../components/ui/Switch";
import ProgressBar from "../../components/ui/ProgressBar";
import EmptyState from "../../components/ui/EmptyState";
import CopyButton from "../../components/ui/CopyButton";
import { useApi, useDebouncedValue } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { useFormat, bytesToGb } from "../../lib/format";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type { ConfigUser, Paginated } from "../../types/dto";
import "./Users.css";

interface UserFormState {
  username: string;
  note: string;
  quotaGb: number;
  expiryDate: string;
  ipLimit: number;
  enabled: boolean;
}

const EMPTY_FORM: UserFormState = {
  username: "",
  note: "",
  quotaGb: 0,
  expiryDate: "",
  ipLimit: 0,
  enabled: true,
};

const STATUS_TONES: Record<ConfigUser["status"], "success" | "neutral" | "warning" | "danger"> = {
  active: "success",
  disabled: "neutral",
  expired: "warning",
  limited: "danger",
};

function dateToUnix(dateString: string): number | null {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime())
    ? null
    : Math.floor(parsed.getTime() / 1000);
}

function unixToDateInput(unix: number | null): string {
  if (!unix) return "";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export default function Users() {
  const { t } = useLanguage();
  const format = useFormat();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const { data, loading, refetch } = useApi<Paginated<ConfigUser>>(
    () =>
      getApi().listUsers({
        search: debouncedSearch || undefined,
        status: statusFilter,
        page,
        perPage: 8,
      }),
    [debouncedSearch, statusFilter, page],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigUser | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ConfigUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const users = data?.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(user: ConfigUser) {
    setEditing(user);
    setForm({
      username: user.username,
      note: user.note ?? "",
      quotaGb: Math.round(bytesToGb(user.quotaBytes) * 100) / 100,
      expiryDate: unixToDateInput(user.expiryAt),
      ipLimit: user.ipLimit,
      enabled: user.status === "active",
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form.username.trim()) {
      setFormError(t("users.form.usernameRequired"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await getApi().updateUser(editing.id, {
          username: form.username.trim(),
          note: form.note || null,
          quotaGb: form.quotaGb,
          expiryAt: dateToUnix(form.expiryDate),
          ipLimit: form.ipLimit,
          enabled: form.enabled,
        });
        toast.push({ type: "success", title: t("users.toasts.updated") });
      } else {
        await getApi().createUser({
          username: form.username.trim(),
          note: form.note || undefined,
          quotaGb: form.quotaGb,
          expiryDays: form.expiryDate
            ? Math.max(
                1,
                Math.round(
                  (dateToUnix(form.expiryDate)! - Date.now() / 1000) / 86400,
                ),
              )
            : null,
          ipLimit: form.ipLimit,
          enabled: form.enabled,
        });
        toast.push({ type: "success", title: t("users.toasts.created") });
      }
      setFormOpen(false);
      refetch();
    } catch (error) {
      setFormError(
        error instanceof Error && error.message === "USERNAME_TAKEN"
          ? t("users.form.usernameTaken")
          : t("errors.unknown"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await getApi().deleteUser(deleting.id);
      toast.push({ type: "success", title: t("users.toasts.deleted") });
      setDeleting(null);
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleResetUuid(user: ConfigUser) {
    try {
      await getApi().resetUserUuid(user.id);
      toast.push({ type: "success", title: t("users.toasts.uuidReset") });
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    }
  }

  async function toggleEnabled(user: ConfigUser) {
    try {
      await getApi().updateUser(user.id, {
        enabled: user.status !== "active",
      });
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    }
  }

  function quotaPercent(user: ConfigUser): number {
    if (user.quotaBytes === 0) return 0;
    return (user.usedBytes / user.quotaBytes) * 100;
  }

  const columns: TableColumn<ConfigUser>[] = [
    {
      key: "username",
      header: t("users.table.username"),
      render: (user) => (
        <div className="user-cell">
          <span className="user-cell-name" dir="auto">
            {user.username}
          </span>
          <span className="user-cell-uuid mono" dir="ltr">
            {user.uuid.slice(0, 13)}…
            <CopyButton value={user.uuid} className="user-cell-copy" />
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("users.table.status"),
      render: (user) => (
        <Badge tone={STATUS_TONES[user.status]} dot>
          {t(`users.status.${user.status}`)}
        </Badge>
      ),
    },
    {
      key: "quota",
      header: t("users.table.quota"),
      render: (user) => (
        <div className="quota-cell">
          <ProgressBar value={quotaPercent(user)} />
          <span className="quota-cell-text">
            {user.quotaBytes === 0
              ? `${format.bytes(user.usedBytes)} · ${t("common.unlimited")}`
              : `${format.bytes(user.usedBytes)} / ${format.bytes(user.quotaBytes)}`}
          </span>
        </div>
      ),
    },
    {
      key: "expiry",
      header: t("users.table.expiry"),
      render: (user) =>
        user.expiryAt === null ? (
          <span className="cell-muted">{t("common.never")}</span>
        ) : (
          <span
            className={
              format.daysUntil(user.expiryAt) < 7 ? "cell-danger" : undefined
            }
          >
            {format.date(user.expiryAt)}
          </span>
        ),
    },
    {
      key: "ipLimit",
      header: t("users.table.ipLimit"),
      render: (user) => (
        <span className="cell-numeric">
          {user.ipLimit === 0 ? t("common.unlimited") : format.number(user.ipLimit)}
        </span>
      ),
    },
    {
      key: "created",
      header: t("users.table.created"),
      render: (user) => (
        <span className="cell-muted">{format.date(user.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: t("users.table.actions"),
      align: "end",
      width: "64px",
      render: (user) => (
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
          items={[
            {
              key: "edit",
              label: t("users.actions.edit"),
              icon: <Pencil size={15} />,
              onSelect: () => openEdit(user),
            },
            {
              key: "reset",
              label: t("users.actions.resetUuid"),
              icon: <RefreshCcw size={15} />,
              onSelect: () => handleResetUuid(user),
            },
            {
              key: "toggle",
              label:
                user.status === "active"
                  ? t("users.actions.disable")
                  : t("users.actions.enable"),
              icon:
                user.status === "active" ? (
                  <Ban size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                ),
              onSelect: () => toggleEnabled(user),
            },
            {
              key: "delete",
              label: t("users.actions.delete"),
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => setDeleting(user),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <section className="users-page">
      <div className="users-header">
        <div>
          <h2>{t("users.title")}</h2>
          <p>{t("users.description")}</p>
        </div>

        {isAdmin && (
          <Button onClick={openCreate} iconLeft={<UserPlus size={16} />}>
            {t("users.addUser")}
          </Button>
        )}
      </div>

      <Card padded={false}>
        <div className="users-toolbar">
          <Input
            type="search"
            placeholder={t("users.searchPlaceholder")}
            iconStart={<Search size={16} />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="users-search"
            aria-label={t("common.search")}
          />

          <Select
            options={[
              { value: "all", label: t("common.all") },
              { value: "active", label: t("users.status.active") },
              { value: "disabled", label: t("users.status.disabled") },
              { value: "expired", label: t("users.status.expired") },
              { value: "limited", label: t("users.status.limited") },
            ]}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            aria-label={t("users.filterStatus")}
            className="users-status-filter"
          />
        </div>

        <Table
          columns={columns}
          rows={users}
          rowKey={(user) => user.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<KeyRound size={24} />}
              title={t("users.empty.title")}
              description={t("users.empty.description")}
              action={
                isAdmin ? (
                  <Button onClick={openCreate} iconLeft={<UserPlus size={16} />}>
                    {t("users.addUser")}
                  </Button>
                ) : undefined
              }
            />
          }
        />

        {data && (
          <Pagination
            page={data.meta.page}
            perPage={data.meta.perPage}
            total={data.meta.total}
            onChange={setPage}
          />
        )}
      </Card>

      {/* Add / Edit modal */}
      <Modal
        open={formOpen}
        title={editing ? t("users.editUser") : t("users.addUser")}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="user-form" loading={saving}>
              {editing ? t("common.save") : t("common.create")}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSave} className="user-form">
          <div className="form-section-title">{t("users.form.sectionIdentity")}</div>

          <Input
            label={t("users.form.username")}
            value={form.username}
            onChange={(event) =>
              setForm((state) => ({ ...state, username: event.target.value }))
            }
            error={formError ?? undefined}
            dir="auto"
            required
          />

          <Input
            label={t("users.form.note")}
            placeholder={t("users.form.notePlaceholder")}
            value={form.note}
            onChange={(event) =>
              setForm((state) => ({ ...state, note: event.target.value }))
            }
            dir="auto"
          />

          <div className="form-section-title">{t("users.form.sectionLimits")}</div>

          <div className="form-grid-2">
            <Input
              label={t("users.form.quotaBytes")}
              type="number"
              min={0}
              step="any"
              hint={t("users.form.quotaHint")}
              value={form.quotaGb}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  quotaGb: Number(event.target.value),
                }))
              }
            />

            <Input
              label={t("users.form.ipLimit")}
              type="number"
              min={0}
              hint={t("users.form.ipLimitHint")}
              value={form.ipLimit}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  ipLimit: Number(event.target.value),
                }))
              }
            />
          </div>

          <Input
            label={t("users.form.expiryAt")}
            type="date"
            hint={t("users.form.expiryHint")}
            value={form.expiryDate}
            onChange={(event) =>
              setForm((state) => ({ ...state, expiryDate: event.target.value }))
            }
          />

          <Switch
            checked={form.enabled}
            onChange={(checked) =>
              setForm((state) => ({ ...state, enabled: checked }))
            }
            label={t("users.form.enabled")}
          />
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title={t("users.confirmDelete.title")}
        message={t("users.confirmDelete.message", {
          name: deleting?.username ?? "",
        })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
