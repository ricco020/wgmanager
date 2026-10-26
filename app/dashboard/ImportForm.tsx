"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { EP_KEY, HANDOFF_KEY } from "@/lib/check";
import { importServer, type ActionState } from "../actions";
import { FREE_LIMITS, PRO_PRICE_EUR } from "@/lib/site";

export function ImportForm({ pro }: { pro: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(importServer, undefined);
  const v = state?.values ?? {};
  const conf = useRef<HTMLTextAreaElement>(null);
  const ep = useRef<HTMLInputElement>(null);
  const [fromCheck, setFromCheck] = useState(false);
  // Paying leaves the page for Stripe: the file is parked in this tab and filled in again on return (#import).
  const keepForCheckout = () => {
    try {
      if (conf.current?.value) sessionStorage.setItem(HANDOFF_KEY, conf.current.value);
      if (ep.current?.value) sessionStorage.setItem(EP_KEY, ep.current.value);
    } catch { /* storage unavailable: the visitor pastes again */ }
  };
  // A file checked on /check is carried over once, so the visitor does not paste it twice.
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(HANDOFF_KEY);
      if (t && conf.current && !conf.current.value) {
        conf.current.value = t;
        sessionStorage.removeItem(HANDOFF_KEY);
        const e = sessionStorage.getItem(EP_KEY);
        if (e && ep.current && !ep.current.value) ep.current.value = e.replace(/:\d+$/, "");
        sessionStorage.removeItem(EP_KEY);
        setFromCheck(true);
        conf.current.closest(".panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch { /* storage unavailable */ }
  }, []);
  return (
    <>
    <form className="stack" action={action} style={{ maxWidth: 620 }}>
      <div className="row">
        <label>Name<input name="name" placeholder="Existing VPS" maxLength={60} defaultValue={v.name} /></label>
        <label>Public endpoint (hostname or IP)<input ref={ep} name="endpoint" placeholder="vpn.example.com" required defaultValue={v.endpoint} /></label>
      </div>
      <div className="row">
        <label>DNS pushed to new clients<input name="dns" defaultValue={v.dns ?? "1.1.1.1"} /></label>
        <label>Listen port (wg-easy JSON only, its WG_PORT)<input name="port" inputMode="numeric" placeholder="51820" defaultValue={v.port} /></label>
      </div>
      <label>Server wg0.conf (the file in /etc/wireguard on the server, with its [Interface] PrivateKey and [Peer] blocks), or wg-easy&apos;s wg0.json (v14 and earlier)
        <textarea ref={conf} name="conf" rows={10} required spellCheck={false} defaultValue={v.conf} placeholder={"[Interface]\nAddress = 10.8.0.1/24\nListenPort = 51820\nPrivateKey = ...\n\n[Peer]\n# laptop\nPublicKey = ...\nAllowedIPs = 10.8.0.2/32"} style={{ fontFamily: "var(--mono)", fontSize: 13 }} />
      </label>
      {fromCheck && <div className="ok">Your wg0.conf is filled in again. Add the server&apos;s public endpoint at the top, then import.</div>}
      {!pro && <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center" }}><input type="checkbox" name="onlyFirst" style={{ width: "auto" }} /> Import only the first {FREE_LIMITS.peers} peers (free plan)</label>}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Keys stay as they are: nothing changes on the server or the devices. From a wg0.conf, peers keep their private key on their device, so new client files are issued only after you rotate a peer's keys here. From wg-easy&apos;s wg0.json, each client&apos;s private key is in the file, so its .conf and QR code are ready at once (disabled clients are skipped, its file has no listen port, so set WG_PORT below if it is not 51820).</p>
      {state?.error && <div className="err">{state.error}</div>}
      {state?.paywall && !pro && (
        <div className="panel pro" style={{ margin: 0 }}>
          <p style={{ marginTop: 0 }}>Keep all {state.paywall} peers in one place: Pro is {PRO_PRICE_EUR} EUR/month, unlimited servers and peers, cancel any time. Your file stays in this tab and the import form reopens after payment.</p>
          <button className="btn" type="submit" form="pro-import" onClick={keepForCheckout}>Upgrade to Pro and import all {state.paywall} peers</button>
        </div>
      )}
      <button className="btn ghost" type="submit" disabled={pending}>{pending ? "Importing" : "Import"}</button>
    </form>
    {state?.paywall && !pro && (
      <form id="pro-import" action="/api/stripe/checkout" method="post"><input type="hidden" name="next" value="import" /></form>
    )}
    </>
  );
}
