import { useMemo, useState, type FormEvent } from "react";
import {
  Download,
  FileText,
  MoreVertical,
  Plus,
  QrCode,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Checkbox from "../../components/ui/Checkbox";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import CopyButton from "../../components/ui/CopyButton";
import DropdownMenu from "../../components/ui/DropdownMenu";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import SegmentedControl from "../../components/ui/SegmentedControl";
import Select from "../../components/ui/Select";
import Table, { type TableColumn } from "../../components/ui/Table";
import { useApi, useDebouncedValue } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type { Backend, Config, ConfigUser, Paginated } from "../../types/dto";
import "./Configs.css";

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks"] as const;

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Configs() {
  const { t } = useLanguage();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [search, setSearch] = useState("");
  const [protocol, setProtocol] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [backendFilter, setBackendFilter] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const { data, loading, refetch } = useApi<Paginated<Config>>(
    () =>
      getApi().listConfigs({
        search: debouncedSearch || undefined,
        protocol,
        userId: userFilter,
        backendId: backendFilter,
        page,
        perPage: 10,
      }),
    [debouncedSearch, protocol, userFilter, backendFilter, page],
  );

  const { data: users } = useApi<Paginated<ConfigUser>>(
    () => getApi().listUsers({ perPage: 100 }),
    [],
  );

  const { data: backends } = useApi<Backend[]>(
    () => getApi().listBackends({ status: "active" }),
    [],
  );

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateUser, setGenerateUser] = useState("");
  const [selectedBackends, setSelectedBackends] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Config[]>([]);

  const [qrConfig, setQrConfig] = useState<Config | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Config | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const configs = data?.data ?? [];

  const activeBackendOptions = useMemo(
    () =>
      (backends ?? []).filter((backend) => backend.status === "active"),
    [backends],
  );

  async function openQr(config: Config) {
    setQrConfig(config);
    setQrDataUrl(await QRCode.toDataURL(config.uri, { width: 260, margin: 1 }));
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!generateUser) {
      setGenerateError(t("configs.generateModal.noUserSelected"));
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await getApi().generateConfigs({
        userId: generateUser,
        backendIds: selectedBackends,
      });
      setGenerated(result);
      toast.push({
        type: "success",
        title: t("configs.toasts.generated", { count: result.length }),
      });
      refetch();
    } catch {
      setGenerateError(t("errors.unknown"));
    } finally {
      setGenerating(false);
    }
  }

  function openGenerate() {
    setGenerateUser("");
    setSelectedBackends(activeBackendOptions.map((backend) => backend.id));
    setGenerated([]);
    setGenerateError(null);
    setGenerateOpen(true);
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await getApi().deleteConfig(deleting.id);
      toast.push({ type: "success", title: t("configs.toasts.deleted") });
      setDeleting(null);
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRebuild(config: Config) {
    try {
      await getApi().rebuildConfig(config.id);
      toast.push({ type: "success", title: t("configs.toasts.rebuilt") });
      refetch();
    } catch {
      toast.push({ type: "error", title: t("errors.unknown") });
    }
  }

  const userById = useMemo(() => {
    const map = new Map<string, ConfigUser>();
    for (const user of users?.data ?? []) map.set(user.id, user);
    return map;
  }, [users]);

  const backendById = useMemo(() => {
    const map = new Map<string, Backend>();
    for (const backend of backends ?? []) map.set(backend.id, backend);
    return map;
  }, [backends]);

  const columns: TableColumn<Config>[] = [
    {
      key: "name",
      header: t("configs.table.name"),
      render: (config) => (
        <span className="config-name" dir="auto">
          {config.name}
        </span>
      ),
    },
    {
      key: "protocol",
      header: t("configs.table.protocol"),
      render: (config) => (
        <Badge tone="primary">{t(`backends.protocol.${config.protocol}`)}</Badge>
      ),
    },
    {
      key: "user",
      header: t("configs.table.user"),
      render: (config) => (
        <span dir="auto">{userById.get(config.userId)?.username ?? "—"}</span>
      ),
    },
    {
      key: "backend",
      header: t("configs.table.backend"),
      render: (config) => {
        const backend = backendById.get(config.backendId);
        return (
          <span className="config-backend mono" dir="ltr">
            {backend ? `${backend.host}:${backend.port}` : "—"}
          </span>
        );
      },
    },
    {
      key: "uri",
      header: t("configs.table.uri"),
      render: (config) => (
        <div className="config-uri-cell">
          <span className="config-uri mono" dir="ltr">
            {config.uri}
          </span>
          <CopyButton value={config.uri} />
        </div>
      ),
    },
    {
      key: "created",
      header: t("configs.table.created"),
      render: (config) => (
        <span className="cell-muted">
          {new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(
            new Date(config.createdAt * 1000),
          )}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("configs.table.actions"),
      align: "end",
      width: "64px",
      render: (config) => (
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
              key: "qr",
              label: t("configs.actions.showQr"),
              icon: <QrCode size={15} />,
              onSelect: () => void openQr(config),
            },
            {
              key: "rebuild",
              label: t("configs.actions.rebuild"),
              icon: <RefreshCcw size={15} />,
              onSelect: () => handleRebuild(config),
            },
            {
              key: "delete",
              label: t("configs.actions.delete"),
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => setDeleting(config),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <section className="configs-page">
      <div className="configs-header">
        <div>
          <h2>{t("configs.title")}</h2>
          <p>{t("configs.description")}</p>
        </div>

        {isAdmin && (
          <Button onClick={openGenerate} iconLeft={<Plus size={16} />}>
            {t("configs.generate")}
          </Button>
        )}
      </div>

      <Card padded={false}>
        <div className="configs-toolbar">
          <Input
            type="search"
            placeholder={t("configs.searchPlaceholder")}
            iconStart={<Search size={16} />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="configs-search"
            aria-label={t("common.search")}
          />

          <SegmentedControl
            value={protocol}
            onChange={(value) => {
              setProtocol(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: t("common.all") },
              ...PROTOCOLS.map((item) => ({
                value: item,
                label: t(`backends.protocol.${item}`),
              })),
            ]}
            size="sm"
            ariaLabel={t("configs.table.protocol")}
          />

          <Select
            value={userFilter}
            onChange={(event) => {
              setUserFilter(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: t("configs.filterUser") },
              ...(users?.data ?? []).map((user) => ({
                value: user.id,
                label: user.username,
              })),
            ]}
            className="configs-filter"
            aria-label={t("configs.table.user")}
          />

          <Select
            value={backendFilter}
            onChange={(event) => {
              setBackendFilter(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: t("configs.filterBackend") },
              ...(backends ?? []).map((backend) => ({
                value: backend.id,
                label: backend.name,
              })),
            ]}
            className="configs-filter"
            aria-label={t("configs.table.backend")}
          />
        </div>

        <Table
          columns={columns}
          rows={configs}
          rowKey={(config) => config.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<FileText size={24} />}
              title={t("configs.empty.title")}
              description={t("configs.empty.description")}
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

      {/* Generate modal */}
      <Modal
        open={generateOpen}
        title={t("configs.generateModal.title")}
        onClose={() => setGenerateOpen(false)}
        size="md"
        footer={
          generated.length > 0 ? (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  downloadText(
                    "nexpanel-configs.txt",
                    generated.map((config) => config.uri).join("\n"),
                  )
                }
                iconLeft={<Download size={15} />}
              >
                {t("configs.generateModal.downloadTxt")}
              </Button>
              <Button
                onClick={() => setGenerateOpen(false)}
              >
                {t("configs.generateModal.done")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setGenerateOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" form="generate-form" loading={generating}>
                {generating
                  ? t("configs.generateModal.generating")
                  : t("configs.generateModal.submit")}
              </Button>
            </>
          )
        }
      >
        {generated.length > 0 ? (
          <div className="generate-results">
            <div className="generate-results-head">
              <span>{t("configs.generateModal.results")}</span>
              <CopyButton
                value={generated.map((config) => config.uri).join("\n")}
                label={t("configs.generateModal.copyAll")}
              />
            </div>
            {generated.map((config) => (
              <div key={config.id} className="generate-result-row">
                <span className="generate-result-name" dir="auto">
                  {config.name}
                </span>
                <span className="generate-result-uri mono" dir="ltr">
                  {config.uri}
                </span>
                <CopyButton value={config.uri} />
              </div>
            ))}
          </div>
        ) : (
          <form id="generate-form" onSubmit={handleGenerate} className="generate-form">
            <Select
              label={t("configs.generateModal.user")}
              placeholder={t("configs.generateModal.userPlaceholder")}
              value={generateUser}
              onChange={(event) => setGenerateUser(event.target.value)}
              options={(users?.data ?? []).map((user) => ({
                value: user.id,
                label: user.username,
              }))}
              error={generateError ?? undefined}
            />

            <div className="generate-backends">
              <div className="generate-backends-head">
                <span className="form-label">
                  {t("configs.generateModal.backends")}
                </span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    setSelectedBackends(
                      selectedBackends.length === activeBackendOptions.length
                        ? []
                        : activeBackendOptions.map((backend) => backend.id),
                    )
                  }
                >
                  {t("configs.generateModal.selectAll")}
                </button>
              </div>

              {activeBackendOptions.length === 0 ? (
                <p className="generate-no-backends">
                  {t("configs.generateModal.noBackends")}
                </p>
              ) : (
                <div className="generate-backend-list">
                  {activeBackendOptions.map((backend) => (
                    <Checkbox
                      key={backend.id}
                      label={`${backend.name} (${t(`backends.protocol.${backend.protocol}`)})`}
                      checked={selectedBackends.includes(backend.id)}
                      onChange={(checked) =>
                        setSelectedBackends((current) =>
                          checked
                            ? [...current, backend.id]
                            : current.filter((id) => id !== backend.id),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </form>
        )}
      </Modal>

      {/* QR modal */}
      <Modal
        open={qrConfig !== null}
        title={t("configs.qrModal.title")}
        onClose={() => setQrConfig(null)}
        size="sm"
      >
        <div className="qr-body">
          {qrDataUrl && (
            <img src={qrDataUrl} alt={qrConfig?.name ?? "QR"} className="qr-image" />
          )}
          <p className="qr-hint">{t("configs.qrModal.scanHint")}</p>
          <div className="qr-uri mono" dir="ltr">
            {qrConfig?.uri}
            <CopyButton value={qrConfig?.uri ?? ""} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={t("configs.confirmDelete.title")}
        message={t("configs.confirmDelete.message", {
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
