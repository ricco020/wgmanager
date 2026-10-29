import { SITE, PRODUCT, PRO_PRICE_EUR } from "@/lib/site";

/** schema.org data for the free tools and the product (no rating, no review count: none exist yet).
 *  Invisible on the page; lets search engines and AI answers read what each page does and what it costs. */
const publisher = { "@type": "Organization", name: "VPNSmith", url: "https://www.vpnsmith.com/" };

export function toolLd(path: string, name: string, description: string, features: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    url: `${SITE}${path}`,
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (runs in the browser)",
    browserRequirements: "Requires JavaScript",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    featureList: features,
    publisher,
  };
}

export function productLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: PRODUCT,
    url: `${SITE}/`,
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (runs in the browser)",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "EUR", description: "1 server, 3 peers" },
      {
        "@type": "Offer", name: "Pro", price: String(PRO_PRICE_EUR), priceCurrency: "EUR", url: `${SITE}/pricing`,
        priceSpecification: { "@type": "UnitPriceSpecification", price: String(PRO_PRICE_EUR), priceCurrency: "EUR", unitCode: "MON" },
      },
    ],
    publisher,
  };
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
