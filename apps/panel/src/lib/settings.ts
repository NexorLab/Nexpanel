import type { PanelSettings } from "../types/dto";

/**
 * Factory defaults for all panel settings. The mock adapter merges stored
 * values over these (self-healing: new fields pick up their default), and
 * the real backend will seed its D1 settings table from the same shape.
 * Network defaults follow BPB-Worker-Panel parity.
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
