import type { Backend, ConfigUser } from "../domain/types";

/**
 * Protocol URI builders — shared by the mock adapter (frontend), the
 * Workers API (config generation) and the future self-hosted server.
 * Pure functions: no storage, no fetch, no environment access.
 */

function encodeFragment(name: string): string {
  return encodeURIComponent(name).replace(/'/g, "%27");
}

function requireUuid(user: ConfigUser): string {
  if (!user.uuid) {
    throw new Error(`User ${user.id} has no UUID; cannot build ${"vless/vmess/trojan"} URI.`);
  }
  return user.uuid;
}

export function buildVlessUri(user: ConfigUser, backend: Backend): string {
  const params = new URLSearchParams();
  params.set("type", backend.transport);
  params.set("security", backend.security);
  if (backend.sni) params.set("sni", backend.sni);
  if (backend.hostHeader) params.set("host", backend.hostHeader);
  if (backend.path) params.set("path", backend.path);
  if (backend.serviceName) params.set("serviceName", backend.serviceName);
  if (backend.security !== "none") {
    params.set("fp", backend.fingerprint ?? "chrome");
  }
  if (backend.security === "reality") {
    if (backend.realityPublicKey) params.set("pbk", backend.realityPublicKey);
    if (backend.realityShortId) params.set("sid", backend.realityShortId);
  }
  if (backend.allowInsecure) params.set("allowInsecure", "1");
  return `vless://${requireUuid(user)}@${backend.host}:${backend.port}?${params.toString()}#${encodeFragment(
    `${backend.name}-vless`,
  )}`;
}

export function buildVmessUri(user: ConfigUser, backend: Backend): string {
  const json = {
    v: "2",
    ps: `${backend.name}-vmess`,
    add: backend.host,
    port: String(backend.port),
    id: requireUuid(user),
    aid: "0",
    scy: "auto",
    net: backend.transport,
    type: "none",
    host: backend.hostHeader ?? "",
    path: backend.path ?? "",
    tls: backend.security === "none" ? "" : backend.security,
    sni: backend.sni ?? "",
    fp: backend.fingerprint ?? "",
    alpn: "",
  };
  return `vmess://${btoa(JSON.stringify(json))}`;
}

export function buildTrojanUri(user: ConfigUser, backend: Backend): string {
  const params = new URLSearchParams();
  params.set("type", backend.transport);
  params.set("security", backend.security === "none" ? "none" : backend.security);
  if (backend.sni) params.set("sni", backend.sni);
  if (backend.hostHeader) params.set("host", backend.hostHeader);
  if (backend.path) params.set("path", backend.path);
  if (backend.allowInsecure) params.set("allowInsecure", "1");
  return `trojan://${requireUuid(user)}@${backend.host}:${backend.port}?${params.toString()}#${encodeFragment(
    `${backend.name}-trojan`,
  )}`;
}

export function buildShadowsocksUri(user: ConfigUser, backend: Backend): string {
  // SIP002: ss://base64(method:password)@host:port#name
  const method = backend.method ?? "aes-256-gcm";
  const password = user.uuid.replace(/-/g, "").slice(0, 16);
  const userinfo = btoa(`${method}:${password}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const plugin = backend.transport === "ws" && backend.path
    ? `?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3D${encodeURIComponent(backend.hostHeader ?? backend.host)}`
    : "";
  return `ss://${userinfo}@${backend.host}:${backend.port}${plugin}#${encodeFragment(
    `${backend.name}-ss`,
  )}`;
}

/** Build the URI for any supported protocol. */
export function buildUri(user: ConfigUser, backend: Backend): string {
  switch (backend.protocol) {
    case "vless":
      return buildVlessUri(user, backend);
    case "vmess":
      return buildVmessUri(user, backend);
    case "trojan":
      return buildTrojanUri(user, backend);
    case "shadowsocks":
      return buildShadowsocksUri(user, backend);
  }
}
