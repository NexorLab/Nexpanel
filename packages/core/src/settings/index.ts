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

/** Ignored while fragment.mode is "custom" — fragment takes precedence (BPB parity). */
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
  fragment: FragmentSettings;
  ech: EchSettings;
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
    fragment: {
      mode: "none",
      packets: "tlshello",
      lengthMin: 100,
      lengthMax: 200,
      delayMin: 1,
      delayMax: 1,
      maxSplitMin: 0,
      maxSplitMax: 0,
    },
    ech: {
      enabled: false,
      serverName: "",
    },
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
  const fragment = network.fragment;

  const invalidLength =
    !Number.isInteger(fragment.lengthMin) ||
    !Number.isInteger(fragment.lengthMax) ||
    fragment.lengthMin < 20 ||
    fragment.lengthMax > 1000 ||
    fragment.lengthMin > fragment.lengthMax;
  if (invalidLength) {
    throw new AppError("INVALID_FRAGMENT_LENGTH", 400, "Invalid fragment length range.");
  }

  const invalidDelay =
    !Number.isInteger(fragment.delayMin) ||
    !Number.isInteger(fragment.delayMax) ||
    fragment.delayMin < 0 ||
    fragment.delayMax > 5000 ||
    fragment.delayMin > fragment.delayMax;
  if (invalidDelay) {
    throw new AppError("INVALID_FRAGMENT_DELAY", 400, "Invalid fragment delay range.");
  }

  const invalidSplit =
    !Number.isInteger(fragment.maxSplitMin) ||
    !Number.isInteger(fragment.maxSplitMax) ||
    fragment.maxSplitMin < 0 ||
    fragment.maxSplitMax > 20 ||
    fragment.maxSplitMin > fragment.maxSplitMax;
  if (invalidSplit) {
    throw new AppError("INVALID_FRAGMENT_SPLIT", 400, "Invalid fragment split range.");
  }

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

  const serverName = network.ech.serverName.trim();
  if (serverName && !/^(?=.{1,253}$)([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/i.test(serverName)) {
    throw new AppError("INVALID_ECH_SERVER_NAME", 400, "Invalid ECH server name.");
  }

  if (network.fragment.mode === "custom" && network.ech.enabled) {
    throw new AppError(
      "FRAGMENT_ECH_CONFLICT",
      409,
      "Fragment and ECH cannot be enabled together.",
    );
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
 * (patch over stored). Nested fragment/ech/customCdn/dns objects merge
 * field-by-field; arrays replace wholesale.
 */
export function mergeSettings(
  base: PanelSettings,
  patch: Partial<PanelSettings>,
): PanelSettings {
  const general = { ...base.general, ...patch.general };
  const networkPatch: Partial<NetworkSettings> = patch.network ?? {};
  const network: NetworkSettings = {
    ...base.network,
    ...networkPatch,
    fragment: {
      ...base.network.fragment,
      ...networkPatch.fragment,
    } as FragmentSettings,
    ech: { ...base.network.ech, ...networkPatch.ech } as EchSettings,
    customCdn: {
      ...base.network.customCdn,
      ...networkPatch.customCdn,
    } as CustomCdnSettings,
    dns: { ...base.network.dns, ...networkPatch.dns } as DnsSettings,
  };
  return { general, network };
}
