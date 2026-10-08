import { useEffect, useState, type FormEvent } from "react";
import { Globe, Network, Radio, Route, Server, Waypoints } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Switch from "../../components/ui/Switch";
import { useApi } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useToast } from "../../contexts/ToastContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type {
  NetworkSettings,
  PanelSettings,
  TlsFingerprint,
} from "../../types/dto";

interface NetworkTabProps {
  canEdit: boolean;
}

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
      const message = t("settings.network.errors.validation");
      setFormError(message);
      toast.push({ type: "error", title: message });
    } finally {
      setSaving(false);
    }
  }

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
          {t("settings.network.tfo.title")}
        </h3>
        <div className="settings-form">
          <div className="settings-field">
            <Switch
              checked={network.tcpFastOpen}
              onChange={(checked) =>
                setNetwork((current) => ({ ...current, tcpFastOpen: checked }))
              }
              label={t("settings.network.tfo.enable")}
              disabled={!canEdit}
            />
            <p className="settings-field-hint-inline">{t("settings.network.tfo.hint")}</p>
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
