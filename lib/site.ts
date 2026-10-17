export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const PRODUCT = "WireGuard Manager";
export const BRAND = "by VPNSmith";
export const PRO_PRICE_EUR = 9;
export const FREE_LIMITS = { servers: 1, peers: 3 };
export const EMAIL = "ads.ericgerard@gmail.com";
export const LEGAL_PUBLISHER = {
  name: "Eric LEROY",
  status: "sole trader (entrepreneur individuel, micro-entreprise) registered in France",
  address: "18bis rue Bricka, 06160 Juan-les-Pins, France",
  phone: "+33 6 79 04 78 65",
  phoneHref: "+33679047865",
  siret: "504 527 763 00024",
  siren: "504 527 763",
} as const;
export const LEGAL_HOST = {
  name: "Railway Corporation",
  address: "548 Market St PMB 68956, San Francisco, CA 94104, United States",
  url: "https://railway.com",
} as const;
