"use client";

import { useState } from "react";
import { computeAllowedIps, LAN_RANGES, parseList } from "@/lib/cidr";

const PRESETS: Array<[string, string]> = [
  ["Private LAN ranges", LAN_RANGES],
  ["Only my home network", "192.168.1.0/24"],
  ["Nothing (full tunnel)", ""],
];

export function Calculator() {
  const [allowed, setAllowed] = useState("0.0.0.0/0, ::/0");
  const [excluded, setExcluded] = useState(LAN_RANGES);
  const [keep, setKeep] = useState("10.8.0.0/24");
  const [out, setOut] = useState<{ list: string[]; errors: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  function run(a = allowed, x = excluded) {
    const pa = parseList(a);
    const px = parseList(x);
    const pk = parseList(keep);
    const errors = [...pa.errors, ...px.errors, ...pk.errors];
    setOut({ list: errors.length ? [] : computeAllowedIps(pa.ranges, px.ranges, pk.ranges), errors });
    setCopied(false);
    fetch("/api/check-run?kind=allowedips", { method: "POST", keepalive: true }).catch(() => {});
  }

  const line = out && out.list.length ? `AllowedIPs = ${out.list.join(", ")}` : "";

  return (
    <div className="checker">
      <label>
        Allowed IPs (what the tunnel should carry)
        <input value={allowed} onChange={(e) => setAllowed(e.target.value)} spellCheck={false} autoComplete="off" />
      </label>
      <label style={{ display: "block", marginTop: 14 }}>
        Disallowed IPs (what must stay outside the tunnel)
        <textarea rows={3} value={excluded} onChange={(e) => setExcluded(e.target.value)} spellCheck={false} autoComplete="off" style={{ fontSize: 13 }} />
      </label>
      <label style={{ display: "block", marginTop: 14 }}>
        VPN tunnel subnet, kept in the tunnel even if it falls in an excluded range (optional)
        <input value={keep} onChange={(e) => setKeep(e.target.value)} spellCheck={false} autoComplete="off" />
      </label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0 18px" }}>
        <button className="btn" type="button" onClick={() => run()}>Calculate AllowedIPs</button>
        {PRESETS.map(([label, v]) => (
          <button key={label} className="btn ghost sm" type="button" onClick={() => { setExcluded(v); run(allowed, v); }}>{label}</button>
        ))}
      </div>

      {out && (
        <div className="panel fade" aria-live="polite">
          {out.errors.length > 0 ? (
            <ul className="findings">
              {out.errors.map((e) => <li key={e} className="f-error">{e}</li>)}
            </ul>
          ) : out.list.length === 0 ? (
            <p className="muted">Nothing left: the disallowed ranges cover everything you allowed. The peer would route no traffic.</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                {out.list.length} block{out.list.length === 1 ? "" : "s"}. Paste this line in the <code>[Peer]</code> section of the client file, in place of the current AllowedIPs.
              </p>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 13 }}>{line}</pre>
              <button className="btn ghost sm" type="button" onClick={() => { navigator.clipboard?.writeText(line).then(() => setCopied(true)).catch(() => {}); }}>
                {copied ? "Copied" : "Copy the line"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
