"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { EP_KEY, HANDOFF_KEY } from "@/lib/check";
import { importServer, type ActionState } from "../actions";
import { FREE_LIMITS } from "@/lib/site";

export function ImportForm({ pro }: { pro: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(importServer, undefined);
  const v = state?.values ?? {};
  const conf = useRef<HTMLTextAreaElement>(null);
  const ep = useRef<HTMLInputElement>(null);
  const [fromCheck, setFromCheck] = useState(false);
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
    <form className="stack" action={action} style={{ maxWidth: 620 }}>
      <div className="row">
        <label>Name<input name="name" placeholder="Existing VPS" maxLength={60} defaultValue={v.name} /></label>
        <label>Public endpoint (hostname or IP)<input ref={ep} name="endpoint" placeholder="vpn.example.com" required defaultValue={v.endpoint} /></label>
      </div>
      <label>DNS pushed to new clients<input name="dns" defaultValue={v.dns ?? "1.1.1.1"} /></label>
      <label>Server wg0.conf (the file in /etc/wireguard on the server, with its [Interface] PrivateKey and [Peer] blocks)
        <textarea ref={conf} name="conf" rows={10} required spellCheck={false} defaultValue={v.conf} placeholder={"[Interface]\nAddress = 10.8.0.1/24\nListenPort = 51820\nPrivateKey = ...\n\n[Peer]\n# laptop\nPublicKey = ...\nAllowedIPs = 10.8.0.2/32"} style={{ fontFamily: "var(--mono)", fontSize: 13 }} />
      </label>
      {fromCheck && <div className="ok">Your checked wg0.conf is filled in. Add the server&apos;s public endpoint at the top, then import.</div>}
      {!pro && <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center" }}><input type="checkbox" name="onlyFirst" style={{ width: "auto" }} /> Import only the first {FREE_LIMITS.peers} peers (free plan)</label>}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Keys stay as they are: nothing changes on the server or the devices. Imported peers keep their private key on their device, so new client files are issued only after you rotate a peer's keys here.</p>
      {state?.error && <div className="err">{state.error}</div>}
      <button className="btn ghost" type="submit" disabled={pending}>{pending ? "Importing" : "Import wg0.conf"}</button>
    </form>
  );
}
