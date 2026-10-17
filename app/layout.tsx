import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT, SITE } from "@/lib/site";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `${PRODUCT}: multi-server WireGuard config manager`, template: `%s | ${PRODUCT}` },
  description: "Manage WireGuard servers and peers in one place: automatic IP allocation, keys generated and stored encrypted, .conf downloads and QR codes. Free for 1 server and 3 peers.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="nav">
            <a className="brand" href="/">WireGuard <span>Manager</span></a>
            <nav>
              <a href="/pricing">Pricing</a>
              {user ? (
                <>
                  <a href="/dashboard">Dashboard</a>
                  <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
                    <button className="btn ghost sm" type="submit" style={{ marginLeft: 18 }}>Log out</button>
                  </form>
                </>
              ) : (
                <>
                  <a href="/login">Log in</a>
                  <a className="btn sm" href="/signup" style={{ marginLeft: 18 }}>Start free</a>
                </>
              )}
            </nav>
          </header>
          <main>{children}</main>
          <footer>
            <a href="/legal">Legal notice</a>
            <a href="/terms">Terms of sale</a>
            <a href="https://www.vpnsmith.com/en/tools/wireguard-config-generator" rel="noopener">Free one-shot generator on VPNSmith</a>
            <div style={{ marginTop: 10 }}>WireGuard is a registered trademark of Jason A. Donenfeld. This service is not affiliated with the WireGuard project.</div>
          </footer>
        </div>
      </body>
    </html>
  );
}
