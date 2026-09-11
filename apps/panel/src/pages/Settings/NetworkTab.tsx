import { useEffect, useState, type FormEvent } from "react";
import { Globe, Lock, Network, Radio, Route, Server, Waypoints } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import SegmentedControl from "../../components/ui/SegmentedControl";
import Select from "../../components/ui/Select";
import Switch from "../../components/ui/Switch";
import { useApi } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useToast } from "../../contexts/ToastContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type {
  FragmentMode,
  FragmentPackets,
  NetworkSettings,
  PanelSettings,
  TlsFingerprint,
} from "../../types/dto";

interface NetworkTabProps {
  canEdit: boolean;
}

const PACKET_OPTIONS: FragmentPackets[] = ["tlshello", "hello-ice", "1-3"];

const FINGERPRINTS: TlsFingerprint[] = [
  "chrome",
  "firefox",
  "safari",
  "ios",
  "android",
  "edge",
  "random",
];

function parseLines(raw: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

function parsePorts(raw: string): { ports: number[]; valid: boolean } {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return { ports: [], valid: true };
  const ports: number[] = [];
  let valid = true;
  for (const part of parts) {
    const port = Number(part);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      if (!ports.includes(port)) ports.push(port);
    } else {
      valid = false;
    }
  }
  return { ports, valid };
}

