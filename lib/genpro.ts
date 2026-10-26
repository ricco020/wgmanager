/** WireGuard Pro for the free VPNSmith generator: a one-time 9 EUR payment that unlocks
 *  more clients and the batch export (one ZIP with every .conf and its QR code). The keys never
 *  leave the visitor's browser; the paid Checkout session id is the licence the generator checks. */
export const GEN_PROJECT = "wgmanager-gen";
export const GEN_PRICE_CENTS = 900;
export const GEN_ORIGIN = "https://www.vpnsmith.com";
export const GEN_LOCALES = ["en", "fr", "es", "de", "it", "pt"] as const;
export const SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

export function genUrl(locale: string): string {
  const l = (GEN_LOCALES as readonly string[]).includes(locale) ? locale : "en";
  return `${GEN_ORIGIN}/${l}/tools/wireguard-config-generator`;
}

export function cors(): Record<string, string> {
  return { "Access-Control-Allow-Origin": GEN_ORIGIN, "Access-Control-Allow-Methods": "GET", Vary: "Origin" };
}
