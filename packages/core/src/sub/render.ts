import type { Backend, Config, ConfigUser, Subscription } from "../domain/types";
import type { NetworkSettings } from "../settings/index";
import { encodeBase64 } from "../crypto/base64";
import { shadowsocksPassword } from "../protocols/uri";

/**
 * Subscription body renderers for the public /sub/:token delivery
 * endpoint. Shared with the future self-hosted entry — pure functions
 * over (config, backend, user) triples, no storage, no fetch.
 *
 * clash output is a minimal but valid config (proxies + one select
 * group); sing-box output is a minimal outbounds document. The two
 * renderers mirror the URI builders in protocols/uri.ts so every
 * format describes the same underlying config.
 *
 * ECH and fragmentation come from the *backend* (they describe the
 * server), while dns/fingerprint/tfo are panel-wide and arrive via
 * `network`.
 */

export type SubscriptionFormat = Subscription["format"];

/** Everything needed to render one delivered entry. */
export interface SubConfigSource {
  config: Config;
  backend: Backend;
  user: ConfigUser;
  /** Panel-wide network settings; the backend's own values win where it
   *  sets one (fingerprint) and fragment/ECH override ECH at render time. */
  network: NetworkSettings;
}

/** Render the response body for a subscription in the given format. */
export function renderSubscriptionBody(
  sources: SubConfigSource[],
  format: SubscriptionFormat,
): string {
  switch (format) {
    case "plain":
      return renderPlainBody(sources);
    case "base64":
      return renderBase64Body(sources);
    case "clash":
      return renderClashBody(sources);
    case "singbox":
      return renderSingboxBody(sources);
  }
}

function renderPlainBody(sources: SubConfigSource[]): string {
  return sources.map((source) => source.config.uri).join("\n");
}

function renderBase64Body(sources: SubConfigSource[]): string {
  // encodeBase64, not plain btoa — URIs embed user-chosen names.
  return encodeBase64(renderPlainBody(sources));
}

// ---- clash (mihomo-compatible minimal YAML) ----

function clashProxy(source: SubConfigSource): Record<string, unknown> {
  const { backend, user, config, network } = source;
  // The backend's own fingerprint is more specific than the panel default.
  const fingerprint = backend.fingerprint ?? network.fingerprint;
  const proxy: Record<string, unknown> = {
    name: config.name,
    server: backend.host,
    port: backend.port,
    udp: true,
  };
  if (network.tcpFastOpen) proxy["tfo"] = true;
  if (backend.allowInsecure) proxy["skip-cert-verify"] = true;
  if (backend.security !== "none") proxy["tls"] = true;
  if (backend.sni) proxy["servername"] = backend.sni;
  if (fingerprint) proxy["client-fingerprint"] = fingerprint;
  if (backend.security === "reality") {
    proxy["reality-opts"] = {
      "public-key": backend.realityPublicKey,
      "short-id": backend.realityShortId,
    };
  }
  // ECH is delegated to the client: we only name the server whose HTTPS
  // record carries the ECHConfig, and mihomo resolves it over DoH.
  // Fragment takes precedence — the two fight over the same TLS handshake.
  if (backend.ech.enabled && backend.security === "tls" && backend.fragment.mode === "none") {
    proxy["ech-opts"] = {
      enable: true,
      "query-server-name": backend.ech.serverName,
    };
  }
  switch (backend.protocol) {
    case "vless":
      proxy["type"] = "vless";
      proxy["uuid"] = user.uuid;
      break;
    case "vmess":
      proxy["type"] = "vmess";
      proxy["uuid"] = user.uuid;
      proxy["alterId"] = 0;
      proxy["cipher"] = "auto";
      break;
    case "trojan":
      proxy["type"] = "trojan";
      proxy["password"] = user.uuid;
      break;
    case "shadowsocks":
      proxy["type"] = "ss";
      proxy["cipher"] = backend.method ?? "aes-256-gcm";
      proxy["password"] = shadowsocksPassword(user);
      break;
  }
  switch (backend.transport) {
    case "ws":
      proxy["network"] = "ws";
      proxy["ws-opts"] = {
        path: backend.path ?? "/",
        headers: backend.hostHeader ? { Host: backend.hostHeader } : undefined,
      };
      break;
    case "grpc":
      proxy["network"] = "grpc";
      proxy["grpc-opts"] = { "grpc-service-name": backend.serviceName ?? "" };
      break;
    case "httpupgrade":
      proxy["network"] = "httpupgrade";
      proxy["httpupgrade-opts"] = {
        path: backend.path ?? "/",
        host: backend.hostHeader ?? backend.host,
      };
      break;
    // tcp emits nothing; xhttp is Xray-specific and has no clash mapping.
  }
  return proxy;
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function yamlScalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // JSON string escapes are valid YAML double-quoted scalars; always
  // quoting keeps colons/#/leading specials safe.
  return JSON.stringify(String(value));
}