export default function NetworkTab({ canEdit }: NetworkTabProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const { data } = useApi<PanelSettings>(() => getApi().getSettings(), []);

  const [network, setNetwork] = useState<NetworkSettings>(
    structuredClone(DEFAULT_SETTINGS.network),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [portsInvalid, setPortsInvalid] = useState(false);

  // Textarea mirrors of the array fields — DTO keeps real arrays.
  const [cleanIpsText, setCleanIpsText] = useState("");
  const [proxyIpsText, setProxyIpsText] = useState("");
  const [cdnAddrsText, setCdnAddrsText] = useState("");
  const [portsText, setPortsText] = useState("");

  useEffect(() => {
    if (!data) return;
    const next = data.network;
    setNetwork(structuredClone(next));
    setCleanIpsText(next.cleanIPs.join("\n"));
    setProxyIpsText(next.proxyIPs.join("\n"));
    setCdnAddrsText(next.customCdn.addrs.join("\n"));
    setPortsText(next.ports.join(", "));
    setPortsInvalid(false);
  }, [data]);

  function setFragmentField<K extends keyof NetworkSettings["fragment"]>(
    key: K,
    value: NetworkSettings["fragment"][K],
  ) {
    setNetwork((current) => ({
      ...current,
      fragment: { ...current.fragment, [key]: value },
    }));
  }

  function setDnsField<K extends keyof NetworkSettings["dns"]>(
    key: K,
    value: NetworkSettings["dns"][K],
  ) {
    setNetwork((current) => ({
      ...current,
      dns: { ...current.dns, [key]: value },
    }));
  }

  function setCdnField<K extends keyof NetworkSettings["customCdn"]>(
    key: K,
    value: NetworkSettings["customCdn"][K],
  ) {
    setNetwork((current) => ({
      ...current,
      customCdn: { ...current.customCdn, [key]: value },
    }));
  }

  function setEchField<K extends keyof NetworkSettings["ech"]>(
    key: K,
    value: NetworkSettings["ech"][K],
  ) {
    setNetwork((current) => ({
      ...current,
      ech: { ...current.ech, [key]: value },
    }));
  }

  function handleModeChange(value: string) {
    setFragmentField("mode", value as FragmentMode);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const { ports, valid } = parsePorts(portsText);
    if (!valid) {
      setPortsInvalid(true);
      setFormError(t("settings.network.errors.validation"));
      return;
    }
    setPortsInvalid(false);
    setFormError(null);
    setSaving(true);
    try {
      const result = await getApi().updateSettings({
        network: {
          ...network,
          cleanIPs: parseLines(cleanIpsText),
          proxyIPs: parseLines(proxyIpsText),
          customCdn: { ...network.customCdn, addrs: parseLines(cdnAddrsText) },
          ports,
        },
      });
      setNetwork(structuredClone(result.network));
      setCleanIpsText(result.network.cleanIPs.join("\n"));
      setProxyIpsText(result.network.proxyIPs.join("\n"));
      setCdnAddrsText(result.network.customCdn.addrs.join("\n"));
      setPortsText(result.network.ports.join(", "));
      toast.push({ type: "success", title: t("settings.network.saved") });
    } catch (error) {
      const message =
        error instanceof Error && error.message === "FRAGMENT_ECH_CONFLICT"
          ? t("settings.network.errors.conflict")
          : t("settings.network.errors.validation");
      setFormError(message);
      toast.push({ type: "error", title: message });
    } finally {
      setSaving(false);
    }
  }

  const fragmentOn = network.fragment.mode === "custom";

  return (
    <form onSubmit={handleSave} className="settings-stack">
      {formError && (
        <p className="settings-network-error" role="alert">
          {formError}
        </p>
      )}

      <Card className="settings-card">
        <h3 className="settings-card-title">
          <Waypoints size={16} />
          {t("settings.network.fragment.title")}
        </h3>
        <p className="settings-card-subtitle">{t("settings.network.fragment.description")}</p>
        <div className="settings-form">
          <div className="settings-field">
            <span className="settings-field-label">
              {t("settings.network.fragment.mode")}
            </span>
            <SegmentedControl
              value={network.fragment.mode}
              onChange={handleModeChange}
              options={[
                { value: "none", label: t("settings.network.fragment.modeOff") },
                { value: "custom", label: t("settings.network.fragment.modeCustom") },
              ]}
              ariaLabel={t("settings.network.fragment.mode")}
            />
          </div>

          {fragmentOn && (
            <>
              <div className="settings-grid-2">
                <Select
                  label={t("settings.network.fragment.packets")}
                  value={network.fragment.packets}
                  onChange={(event) =>
                    setFragmentField("packets", event.target.value as FragmentPackets)
                  }
                  options={PACKET_OPTIONS.map((value) => ({ value, label: value }))}
                  disabled={!canEdit}
                />
              </div>
              <div className="settings-grid-2">
                <Input
                  label={t("settings.network.fragment.length")}
                  hint={t("settings.network.fragment.lengthHint")}
                  type="number"
                  min={20}
                  max={1000}
                  value={network.fragment.lengthMin}
                  onChange={(event) =>
                    setFragmentField("lengthMin", Number(event.target.value))
                  }
                  disabled={!canEdit}
                  dir="ltr"
                />
                <Input
                  label=" "
                  type="number"
                  min={20}
                  max={1000}
                  value={network.fragment.lengthMax}
                  onChange={(event) =>
                    setFragmentField("lengthMax", Number(event.target.value))
                  }
                  disabled={!canEdit}
                  dir="ltr"
                />
              </div>
              <div className="settings-grid-2">
                <Input
                  label={t("settings.network.fragment.delay")}
                  hint={t("settings.network.fragment.delayHint")}
                  type="number"
                  min={0}
                  max={5000}
                  value={network.fragment.delayMin}
                  onChange={(event) =>
                    setFragmentField("delayMin", Number(event.target.value))
                  }
                  disabled={!canEdit}
                  dir="ltr"
                />
                <Input
                  label=" "
                  type="number"
                  min={0}
                  max={5000}
                  value={network.fragment.delayMax}
                  onChange={(event) =>
                    setFragmentField("delayMax", Number(event.target.value))
                  }
                  disabled={!canEdit}
                  dir="ltr"
                />
              </div>
              <div className="settings-grid-2">
                <Input
                  label={t("settings.network.fragment.maxSplit")}
                  hint={t("settings.network.fragment.maxSplitHint")}
                  type="number"
                  min={0}
                  max={20}
                  value={network.fragment.maxSplitMin}
                  onChange={(event) =>
                    setFragmentField("maxSplitMin", Number(event.target.value))
                  }
                  disabled={!canEdit}
                  dir="ltr"
                />
                <Input
                  label=" "
                  type="number"
                  min={0}
                  max={20}
                  value={network.fragment.maxSplitMax}
                  onChange={(event) =>
                    setFragmentField("maxSplitMax", Number(event.target.value))
                  }
                  disabled={!canEdit}
                  dir="ltr"
                />
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="settings-card">
        <h3 className="settings-card-title">
          <Lock size={16} />
          {t("settings.network.ech.title")}
        </h3>
        <div className="settings-form">
          <div className="settings-field">
            <Switch
              checked={network.ech.enabled}
              onChange={(checked) => setEchField("enabled", checked)}
              label={t("settings.network.ech.enable")}
              disabled={!canEdit || fragmentOn}
            />
            {fragmentOn && (
              <p className="settings-field-hint-inline">
                {t("settings.network.ech.disabledByFragment")}
              </p>
            )}
          </div>
          <Input
            label={t("settings.network.ech.serverName")}
            value={network.ech.serverName}
            onChange={(event) => setEchField("serverName", event.target.value)}
            disabled={!canEdit || !network.ech.enabled || fragmentOn}
            dir="ltr"
            placeholder="example.cloudflare-dns.com"
          />
          <div className="settings-field">
            <Switch
              checked={network.tcpFastOpen}
              onChange={(checked) =>
                setNetwork((current) => ({ ...current, tcpFastOpen: checked }))
              }
              label={t("settings.network.ech.tfo")}
              disabled={!canEdit}
            />
            <p className="settings-field-hint-inline">{t("settings.network.ech.tfoHint")}</p>
          </div>
        </div>
      </Card>

      <Card className="settings-card">
        <h3 className="settings-card-title">
          <Radio size={16} />
          {t("settings.network.ping.title")}
        </h3>
        <div className="settings-form">
          <div className="settings-grid-2">
            <Input
              label={t("settings.network.ping.bestInterval")}
              hint={t("settings.network.ping.bestIntervalHint")}
              type="number"
              min={10}
              max={3600}
              value={network.bestPingInterval}
              onChange={(event) =>
                setNetwork((current) => ({
                  ...current,
                  bestPingInterval: Number(event.target.value),
                }))
              }
              disabled={!canEdit}
              dir="ltr"
            />
            <Select
              label={t("settings.network.ping.fingerprint")}
              value={network.fingerprint}
              onChange={(event) =>
                setNetwork((current) => ({
                  ...current,
                  fingerprint: event.target.value as TlsFingerprint,
                }))
              }
              options={FINGERPRINTS.map((value) => ({ value, label: value }))}
              disabled={!canEdit}
            />
          </div>
        </div>
      </Card>

      <Card className="settings-card">
        <h3 className="settings-card-title">
          <Server size={16} />
          {t("settings.network.customCdn.title")}
        </h3>
        <div className="settings-form">
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="cdn-addrs">
              {t("settings.network.customCdn.addrs")}
            </label>
            <textarea
              id="cdn-addrs"
              className="settings-textarea"
              value={cdnAddrsText}
              onChange={(event) => setCdnAddrsText(event.target.value)}
              rows={3}
              disabled={!canEdit}
              dir="ltr"
              placeholder={"example.com\n1.2.3.4"}
            />
          </div>
          <div className="settings-grid-2">
            <Input
              label={t("settings.network.customCdn.host")}
              value={network.customCdn.host}
              onChange={(event) => setCdnField("host", event.target.value)}
              disabled={!canEdit}
              dir="ltr"
            />
            <Input
              label={t("settings.network.customCdn.sni")}
              value={network.customCdn.sni}
              onChange={(event) => setCdnField("sni", event.target.value)}
              disabled={!canEdit}
              dir="ltr"
            />
          </div>
        </div>
      </Card>

      <Card className="settings-card">
        <h3 className="settings-card-title">
          <Route size={16} />
          {t("settings.network.ips.title")}
        </h3>
        <div className="settings-form">
          <div className="settings-grid-2">
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="clean-ips">
                {t("settings.network.ips.cleanIps")}
              </label>
              <textarea
                id="clean-ips"
                className="settings-textarea"
                value={cleanIpsText}
                onChange={(event) => setCleanIpsText(event.target.value)}
                rows={4}
                disabled={!canEdit}
                dir="ltr"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="proxy-ips">
                {t("settings.network.ips.proxyIps")}
              </label>
              <textarea
                id="proxy-ips"
                className="settings-textarea"
                value={proxyIpsText}
                onChange={(event) => setProxyIpsText(event.target.value)}
                rows={4}
                disabled={!canEdit}
                dir="ltr"
              />
            </div>
          </div>
          <Input
            label={t("settings.network.ips.ports")}
            value={portsText}
            onChange={(event) => setPortsText(event.target.value)}
            error={portsInvalid ? t("settings.network.ips.portsInvalid") : undefined}
            disabled={!canEdit}
            dir="ltr"
            placeholder="443, 2053"
          />
        </div>
      </Card>

      <Card className="settings-card">
        <h3 className="settings-card-title">
          <Globe size={16} />
          {t("settings.network.dns.title")}
        </h3>
        <div className="settings-form">
          <div className="settings-grid-2">
            <Input
              label={t("settings.network.dns.local")}
              value={network.dns.local}
              onChange={(event) => setDnsField("local", event.target.value)}
              disabled={!canEdit}
              dir="ltr"
            />
            <Input
              label={t("settings.network.dns.antiSanction")}
              value={network.dns.antiSanction}
              onChange={(event) => setDnsField("antiSanction", event.target.value)}
              disabled={!canEdit}
              dir="ltr"
            />
          </div>
          <Input
            label={t("settings.network.dns.remote")}
            value={network.dns.remote}
            onChange={(event) => setDnsField("remote", event.target.value)}
            disabled={!canEdit}
            dir="ltr"
            placeholder={t("settings.network.dns.remotePlaceholder")}
          />
          <Switch
            checked={network.dns.fakeDns}
            onChange={(checked) => setDnsField("fakeDns", checked)}
            label={t("settings.network.dns.fakeDns")}
            disabled={!canEdit}
          />
        </div>
      </Card>

      {canEdit ? (
        <div className="settings-actions">
          <Button type="submit" loading={saving} iconLeft={<Network size={16} />}>
            {t("common.save")}
          </Button>
        </div>
      ) : (
        <Badge tone="neutral">{t("settings.network.readOnly")}</Badge>
      )}
    </form>
  );
}
