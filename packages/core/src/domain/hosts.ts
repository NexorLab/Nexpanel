/**
 * Hostname validation — shared by the API backend routes and the panel
 * form. The config URI builders put `host` straight into the authority
 * section (`vless://uuid@host:port`), so anything that isn't a bare
 * hostname or IP breaks the URI at the client: `https://a.com` makes
 * v2rayNG split on the first `://` and read the scheme as the address,
 * which shows up as an empty address/port in the client. Reject those
 * here instead of shipping a config that can never connect.
 */

/**
 * RFC 1123 label: letters, digits, hyphen; must not start or end with a
 * hyphen; 1-63 bytes. Used for the labels of a dotted hostname.
 */
function isValidLabel(label: string): boolean {
  if (label.length < 1 || label.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label);
}

function isValidIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function isValidIpv6(host: string): boolean {
  // The bracketed form is what belongs in a URI ("[::1]"); accept the bare
  // form too, since it is unambiguous as a single field value.
  const address = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (address.length === 0) return false;
  // "::" may appear at most once, standing in for a run of elided groups.
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  const isCompressed = halves.length === 2;
  if (!isCompressed && groups.length !== 8) return false;
  // Compression must elide at least one group.
  if (isCompressed && groups.length >= 8) return false;
  return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group));
}

/**
 * True only for a bare hostname or IP address — no scheme, no port, no
 * path, no userinfo. Used for `host` (required) and `sni`/`hostHeader`
 * (optional; only checked when a value is present).
 */
export function isValidHost(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  // A scheme or a path belongs to a URL, not a host.
  if (host.includes("://") || host.includes("/")) return false;
  // A trailing dot is legal DNS syntax but inconsistent across clients.
  if (host.endsWith(".")) return false;
  if (isValidIpv4(host)) return true;
  if (host.includes(":")) return isValidIpv6(host);
  if (!host.includes(".")) return false;
  return host.split(".").every(isValidLabel);
}
