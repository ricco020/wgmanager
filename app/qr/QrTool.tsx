"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { checkConfig, type Finding } from "@/lib/check";

/** Turns a WireGuard client file into the QR code the mobile apps scan. Everything happens in the page:
 *  the file, and its private key, never leave the browser. Only a counter is sent, without the content. */
export function QrTool() {
  const [text, setText] = useState("");
  const [name, setName] = useState("wg-client");
  const [qr, setQr] = useState<string | null>(null);
  const [problems, setProblems] = useState<Finding[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function make(src = text) {
    const conf = src.trim();
    setQr(null); setNote(null); setProblems([]);
    if (!conf) { setNote("Paste a client configuration first."); return; }
    const res = checkConfig(conf);
    const errors = res.findings.filter((f) => f.level === "error");
    if (res.kind === "server") {
      setNote(`This is a server file (${res.peers} peer${res.peers === 1 ? "" : "s"}). A phone scans a CLIENT file: one [Interface] with the client's PrivateKey and Address, one [Peer] with the server's PublicKey and Endpoint. To create a client for this server, use "Add a peer" in the config checker.`);
      fetch("/api/check-run?kind=qr-server", { method: "POST", keepalive: true }).catch(() => {});
      return;
    }
    setProblems(errors);
    const url = await QRCode.toDataURL(conf, { margin: 2, width: 320, errorCorrectionLevel: "M" });
    setQr(url);
    fetch(`/api/check-run?kind=qr${errors.length ? "-errors" : ""}`, { method: "POST", keepalive: true }).catch(() => {});
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    const t = await f.text();
    setText(t);
    setName(f.name.replace(/\.conf$/i, "") || "wg-client");
    make(t);
  }

  return (
    <div className="checker">
      <div className="tool2">
        <div>
          <p className="privacy"><span aria-hidden>●</span> Converted in this page. The file and its private key are not uploaded.</p>
          <label>
            Client configuration (.conf)
            <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off"
              placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.8.0.2/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ...\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.example.com:51820"} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0 0" }}>
            <button className="btn" type="button" onClick={() => make()}>Make the QR code</button>
            <label className="btn ghost sm" style={{ cursor: "pointer", display: "inline-block" }}>
              Open a .conf file
              <input type="file" accept=".conf,text/plain" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        <div className="qr-slot" aria-live="polite">
          {qr ? (
            <div>
              <img src={qr} width={280} height={280} alt="QR code of the WireGuard client configuration pasted on the left" style={{ background: "#fff", borderRadius: 6, maxWidth: "100%", height: "auto" }} />
              <p style={{ margin: "10px 0", color: "var(--text)" }}>WireGuard app: <strong>+</strong>, then scan from QR code.</p>
              <a className="btn ghost sm" href={qr} download={`${name}.png`}>Download PNG</a>
            </div>
          ) : (
            <div>
              <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden fill="none" stroke="currentColor" strokeWidth="3">
                <rect x="6" y="6" width="30" height="30" rx="3" /><rect x="60" y="6" width="30" height="30" rx="3" /><rect x="6" y="60" width="30" height="30" rx="3" />
                <rect x="16" y="16" width="10" height="10" /><rect x="70" y="16" width="10" height="10" /><rect x="16" y="70" width="10" height="10" />
                <path d="M60 60h10v10H60zM80 60h10M60 82h30M80 70v12" />
              </svg>
              <p style={{ margin: "12px 0 0" }}>The code for the phone appears here.</p>
            </div>
          )}
        </div>
      </div>

      {note && <div className="panel fade" style={{ marginTop: 18 }}><p className="muted" style={{ margin: 0 }}>{note}</p></div>}

      {qr && (
        <div className="panel fade" style={{ marginTop: 18 }}>
          {problems.length > 0 && (
            <>
              <p style={{ marginTop: 0 }}>The code is ready, but the app will refuse or misuse this file:</p>
              <ul className="findings">
                {problems.slice(0, 4).map((p, i) => <li key={i} className="f-error">{p.where}{p.line ? ` (line ${p.line})` : ""}: {p.msg}</li>)}
              </ul>
              <p className="muted">The full list is in the <a href="/check?ref=qr">config checker</a>.</p>
            </>
          )}
          <p className="muted" style={{ margin: 0 }}>Android: &quot;Scan from QR code&quot;. iOS: &quot;Create from QR code&quot;. This image holds the client&apos;s private key: do not post a screenshot of it, anyone who scans it can join your VPN as this device.</p>
        </div>
      )}
    </div>
  );
}
