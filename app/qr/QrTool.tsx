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
      <label>
        Client configuration (.conf)
        <textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off"
          placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.8.0.2/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ...\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.example.com:51820"}
          style={{ fontSize: 13 }} />
      </label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0 18px" }}>
        <button className="btn" type="button" onClick={() => make()}>Make the QR code</button>
        <label className="btn ghost sm" style={{ cursor: "pointer" }}>
          Open a .conf file
          <input type="file" accept=".conf,text/plain" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      {note && <div className="panel fade" aria-live="polite"><p className="muted" style={{ margin: 0 }}>{note}</p></div>}

      {qr && (
        <div className="panel fade" aria-live="polite">
          {problems.length > 0 && (
            <>
              <p style={{ marginTop: 0 }}>The code is ready, but the app will refuse or misuse this file:</p>
              <ul className="findings">
                {problems.slice(0, 4).map((p, i) => <li key={i} className="f-error">{p.where}{p.line ? ` (line ${p.line})` : ""}: {p.msg}</li>)}
              </ul>
              <p className="muted">The full list is in the <a href="/check?ref=qr">config checker</a>.</p>
            </>
          )}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <img src={qr} width={320} height={320} alt="QR code of the WireGuard client configuration pasted above" style={{ background: "#fff", borderRadius: 6 }} />
            <div style={{ maxWidth: "40ch" }}>
              <p style={{ marginTop: 0 }}>In the WireGuard app: <strong>+</strong>, then <strong>Scan from QR code</strong> (Android: &quot;Scan from QR code&quot;; iOS: &quot;Create from QR code&quot;).</p>
              <p className="muted">This image holds the client&apos;s private key. Do not post a screenshot of it; anyone who scans it can join your VPN as this device.</p>
              <a className="btn ghost sm" href={qr} download={`${name}.png`}>Download PNG</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
