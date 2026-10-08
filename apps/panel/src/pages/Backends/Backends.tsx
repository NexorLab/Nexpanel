import { useState, type FormEvent } from "react";
import {
  Globe,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Power,
  Server,
  Trash2,
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
import Switch from "../../components/ui/Switch";
import { useApi } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type { Backend, FragmentSettings } from "../../types/dto";
import "./Backends.css";

type Protocol = Backend["protocol"];
type FragmentMode = FragmentSettings["mode"];
type FragmentPackets = FragmentSettings["packets"];

const SS_METHODS = [
  "aes-256-gcm",
  "chacha20-ietf-poly1305",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305",
];

const TRANSPORTS: Backend["transport"][] = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"];
const SECURITY_OPTIONS: Backend["security"][] = ["none", "tls", "reality"];
const PACKET_OPTIONS: FragmentPackets[] = ["tlshello", "hello-ice", "1-3"];

interface BackendFormState {
  name: string;
  protocol: Protocol;
  host: string;
  port: number;
  transport: Backend["transport"];
  security: Backend["security"];
  sni: string;
  hostHeader: string;
  path: string;
  serviceName: string;
  uuid: string;
  password: string;
  method: string;
  realityPublicKey: string;
  realityShortId: string;
  fingerprint: string;
  allowInsecure: boolean;
  enabled: boolean;
  fragmentMode: FragmentMode;
  fragmentPackets: FragmentPackets;
  fragmentLengthMin: number;
  fragmentLengthMax: number;
  fragmentDelayMin: number;
  fragmentDelayMax: number;
  fragmentMaxSplitMin: number;
  fragmentMaxSplitMax: number;
  echEnabled: boolean;
  echServerName: string;
}

function emptyForm(): BackendFormState {
  return {
    name: "",
    protocol: "vless",
    host: "",
    port: 443,
    transport: "ws",
    security: "tls",
    sni: "",
    hostHeader: "",
    path: "/ws",
    serviceName: "",
    uuid: "",
    password: "",
    method: "aes-256-gcm",
    realityPublicKey: "",
    realityShortId: "",
    fingerprint: "chrome",
    allowInsecure: false,
    enabled: true,
    fragmentMode: "none",
    fragmentPackets: "tlshello",
    fragmentLengthMin: 100,
    fragmentLengthMax: 200,
    fragmentDelayMin: 1,
    fragmentDelayMax: 1,
    fragmentMaxSplitMin: 0,
    fragmentMaxSplitMax: 0,
    echEnabled: false,
    echServerName: "",
  };
}

function toBackendBody(form: BackendFormState): Omit<
  Backend,
  "id" | "createdAt" | "updatedAt" | "sortOrder"
> {
  return {
    name: form.name.trim(),
    protocol: form.protocol,
    host: form.host.trim(),
    port: form.port,
    transport: form.transport,
    security: form.security,
    sni: form.sni || null,
    hostHeader: form.hostHeader || null,
    path: form.path || null,
    serviceName: form.serviceName || null,
    uuid: form.uuid || null,
    password: form.password || null,
    method: form.protocol === "shadowsocks" ? form.method : null,
    realityPublicKey: form.realityPublicKey || null,
    realityShortId: form.realityShortId || null,
    fingerprint: form.fingerprint || null,
    allowInsecure: form.allowInsecure,
    fragment: {
      mode: form.fragmentMode,
      packets: form.fragmentPackets,
      lengthMin: form.fragmentLengthMin,
      lengthMax: form.fragmentLengthMax,
      delayMin: form.fragmentDelayMin,
      delayMax: form.fragmentDelayMax,
      maxSplitMin: form.fragmentMaxSplitMin,
      maxSplitMax: form.fragmentMaxSplitMax,
    },
    ech: { enabled: form.echEnabled, serverName: form.echServerName.trim() },
    status: form.enabled ? "active" : "disabled",
  };
}

function fromBackend(backend: Backend): BackendFormState {
  return {
    name: backend.name,
    protocol: backend.protocol,
    host: backend.host,
    port: backend.port,
    transport: backend.transport,
    security: backend.security,
    sni: backend.sni ?? "",
    hostHeader: backend.hostHeader ?? "",
    path: backend.path ?? "",
    serviceName: backend.serviceName ?? "",
    uuid: backend.uuid ?? "",
    password: backend.password ?? "",
    method: backend.method ?? "aes-256-gcm",
    realityPublicKey: backend.realityPublicKey ?? "",
    realityShortId: backend.realityShortId ?? "",
    fingerprint: backend.fingerprint ?? "chrome",
    allowInsecure: backend.allowInsecure,
    enabled: backend.status === "active",
    fragmentMode: backend.fragment.mode,
    fragmentPackets: backend.fragment.packets,
    fragmentLengthMin: backend.fragment.lengthMin,
    fragmentLengthMax: backend.fragment.lengthMax,
    fragmentDelayMin: backend.fragment.delayMin,
    fragmentDelayMax: backend.fragment.delayMax,
    fragmentMaxSplitMin: backend.fragment.maxSplitMin,
    fragmentMaxSplitMax: backend.fragment.maxSplitMax,
    echEnabled: backend.ech.enabled,
    echServerName: backend.ech.serverName,
  };
}

export default function Backends() {
  const { t } = useLanguage();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const { data: backends, loading, refetch } = useApi<Backend[]>(
    () => getApi().listBackends(),
    [],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Backend | null>(null);
  const [form, setForm] = useState<BackendFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Backend | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(backend: Backend) {
    setEditing(backend);
    setForm(fromBackend(backend));
    setFormError(null);
    setFormOpen(true);
  }

  function set<K extends keyof BackendFormState>(key: K, value: BackendFormState[K]) {
    setForm((state) => ({ ...state, [key]: value }));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError(t("backends.form.nameRequired"));
      return;
    }
    if (!form.host.trim()) {
      setFormError(t("backends.form.hostRequired"));
      return;
    }
    if (form.port < 1 || form.port > 65535) {
      setFormError(t("backends.form.portInvalid"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await getApi().updateBackend(editing.id, toBackendBody(form));
        toast.push({ type: "success", title: t("backends.toasts.updated") });
      } else {
        await getApi().createBackend(toBackendBody(form));
        toast.push({ type: "success", title: t("backends.toasts.created") });
      }
      setFormOpen(false);
      refetch();
    } catch (error) {
      setFormError(
        error instanceof Error && error.message === "NAME_TAKEN"
          ? t("backends.form.nameTaken")
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
      await getApi().deleteBackend(deleting.id);
      toast.push({ type: "success", title: t("backends.toasts.deleted") });
      setDeleting(null);
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleTest(backend: Backend) {
    try {
      const { latencyMs } = await getApi().testBackend(backend.id);
      toast.push({
        type: "success",
        title: t("backends.toasts.tested", { ms: latencyMs }),
      });
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    }
  }

  async function toggleEnabled(backend: Backend) {
    try {
      await getApi().updateBackend(backend.id, {
        status: backend.status === "active" ? "disabled" : "active",
      });
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    }
  }

  const isReality = form.security === "reality";
  const hasTransportExtras =
    form.transport === "ws" || form.transport === "httpupgrade" || form.transport === "xhttp";
  const isGrpc = form.transport === "grpc";

  return (
    <section className="backends-page">
      <div className="backends-header">
        <div>
          <h2>{t("backends.title")}</h2>
          <p>{t("backends.description")}</p>
        </div>

        {isAdmin && (
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            {t("backends.addBackend")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="backends-grid">
          {[1, 2, 3].map((key) => (
            <Card key={key} className="backend-card">
              <div className="skeleton" style={{ height: 90 }} />
            </Card>
          ))}
        </div>
      ) : (backends?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<Server size={24} />}
            title={t("backends.empty.title")}
            description={t("backends.empty.description")}
            action={
              isAdmin ? (
                <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
                  {t("backends.addBackend")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="backends-grid">
          {backends!.map((backend) => (
            <Card key={backend.id} className="backend-card" hoverable>
              <div className="backend-card-head">
                <div className="backend-card-title">
                  <span
                    className={`backend-status-dot ${backend.status === "active" ? "dot-active" : "dot-inactive"}`}
                  />
                  <h3 dir="auto">{backend.name}</h3>
                </div>

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
                      label: t("backends.actions.edit"),
                      icon: <Pencil size={15} />,
                      onSelect: () => openEdit(backend),
                    },
                    {
                      key: "test",
                      label: t("backends.actions.test"),
                      icon: <Play size={15} />,
                      onSelect: () => handleTest(backend),
                    },
                    {
                      key: "toggle",
                      label:
                        backend.status === "active"
                          ? t("backends.actions.disable")
                          : t("backends.actions.enable"),
                      icon: <Power size={15} />,
                      onSelect: () => toggleEnabled(backend),
                    },
                    {
                      key: "delete",
                      label: t("backends.actions.delete"),
                      icon: <Trash2 size={15} />,
                      danger: true,
                      onSelect: () => setDeleting(backend),
                    },
                  ]}
                />
              </div>

              <div className="backend-card-badges">
                <Badge tone="primary">
                  {t(`backends.protocol.${backend.protocol}`)}
                </Badge>
                <Badge tone="neutral">
                  {t(`backends.transport.${backend.transport}`)}
                </Badge>
                <Badge
                  tone={
                    backend.security === "none"
                      ? "warning"
                      : backend.security === "reality"
                        ? "info"
                        : "success"
                  }
                >
                  {t(`backends.security.${backend.security}`)}
                </Badge>
              </div>

              <div className="backend-card-host mono" dir="ltr">
                <Globe size={13} />
                {backend.host}:{backend.port}
                {backend.path ? backend.path : ""}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={formOpen}
        title={editing ? t("backends.editBackend") : t("backends.addBackend")}
        onClose={() => setFormOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="backend-form" loading={saving}>
              {editing ? t("common.save") : t("common.create")}
            </Button>
          </>
        }
      >
        <form id="backend-form" onSubmit={handleSave} className="backend-form">
          <Input
            label={t("backends.form.name")}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            error={formError ?? undefined}
            dir="auto"
            required
          />

          <div className="form-field">
            <span className="form-label">{t("backends.form.protocol")}</span>
            <SegmentedControl
              value={form.protocol}
              onChange={(value) => set("protocol", value as Protocol)}
              options={(["vless", "vmess", "trojan", "shadowsocks"] as Protocol[]).map(
                (protocol) => ({
                  value: protocol,
                  label: t(`backends.protocol.${protocol}`),
                }),
              )}
              ariaLabel={t("backends.form.protocol")}
            />
          </div>

          <div className="form-grid-2">
            <Input
              label={t("backends.form.host")}
              value={form.host}
              onChange={(event) => set("host", event.target.value)}
              dir="ltr"
              required
            />
            <Input
              label={t("backends.form.port")}
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(event) => set("port", Number(event.target.value))}
              dir="ltr"
            />
          </div>

          <div className="form-section-title">
            {t("backends.form.sectionTransport")}
          </div>

          <div className="form-grid-2">
            <Select
              label={t("backends.form.sectionTransport")}
              value={form.transport}
              onChange={(event) =>
                set("transport", event.target.value as Backend["transport"])
              }
              options={TRANSPORTS.map((transport) => ({
                value: transport,
                label: t(`backends.transport.${transport}`),
              }))}
            />

            <Select
              label={t("backends.form.sectionSecurity")}
              value={form.security}
              onChange={(event) =>
                set("security", event.target.value as Backend["security"])
              }
              options={SECURITY_OPTIONS.map((security) => ({
                value: security,
                label: t(`backends.security.${security}`),
              }))}
            />
          </div>

          {hasTransportExtras && (
            <div className="form-grid-2">
              <Input
                label={t("backends.form.path")}
                value={form.path}
                onChange={(event) => set("path", event.target.value)}
                dir="ltr"
              />
              <Input
                label={t("backends.form.hostHeader")}
                value={form.hostHeader}
                onChange={(event) => set("hostHeader", event.target.value)}
                dir="ltr"
              />
            </div>
          )}

          {isGrpc && (
            <Input
              label={t("backends.form.serviceName")}
              value={form.serviceName}
              onChange={(event) => set("serviceName", event.target.value)}
              dir="ltr"
            />
          )}

          {form.security !== "none" && (
            <Input
              label={t("backends.form.sni")}
              value={form.sni}
              onChange={(event) => set("sni", event.target.value)}
              dir="ltr"
            />
          )}

          {isReality && (
            <div className="form-grid-2">
              <Input
                label={t("backends.form.realityPublicKey")}
                value={form.realityPublicKey}
                onChange={(event) => set("realityPublicKey", event.target.value)}
                dir="ltr"
              />
              <Input
                label={t("backends.form.realityShortId")}
                value={form.realityShortId}
                onChange={(event) => set("realityShortId", event.target.value)}
                dir="ltr"
              />
            </div>
          )}

          {form.security !== "none" && !isReality && (
            <Input
              label={t("backends.form.fingerprint")}
              value={form.fingerprint}
              onChange={(event) => set("fingerprint", event.target.value)}
              dir="ltr"
            />
          )}

          <div className="form-section-title">
            {t("backends.form.sectionNetwork")}
          </div>

          {form.security === "none" && (
            <p className="form-hint-inline">{t("backends.form.networkNeedsTls")}</p>
          )}

          {form.security !== "none" && (
            <div className="form-field">
              <span className="form-label">{t("backends.form.fragmentMode")}</span>
              <SegmentedControl
                value={form.fragmentMode}
                onChange={(value) => set("fragmentMode", value as FragmentMode)}
                options={[
                  { value: "none", label: t("backends.form.fragmentModeOff") },
                  { value: "custom", label: t("backends.form.fragmentModeCustom") },
                ]}
                ariaLabel={t("backends.form.fragmentMode")}
              />
            </div>
          )}

          {form.security !== "none" && form.fragmentMode === "custom" && (
            <>
              <Select
                label={t("backends.form.fragmentPackets")}
                value={form.fragmentPackets}
                onChange={(event) =>
                  set("fragmentPackets", event.target.value as FragmentPackets)
                }
                options={PACKET_OPTIONS.map((packets) => ({
                  value: packets,
                  label: packets,
                }))}
              />
              <div className="form-grid-2">
                <Input
                  label={t("backends.form.fragmentLength")}
                  hint={t("backends.form.fragmentLengthHint")}
                  type="number"
                  min={20}
                  max={1000}
                  value={form.fragmentLengthMin}
                  onChange={(event) => set("fragmentLengthMin", Number(event.target.value))}
                  dir="ltr"
                />
                <Input
                  type="number"
                  min={20}
                  max={1000}
                  value={form.fragmentLengthMax}
                  onChange={(event) => set("fragmentLengthMax", Number(event.target.value))}
                  dir="ltr"
                />
              </div>
              <div className="form-grid-2">
                <Input
                  label={t("backends.form.fragmentDelay")}
                  hint={t("backends.form.fragmentDelayHint")}
                  type="number"
                  min={0}
                  max={5000}
                  value={form.fragmentDelayMin}
                  onChange={(event) => set("fragmentDelayMin", Number(event.target.value))}
                  dir="ltr"
                />
                <Input
                  type="number"
                  min={0}
                  max={5000}
                  value={form.fragmentDelayMax}
                  onChange={(event) => set("fragmentDelayMax", Number(event.target.value))}
                  dir="ltr"
                />
              </div>
              <div className="form-grid-2">
                <Input
                  label={t("backends.form.fragmentMaxSplit")}
                  hint={t("backends.form.fragmentMaxSplitHint")}
                  type="number"
                  min={0}
                  max={20}
                  value={form.fragmentMaxSplitMin}
                  onChange={(event) => set("fragmentMaxSplitMin", Number(event.target.value))}
                  dir="ltr"
                />
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={form.fragmentMaxSplitMax}
                  onChange={(event) => set("fragmentMaxSplitMax", Number(event.target.value))}
                  dir="ltr"
                />
              </div>
            </>
          )}

          {form.security === "tls" && (
            <div className="form-field">
              <Switch
                checked={form.echEnabled}
                onChange={(checked) => set("echEnabled", checked)}
                label={t("backends.form.echEnable")}
              />
              {form.fragmentMode === "custom" && (
                <p className="form-hint-inline">
                  {t("backends.form.echDisabledByFragment")}
                </p>
              )}
            </div>
          )}

          {form.security === "tls" && form.echEnabled && (
            <Input
              label={t("backends.form.echServerName")}
              hint={t("backends.form.echServerNameHint")}
              value={form.echServerName}
              onChange={(event) => set("echServerName", event.target.value)}
              dir="ltr"
              placeholder="example.com"
              required
            />
          )}

          <div className="form-section-title">
            {t("backends.form.sectionCredentials")}
          </div>

          {form.protocol !== "shadowsocks" ? (
            <Input
              label={t("backends.form.uuid")}
              value={form.uuid}
              onChange={(event) => set("uuid", event.target.value)}
              dir="ltr"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          ) : (
            <div className="form-grid-2">
              <Input
                label={t("backends.form.password")}
                value={form.password}
                onChange={(event) => set("password", event.target.value)}
                dir="ltr"
              />
              <Select
                label={t("backends.form.method")}
                value={form.method}
                onChange={(event) => set("method", event.target.value)}
                options={SS_METHODS.map((method) => ({
                  value: method,
                  label: method,
                }))}
              />
            </div>
          )}

          {form.protocol === "trojan" && (
            <Input
              label={t("backends.form.password")}
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
              dir="ltr"
            />
          )}

          <Switch
            checked={form.allowInsecure}
            onChange={(checked) => set("allowInsecure", checked)}
            label={t("backends.form.allowInsecure")}
          />

          <Switch
            checked={form.enabled}
            onChange={(checked) => set("enabled", checked)}
            label={t("backends.form.enabled")}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={t("backends.confirmDelete.title")}
        message={t("backends.confirmDelete.message", {
          name: deleting?.name ?? "",
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
