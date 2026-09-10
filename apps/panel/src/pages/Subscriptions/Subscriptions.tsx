import { useMemo, useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Link2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import CopyButton from "../../components/ui/CopyButton";
import DropdownMenu from "../../components/ui/DropdownMenu";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import SegmentedControl from "../../components/ui/SegmentedControl";
import Select from "../../components/ui/Select";
import Table, { type TableColumn } from "../../components/ui/Table";
import { useApi } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { useFormat } from "../../lib/format";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type {
  ConfigUser,
  Paginated,
  Subscription,
  SubscriptionFormat,
} from "../../types/dto";
import "./Subscriptions.css";

const FORMATS: SubscriptionFormat[] = ["base64", "plain", "clash", "singbox"];

/** Full public URL for a subscription token. */
function subscriptionUrl(token: string): string {
  const origin = window.location.origin;
  return `${origin}/sub/${token}`;
}

function maskToken(token: string): string {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

interface SubFormState {
  userId: string;
  name: string;
  format: SubscriptionFormat;
}

const EMPTY_FORM: SubFormState = { userId: "", name: "default", format: "base64" };

export default function Subscriptions() {
  const { t } = useLanguage();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const fmt = useFormat();

  const { data, loading, refetch } = useApi<Subscription[]>(
    () => getApi().listSubscriptions(),
    [],
  );

  const { data: users } = useApi<Paginated<ConfigUser>>(
    () => getApi().listUsers({ perPage: 100 }),
    [],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState<SubFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const [rotating, setRotating] = useState<Subscription | null>(null);
  const [busyLoading, setBusyLoading] = useState(false);

  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const subscriptions = data ?? [];

  const userById = useMemo(() => {
    const map = new Map<string, ConfigUser>();
    for (const user of users?.data ?? []) map.set(user.id, user);
    return map;
  }, [users]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(sub: Subscription) {
    setEditing(sub);
    setForm({ userId: sub.userId, name: sub.name, format: sub.format });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form.userId) {
      setFormError(t("subscriptions.form.userRequired"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await getApi().updateSubscription(editing.id, {
          name: form.name.trim() || "default",
          format: form.format,
        });
        toast.push({ type: "success", title: t("subscriptions.toasts.updated") });
      } else {
        await getApi().createSubscription({
          userId: form.userId,
          name: form.name.trim() || "default",
          format: form.format,
        });
        toast.push({ type: "success", title: t("subscriptions.toasts.created") });
      }
      setFormOpen(false);
      refetch();
    } catch {
      setFormError(t("errors.unknown"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyLoading(true);
    try {
      await getApi().deleteSubscription(deleting.id);
      toast.push({ type: "success", title: t("subscriptions.toasts.deleted") });
      setDeleting(null);
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setBusyLoading(false);
    }
  }

  async function handleRotate() {
    if (!rotating) return;
    setBusyLoading(true);
    try {
      const updated = await getApi().rotateSubscriptionToken(rotating.id);
      toast.push({ type: "success", title: t("subscriptions.toasts.rotated") });
      setRotating(null);
      setRevealed((current) => {
        const next = new Set(current);
        next.delete(updated.id);
        return next;
      });
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setBusyLoading(false);
    }
  }

  function toggleRevealed(id: string) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const columns: TableColumn<Subscription>[] = [
    {
      key: "user",
      header: t("subscriptions.table.user"),
      render: (sub) => {
        const user = userById.get(sub.userId);
        return (
          <div className="sub-user">
            <span className="sub-user-name" dir="auto">
              {user?.username ?? "—"}
            </span>
            <span className="sub-name" dir="auto">
              {sub.name}
            </span>
          </div>
        );
      },
    },
    {
      key: "link",
      header: t("subscriptions.table.link"),
      render: (sub) => {
        const isRevealed = revealed.has(sub.id);
        return (
          <div className="sub-link-cell">
            <span className="sub-link mono" dir="ltr">
              {isRevealed ? subscriptionUrl(sub.token) : maskToken(sub.token)}
            </span>
            <button
              type="button"
              className="row-menu-button"
              onClick={() => toggleRevealed(sub.id)}
              aria-label={
                isRevealed ? t("subscriptions.actions.hide") : t("subscriptions.actions.reveal")
              }
            >
              {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <CopyButton value={subscriptionUrl(sub.token)} />
          </div>
        );
      },
    },
    {
      key: "format",
      header: t("subscriptions.table.format"),
      render: (sub) => (
        <Badge tone="neutral">{t(`subscriptions.format.${sub.format}`)}</Badge>
      ),
    },
    {
      key: "access",
      header: t("subscriptions.table.access"),
      render: (sub) => (
        <div className="sub-access">
          <span className="mono">{fmt.number(sub.accessCount)}</span>
          <span className="sub-access-time">
            {sub.lastAccessAt ? fmt.relative(sub.lastAccessAt) : t("common.notAvailable")}
          </span>
        </div>
      ),
    },
    {
      key: "expires",
      header: t("subscriptions.table.expires"),
      render: (sub) =>
        sub.expiresAt ? (
          <span className="sub-expires">{fmt.date(sub.expiresAt)}</span>
        ) : (
          <span className="sub-expires muted">{t("common.never")}</span>
        ),
    },
    {
      key: "actions",
      header: t("subscriptions.table.actions"),
      align: "end",
      width: "64px",
      render: (sub) => (
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
              label: t("subscriptions.actions.edit"),
              icon: <Pencil size={15} />,
              onSelect: () => openEdit(sub),
            },
            {
              key: "rotate",
              label: t("subscriptions.actions.rotate"),
              icon: <RotateCw size={15} />,
              onSelect: () => setRotating(sub),
            },
            {
              key: "delete",
              label: t("subscriptions.actions.delete"),
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => setDeleting(sub),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <section className="subs-page">
      <div className="subs-header">
        <div>
          <h2>{t("subscriptions.title")}</h2>
          <p>{t("subscriptions.description")}</p>
        </div>

        {isAdmin && (
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            {t("subscriptions.create")}
          </Button>
        )}
      </div>

      <div className="subs-layout">
        <Card padded={false} className="subs-table-card">
          <Table
            columns={columns}
            rows={subscriptions}
            rowKey={(sub) => sub.id}
            loading={loading}
            empty={
              <EmptyState
                icon={<Link2 size={24} />}
                title={t("subscriptions.empty.title")}
                description={t("subscriptions.empty.description")}
              />
            }
          />
        </Card>

        <Card className="subs-info-card">
          <h3 className="subs-info-title">
            <Link2 size={16} />
            {t("subscriptions.info.title")}
          </h3>
          <p className="subs-info-text">{t("subscriptions.info.description")}</p>
          <div className="subs-info-example mono" dir="ltr">
            https://panel.example.com/sub/&lt;token&gt;
          </div>
        </Card>
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        title={editing ? t("subscriptions.form.editTitle") : t("subscriptions.form.title")}
        onClose={() => setFormOpen(false)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="sub-form" loading={saving}>
              {editing ? t("common.save") : t("common.create")}
            </Button>
          </>
        }
      >
        <form id="sub-form" onSubmit={handleSave} className="sub-form">
          <Select
            label={t("subscriptions.form.user")}
            placeholder={t("subscriptions.form.userPlaceholder")}
            value={form.userId}
            onChange={(event) =>
              setForm((current) => ({ ...current, userId: event.target.value }))
            }
            options={(users?.data ?? []).map((user) => ({
              value: user.id,
              label: user.username,
            }))}
            disabled={editing !== null}
            error={formError ?? undefined}
          />

          <Input
            label={t("subscriptions.form.name")}
            placeholder={t("subscriptions.form.namePlaceholder")}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            dir="auto"
          />

          <div className="sub-form-field">
            <span className="sub-form-label">{t("subscriptions.form.format")}</span>
            <SegmentedControl
              value={form.format}
              onChange={(value) =>
                setForm((current) => ({ ...current, format: value as SubscriptionFormat }))
              }
              options={FORMATS.map((format) => ({
                value: format,
                label: t(`subscriptions.format.${format}`),
              }))}
              size="sm"
              ariaLabel={t("subscriptions.form.format")}
            />
          </div>
        </form>
      </Modal>

      {/* Rotate confirm */}
      <ConfirmDialog
        open={rotating !== null}
        title={t("subscriptions.confirmRotate.title")}
        message={t("subscriptions.confirmRotate.message", {
          name: rotating ? `${userById.get(rotating.userId)?.username ?? ""}/${rotating.name}` : "",
        })}
        confirmLabel={t("subscriptions.actions.rotate")}
        cancelLabel={t("common.cancel")}
        loading={busyLoading}
        onConfirm={handleRotate}
        onCancel={() => setRotating(null)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title={t("subscriptions.confirmDelete.title")}
        message={t("subscriptions.confirmDelete.message", {
          name: deleting ? `${userById.get(deleting.userId)?.username ?? ""}/${deleting.name}` : "",
        })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busyLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
