"use client";

import { useEffect, useRef, useState } from "react";
import { checkConfig, EP_KEY, HANDOFF_KEY, type CheckResult } from "@/lib/check";
import { FREE_LIMITS, PRO_PRICE_EUR } from "@/lib/site";
import { AddPeer } from "./AddPeer";

const SAMPLE = `[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = aF0o53XJEjcl2+ZWL3E5wl7O7gGixHGQ5egSGSgt9Tc=
MTU = 1500

[Peer]
# laptop
PublicKey = qAXRCjpqAx8gnyC5NmNPgP7kiJjiYEbc/0/H8Z9oTXk=
AllowedIPs = 10.8.0.2/24

[Peer]
# phone
PublicKey = 6M4zx9ir7bsBjLrxe37ecnBl0stbQW4eCFYAwUvDn8o=
AllowedIPs = 10.8.0.3/32
`;

export function Checker({ signedIn }: { signedIn: boolean }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [res, setRes] = useState<CheckResult | null>(null);
  const [text, setText] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [fromGen, setFromGen] = useState(false);

  function run(source = "") {
    const t = ta.current?.value ?? "";
    if (!t.trim()) return;
    const r = checkConfig(t);
    setRes(r);
    setText(t);
    // Usage counter only: the file content is not part of the request.
    fetch(`/api/check-run?kind=${r.kind}&peers=${r.peers}${source ? `&from=${source}` : ""}`, { method: "POST", keepalive: true }).catch(() => {});
  }

  // A wg0.conf sent by the VPNSmith generator travels in the URL fragment (#conf=<base64url>&ep=<host:port>):
  // browsers never send a fragment to the server, and it is erased from the address bar as soon as it is read.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const b64 = h.get("conf");
    if (!b64 || !ta.current) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    try {
      const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
      const conf = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      if (!conf.includes("[Interface]")) return;
      ta.current.value = conf;
      const ep = (h.get("ep") ?? "").trim().slice(0, 253);
      if (ep) { setEndpoint(ep); try { sessionStorage.setItem(EP_KEY, ep); } catch { /* storage unavailable */ } }
      setFromGen(true);
      run("gen");
    } catch { /* malformed fragment: the visitor pastes the file */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendToImport(extra = "") {
    try { sessionStorage.setItem(HANDOFF_KEY, text.replace(/\s*$/, "\n") + extra); } catch { /* private mode: the user pastes again */ }
    const peers = (res?.peers ?? 0) + (extra ? 1 : 0);
    fetch(`/api/check-run?kind=import&peers=${peers}`, { method: "POST", keepalive: true }).catch(() => {});
    window.location.href = signedIn ? "/dashboard#import" : `/signup?next=import&peers=${peers}`;
  }

  const counts = res ? { error: 0, warn: 0, info: 0, ...Object.fromEntries((["error", "warn", "info"] as const).map((l) => [l, res.findings.filter((f) => f.level === l).length])) } : null;

  return (
    <div className="checker">
      {fromGen && <div className="ok" style={{ marginBottom: 12 }}>The wg0.conf you just generated on VPNSmith is loaded below. It was read from the link in your browser and has not been uploaded.</div>}
      <label>Paste a wg0.conf (server) or a client .conf
        <textarea ref={ta} rows={14} spellCheck={false} autoComplete="off" placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.8.0.2/32\n\n[Peer]\nPublicKey = ...\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0"} style={{ fontSize: 13 }} />
      </label>
      <p style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <button className="btn" type="button" onClick={() => run()}>Check this config</button>
        <button className="btn ghost sm" type="button" onClick={() => { if (ta.current) ta.current.value = SAMPLE; run(); }}>Try a broken example</button>
        <span className="muted" style={{ fontSize: 13 }}>Runs in your browser. The file, and its keys, are never uploaded.</span>
      </p>

      {res && counts && (
        <div className="panel fade" aria-live="polite">
          {res.kind !== "unknown" && <h3 style={{ margin: "0 0 10px" }}>{res.kind === "wg-easy" ? "wg-easy data file: wg-quick does not read it" : counts.error ? `${counts.error} error${counts.error === 1 ? "" : "s"} to fix in this file` : "Valid file. The connection itself is not tested here."}</h3>}
          <p style={{ marginBottom: 14 }}>
            <span className="tag">{res.kind === "unknown" ? "type unclear" : `${res.kind} config`}</span>{" "}
            <span className="tag">{res.peers} peer{res.peers === 1 ? "" : "s"}</span>{" "}
            <span className="tag" style={counts.error ? { borderColor: "var(--red)", color: "var(--red)" } : { borderColor: "var(--green)", color: "var(--green)" }}>{counts.error} error{counts.error === 1 ? "" : "s"}</span>{" "}
            <span className="tag">{counts.warn} warning{counts.warn === 1 ? "" : "s"}</span>
          </p>
          {res.findings.length === 0 ? (
            <div className="ok">Keys are well-formed, addresses and routes are consistent.</div>
          ) : (
            <ul className="findings">
              {res.findings.map((f, i) => (
                <li key={i} className={`f-${f.level}`}>
                  <b>{f.level === "error" ? "Error" : f.level === "warn" ? "Warning" : "Note"}</b>
                  <span className="muted"> {f.where}{f.line ? `, line ${f.line}` : ""}</span>
                  <div>{f.msg}</div>
                </li>
              ))}
            </ul>
          )}

          {res.privateEndpoint && (
            <div className="handoff">
              <h3>This Endpoint is a private address</h3>
              <p className="muted">
                Free fix first: behind a home router, forward the UDP port (51820 by default) on the router to the WireGuard machine and put your public IP
                or a dynamic DNS name in Endpoint. Behind a carrier-grade NAT (an address in 100.64.x.x, common on mobile and some fiber
                plans), port forwarding is impossible: the server needs a public IPv4, from your provider or from a small VPS.
              </p>
              <p className="muted" style={{ fontSize: 14 }}>
                Affiliate link, VPNSmith may earn a commission and the price is the same for you:{" "}
                <a href="/out/vps?from=check-private" rel="sponsored nofollow">Contabo VPS with WireGuard preinstalled</a>.
              </p>
            </div>
          )}
          {res.kind === "client" && counts.error === 0 && !res.privateEndpoint && (
            <div className="handoff">
              <h3>Valid file, still no handshake?</h3>
              <p className="muted">This page checks the file, not the connection. When the file is right, the cause is one of these four, in this order:</p>
              <ol className="diag">
                <li><b>The server knows this client.</b> On the server, <code>wg show</code> lists this client&apos;s public key under a peer.</li>
                <li><b>The UDP port is open twice.</b> The server firewall (ufw, nftables) and the cloud provider&apos;s firewall both allow the ListenPort over UDP.</li>
                <li><b>The Endpoint points to the server.</b> The name in Endpoint resolves to the server&apos;s current public IP.</li>
                <li><b>The network lets UDP out.</b> If it works on mobile data but not on one network (office, hotel, campus), that network blocks UDP. WireGuard has no obfuscation mode; nothing in this file changes that.</li>
              </ol>
              <div className="aside">
                <span className="tag">Affiliate link</span>
                <p className="muted" style={{ fontSize: 14, margin: "8px 0 0" }}>
                  Option for a network that blocks WireGuard, for your own device: a VPN app with an obfuscated protocol gets through.{" "}
                  <a href="/out/vpn?from=check-blocked" rel="sponsored nofollow">Proton VPN</a> has Stealth, on every plan including Free.
                  VPNSmith may earn a commission; the price is the same for you.
                </p>
              </div>
            </div>
          )}
          {res.kind === "wg-easy" && res.peers > 0 && !counts.error && (
            <div className="handoff">
              <h3>Get a wg0.conf and one .conf per device from it</h3>
              <p className="muted">
                Import it into WireGuard Manager: the server key and the {res.peers} enabled client{res.peers === 1 ? "" : "s"} come across as they are, and because the file
                holds each client&apos;s private key, every device&apos;s .conf and QR code are ready at once. Useful to stay on v14 (armv6 and armv7 hosts cannot run v15)
                or to retire the panel and run plain wg-quick. Nothing changes on the server.
                {res.peers > FREE_LIMITS.peers
                  ? ` The free plan holds ${FREE_LIMITS.peers} peers; Pro (${PRO_PRICE_EUR} EUR/month) holds all ${res.peers}.`
                  : ` Free for ${FREE_LIMITS.servers} server and ${FREE_LIMITS.peers} peers.`}
              </p>
              <button className="btn" type="button" onClick={() => sendToImport()}>Import this wg0.json</button>
            </div>
          )}
          {res.kind === "server" && res.peers > 0 && (
            <div className="handoff">
              <h3>Stop editing this file by hand</h3>
              <p className="muted">
                Import it into WireGuard Manager: the {res.peers} peer{res.peers === 1 ? "" : "s"} and keys stay exactly as they are, nothing changes on the devices.
                New peers get the next free IP (no more overlaps), and each one gets its .conf and QR code.
                {res.peers > FREE_LIMITS.peers
                  ? ` The free plan holds ${FREE_LIMITS.peers} peers; Pro (${PRO_PRICE_EUR} EUR/month) holds all ${res.peers}.`
                  : ` Free for ${FREE_LIMITS.servers} server and ${FREE_LIMITS.peers} peers.`}
              </p>
              <button className="btn" type="button" onClick={() => sendToImport()}>Import this wg0.conf</button>
            </div>
          )}
          {res.kind === "server" && <AddPeer key={text} text={text} peers={res.peers} signedIn={signedIn} onImport={sendToImport} defaultEndpoint={endpoint.replace(/:\d+$/, "")} />}
          {res.kind === "client" && (
            <div className="handoff">
              <h3>Issue client files that are right the first time</h3>
              <p className="muted">WireGuard Manager writes every client .conf from the server&apos;s settings: matching keys, a free IP, IPv6 and DNS covered in full tunnel, keepalive set. Free for {FREE_LIMITS.peers} peers.</p>
              <a className="btn" href={signedIn ? "/dashboard" : "/signup"}>Manage peers for free</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
