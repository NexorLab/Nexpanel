import type { Backend, Config, ConfigUser, Subscription } from "../domain/types";
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
 */

export type SubscriptionFormat = Subscription["format"];

/** Everything needed to render one delivered entry. */
export interface SubConfigSource {
  config: Config;
  backend: Backend;
  user: ConfigUser;
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
  const { backend, user, config } = source;
  const proxy: Record<string, unknown> = {
    name: config.name,
    server: backend.host,
    port: backend.port,
    udp: true,
  };
  if (backend.allowInsecure) proxy["skip-cert-verify"] = true;
  if (backend.security !== "none") proxy["tls"] = true;
  if (backend.sni) proxy["servername"] = backend.sni;
  if (backend.fingerprint) proxy["client-fingerprint"] = backend.fingerprint;
  if (backend.security === "reality") {
    proxy["reality-opts"] = {
      "public-key": backend.realityPublicKey,
      "short-id": backend.realityShortId,
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

function singboxTls(backend: Backend): Record<string, unknown> | null {
  if (backend.security === "none") return null;
  const tls: Record<string, unknown> = {
    enabled: true,
    server_name: backend.sni ?? backend.host,
    insecure: backend.allowInsecure,
    utls: { enabled: true, fingerprint: backend.fingerprint ?? "chrome" },
  };
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
  const tls = singboxTls(backend);
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
  return JSON.stringify({ log: { level: "info" }, outbounds }, null, 2);
}