/** Recursive emitter for the plain maps this module builds. */
function emitYamlNode(key: string, value: unknown, indent: number, marker = ""): string[] {
  const pad = " ".repeat(indent);
  const head = `${pad}${marker}${key}:`;
  if (isScalar(value)) {
    return [`${head} ${value === null || value === undefined ? "null" : yamlScalar(value)}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${head} []`];
    const lines: string[] = [head];
    for (const item of value) {
      if (isScalar(item)) {
        lines.push(`${pad}  - ${yamlScalar(item)}`);
      } else {
        const entries = Object.entries(item as Record<string, unknown>).filter(
          ([, v]) => v !== undefined,
        );
        entries.forEach(([entryKey, entryValue], index) => {
          lines.push(...emitYamlNode(entryKey, entryValue, indent + 2, index === 0 ? "- " : "  "));
        });
      }
    }
    return lines;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return [`${head} {}`];
  const lines: string[] = [head];
  for (const [entryKey, entryValue] of entries) {
    lines.push(...emitYamlNode(entryKey, entryValue, indent + 2));
  }
  return lines;
}

function renderClashBody(sources: SubConfigSource[]): string {
  const document: Record<string, unknown> = {
    port: 7890,
    "socks-port": 7891,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    proxies: sources.map(clashProxy),
    "proxy-groups": [
      {
        name: "NexPanel",
        type: "select",
        proxies: sources.map((source) => source.config.name),
      },
    ],
    rules: ["MATCH,NexPanel"],
  };
  const lines: string[] = [];
  for (const [key, value] of Object.entries(document)) {
    lines.push(...emitYamlNode(key, value, 0));
  }
  return `${lines.join("\n")}\n`;
}

// ---- sing-box (minimal outbounds JSON) ----

function singboxTls(source: SubConfigSource): Record<string, unknown> | null {
  const { backend, network } = source;
  if (backend.security === "none") return null;
  const fingerprint = backend.fingerprint ?? network.fingerprint;
  const tls: Record<string, unknown> = {
    enabled: true,
    server_name: backend.sni ?? backend.host,
    insecure: backend.allowInsecure,
    utls: { enabled: true, fingerprint: fingerprint ?? "chrome" },
  };
  // Record fragmentation is a TLS-level setting in sing-box (no separate
  // outbound), so it covers every protocol over TLS in one field.
  if (backend.fragment.mode === "custom") {
    tls.record_fragment = true;
  }
  // ECH delegated to the client. A TLS extension, so reality is excluded
  // here — ECH negotiates inside the real handshake, reality fakes one.
  if (backend.ech.enabled && backend.security === "tls" && backend.fragment.mode === "none") {
    tls.ech = {
      enabled: true,
      query_server_name: backend.ech.serverName,
    };
  }
  if (backend.security === "reality") {
    tls.reality = {
      enabled: true,
      public_key: backend.realityPublicKey,
      short_id: backend.realityShortId,
    };
  }
  return tls;
}

function singboxTransport(backend: Backend): Record<string, unknown> | null {
  switch (backend.transport) {
    case "ws":
      return {
        type: "ws",
        path: backend.path ?? "/",
        headers: backend.hostHeader ? { Host: backend.hostHeader } : undefined,
      };
    case "grpc":
      return { type: "grpc", service_name: backend.serviceName ?? "" };
    case "httpupgrade":
      return {
        type: "httpupgrade",
        path: backend.path ?? "/",
        host: backend.hostHeader ?? backend.host,
      };
    default:
      // tcp needs no transport; xhttp is Xray-specific (no sing-box form).
      return null;
  }
}

function singboxOutbound(source: SubConfigSource): Record<string, unknown> {
  const { backend, user, config } = source;
  const outbound: Record<string, unknown> = {
    type: backend.protocol === "shadowsocks" ? "shadowsocks" : backend.protocol,
    tag: config.name,
    server: backend.host,
    server_port: backend.port,
  };
  switch (backend.protocol) {
    case "vless":
      outbound.uuid = user.uuid;
      break;
    case "vmess":
      outbound.uuid = user.uuid;
      outbound.security = "auto";
      outbound.alter_id = 0;
      break;
    case "trojan":
      outbound.password = user.uuid;
      break;
    case "shadowsocks":
      outbound.method = backend.method ?? "aes-256-gcm";
      outbound.password = shadowsocksPassword(user);
      break;
  }
  const tls = singboxTls(source);
  if (tls) outbound.tls = tls;
  const transport = singboxTransport(backend);
  if (transport) outbound.transport = transport;
  return outbound;
}

function renderSingboxBody(sources: SubConfigSource[]): string {
  const outbounds: Record<string, unknown>[] = sources.map(singboxOutbound);
  if (outbounds.length > 0) {
    outbounds.push({
      type: "selector",
      tag: "NexPanel",
      outbounds: sources.map((source) => source.config.name),
      default: sources[0].config.name,
    });
  }
  return JSON.stringify(
    { log: { level: "info" }, dns: singboxDns(sources), outbounds },
    null,
    2,
  );
}

/**
 * Minimal DNS section for sing-box.
 *
 * The remote server resolves through the proxy itself (detour → the
 * selector) so domain lookups are not leaked to a censored resolver. The
 * direct server resolves locally, and is the *only* path used for ECH:
 * fetching the HTTPS record of the very server you are about to connect
 * to through the tunnel it builds would be circular, so its query is
 * routed direct. Without this rule, sing-box still fetches the record,
 * but over the proxied path — in a censored environment that is exactly
 * where the lookup gets poisoned, defeating the point of ECH.
 *
 * Mirrors BPB's `buildDNS` (sing-box/dns.ts:47-51), minus the geo rule
 * sets NexPanel does not ship.
 */
function singboxDns(sources: SubConfigSource[]): Record<string, unknown> {
  const network = sources[0]?.network;
  const rules: Record<string, unknown>[] = [
    // Resolve the ECH server names directly — see the note above.
    ...echServerNames(sources).map((serverName) => ({
      domain_suffix: [serverName],
      query_type: ["HTTPS"],
      action: "route",
      server: "dns-direct",
    })),
  ];

  const dns: Record<string, unknown> = {
    servers: [
      {
        type: "https",
        server: network?.dns.remote.replace(/^https?:\/\//, "") ?? "8.8.8.8",
        detour: "NexPanel",
        tag: "dns-remote",
      },
      { type: "udp", server: network?.dns.local ?? "1.1.1.1", tag: "dns-direct" },
    ],
    rules,
    strategy: "ipv4_only",
    independent_cache: true,
  };
  if (network?.dns.fakeDns) {
    (dns.servers as Record<string, unknown>[]).push({
      type: "fakeip",
      tag: "dns-fake",
      inet4_range: "198.18.0.0/15",
    });
  }
  return dns;
}

/** Distinct ECH server names across delivered backends (fragment off). */
function echServerNames(sources: SubConfigSource[]): string[] {
  const names = sources
    .filter(
      (source) =>
        source.backend.ech.enabled &&
        source.backend.security === "tls" &&
        source.backend.fragment.mode === "none",
    )
    .map((source) => source.backend.ech.serverName)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  return [...new Set(names)];
}
