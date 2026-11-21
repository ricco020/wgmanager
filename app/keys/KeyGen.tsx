"use client";
/** WireGuard key pair, preshared key and public-from-private, all in the browser (WebCrypto X25519 + getRandomValues).
 *  Nothing is sent: only an anonymous counter (/keys:gen, /keys:derive). */
import { useState } from "react";
import { publicFromPrivate } from "../check/AddPeer";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function pair(): Promise<{ priv: string; pub: string }> {
  const kp = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { priv: b64(unb64url(jwk.d as string)), pub: b64(unb64url(jwk.x as string)) };
}

function count(kind: string) {
  fetch(`/api/check-run?kind=${kind}`, { method: "POST", keepalive: true }).catch(() => {});
}

function Line({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <code style={{ wordBreak: "break-all", fontSize: 14, flex: "1 1 260px" }}>{value}</code>
        <button className="btn sm" type="button" onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}>{done ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

export function KeyGen() {
  const [keys, setKeys] = useState<{ priv: string; pub: string; psk: string } | null>(null);
  const [err, setErr] = useState("");
  const [priv, setPriv] = useState("");
  const [derived, setDerived] = useState("");

  async function gen() {
    setErr("");
    try {
      const k = await pair();
      setKeys({ ...k, psk: b64(crypto.getRandomValues(new Uint8Array(32))) });
      count("keys");
    } catch {
      setErr("This browser cannot generate X25519 keys (WebCrypto). Use a current Chrome, Firefox or Safari, or run the wg commands below.");
    }
  }

  async function derive() {
    const v = priv.trim().replace(/^PrivateKey\s*=\s*/i, "");
    if (!/^[A-Za-z0-9+/]{43}=$/.test(v)) return setDerived("Not a WireGuard private key: it should be 44 characters of base64 ending with =.");
    try {
      setDerived(await publicFromPrivate(v));
      count("keys-derive");
    } catch {
      setDerived("This browser cannot read X25519 keys (WebCrypto). Run: echo '<key>' | wg pubkey");
    }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>New key pair and preshared key</h2>
        <p><button className="btn" type="button" onClick={gen}>{keys ? "Generate again" : "Generate keys"}</button></p>
        {err && <p role="alert">{err}</p>}
        {keys && (
          <>
            <Line label="PrivateKey (goes in this device's [Interface], never shared)" value={keys.priv} />
            <Line label="PublicKey (goes in the other side's [Peer] section)" value={keys.pub} />
            <Line label="PresharedKey (same value in both [Peer] sections of this pair)" value={keys.psk} />
          </>
        )}
      </div>
      <div className="panel" id="derive">
        <h2 style={{ marginTop: 0 }}>Which public key goes with this private key?</h2>
        <p className="muted">Paste a PrivateKey from a .conf file. The public key computed here is the one the other side must list; if it lists another one, the handshake never completes.</p>
        <input aria-label="WireGuard private key" value={priv} onChange={(e) => setPriv(e.target.value)} placeholder="PrivateKey = ..." spellCheck={false} autoComplete="off" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", padding: 10 }} />
        <p><button className="btn sm" type="button" onClick={derive}>Compute the public key</button></p>
        {derived && (/^[A-Za-z0-9+/]{43}=$/.test(derived) ? <Line label="PublicKey" value={derived} /> : <p role="alert">{derived}</p>)}
      </div>
    </>
  );
}
