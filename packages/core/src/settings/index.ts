import { AppError } from "../index";

/**
 * Panel settings domain — shared between the panel frontend and the API.
 *
 * The API validates and stores these as two JSON rows ("general",
 * "network") in the D1 settings table. Validation mirrors the mock
 * adapter exactly so both paths fail with the same machine codes.
 */

export type FragmentMode = "none" | "custom";
export type FragmentPackets = "tlshello" | "hello-ice" | "1-3";
export type TlsFingerprint =
  | "chrome"
  | "firefox"
  | "safari"
  | "ios"
  | "android"
  | "edge"
  | "random";

export interface FragmentSettings {
  mode: FragmentMode;
  packets: FragmentPackets;
  /** bytes per fragment */
  lengthMin: number;
  lengthMax: number;
  /** ms between fragments */
  delayMin: number;
  delayMax: number;
  /** 0 disables max-split (BPB parity) */
  maxSplitMin: number;
  maxSplitMax: number;
}

export interface EchSettings {
  enabled: boolean;
  serverName: string;
}

export interface CustomCdnSettings {
  addrs: string[];
  host: string;
  sni: string;
}

export interface DnsSettings {
  local: string;
  antiSanction: string;
  /** DoH endpoint; must start with https:// */
  remote: string;
  fakeDns: boolean;
}

export interface NetworkSettings {
  tcpFastOpen: boolean;
  /** seconds; later used as the url-test interval */
  bestPingInterval: number;
  customCdn: CustomCdnSettings;
  cleanIPs: string[];
  proxyIPs: string[];
  ports: number[];
  fingerprint: TlsFingerprint;
  dns: DnsSettings;
}

export interface GeneralSettings {
  panelName: string;
  siteUrl: string;
  subscriptionBaseUrl: string;
  defaultLanguage: "en" | "fa";
  defaultQuotaGb: number;
  defaultExpiryDays: number;
}

export interface PanelSettings {
  general: GeneralSettings;
  network: NetworkSettings;
}

/**
 * Factory defaults for all panel settings. Stored values are merged over
 * these (self-healing: new fields pick up their default). Network
 * defaults follow BPB-Worker-Panel parity.
 */
export const DEFAULT_SETTINGS: PanelSettings = {
  general: {
    panelName: "NexPanel",
    siteUrl: "https://panel.example.com",
    subscriptionBaseUrl: "https://panel.example.com/sub",
    defaultLanguage: "en",
    defaultQuotaGb: 50,
    defaultExpiryDays: 90,
  },
  network: {
    tcpFastOpen: false,
    bestPingInterval: 30,
    customCdn: {
      addrs: [],
      host: "",
      sni: "",
    },
    cleanIPs: [],
    proxyIPs: [],
    ports: [],
    fingerprint: "random",
    dns: {
      local: "1.1.1.1",
      antiSanction: "178.22.122.100",
      remote: "https://8.8.8.8/dns-query",
      fakeDns: false,
    },
  },
};

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", 400, message);
}

/** Throws AppError with the mock adapter's machine codes. */
export function validateNetworkSettings(network: NetworkSettings): void {
  if (!network.ports.every((port) => Number.isInteger(port) && port >= 1 && port <= 65535)) {
    throw new AppError("INVALID_PORTS", 400, "Ports must be integers between 1 and 65535.");
  }

  if (
    !Number.isInteger(network.bestPingInterval) ||
    network.bestPingInterval < 10 ||
    network.bestPingInterval > 3600
  ) {
    throw new AppError("INVALID_PING_INTERVAL", 400, "Ping interval must be 10-3600 seconds.");
  }

  if (!network.dns.remote.startsWith("https://")) {
    throw new AppError("INVALID_DOH_URL", 400, "Remote DNS must be an https:// DoH endpoint.");
  }
}

/** Deliberately loose for now — only the fields the General tab edits. */
export function validateGeneralSettings(general: GeneralSettings): void {
  const panelName = general.panelName.trim();
  if (panelName.length < 1 || panelName.length > 64) {
    invalid("Panel name must be 1-64 characters.");
  }
  for (const key of ["defaultQuotaGb", "defaultExpiryDays"] as const) {
    const value = general[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      invalid(`${key} must be a non-negative number.`);
    }
  }
  if (general.defaultLanguage !== "en" && general.defaultLanguage !== "fa") {
    invalid("Default language must be \"en\" or \"fa\".");
  }
}

/**
 * Section-level merge used by GET (stored over defaults) and PATCH
 * (patch over stored). Nested customCdn/dns objects merge field-by-field;
 * arrays replace wholesale.
 */
export function mergeSettings(
  base: PanelSettings,
  patch: Partial<PanelSettings>,
): PanelSettings {
  const general = { ...base.general, ...patch.general };
  const networkPatch: Partial<NetworkSettings> = patch.network ?? {};
  // Drop keys that no longer belong here. Fragment/ECH moved onto the
  // backend; a stale client still sending them must not resurrect dead
  // fields in the merged output.
  const knownPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(networkPatch)) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS.network, key)) {
      knownPatch[key] = value;
    }
  }
  const network: NetworkSettings = {
    ...base.network,
    ...(knownPatch as Partial<NetworkSettings>),
    customCdn: {
      ...base.network.customCdn,
      ...networkPatch.customCdn,
    } as CustomCdnSettings,
    dns: { ...base.network.dns, ...networkPatch.dns } as DnsSettings,
  };
  return { general, network };
}
