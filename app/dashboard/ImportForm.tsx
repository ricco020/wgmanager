"use client";

import { useActionState } from "react";
import { importServer, type ActionState } from "../actions";
import { FREE_LIMITS } from "@/lib/site";

export function ImportForm({ pro }: { pro: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(importServer, undefined);
  return (
    <form className="stack" action={action} style={{ maxWidth: 620 }}>
      <div className="row">
        <label>Name<input name="name" placeholder="Existing VPS" maxLength={60} /></label>
        <label>Public endpoint (hostname or IP)<input name="endpoint" placeholder="vpn.example.com" required /></label>
      </div>
      <label>DNS pushed to new clients<input name="dns" defaultValue="1.1.1.1" /></label>
      <label>Server wg0.conf (the file in /etc/wireguard on the server, with its [Interface] PrivateKey and [Peer] blocks)
        <textarea name="conf" rows={10} required spellCheck={false} placeholder={"[Interface]\nAddress = 10.8.0.1/24\nListenPort = 51820\nPrivateKey = ...\n\n[Peer]\n# laptop\nPublicKey = ...\nAllowedIPs = 10.8.0.2/32"} style={{ fontFamily: "var(--mono)", fontSize: 13 }} />
      </label>
      {!pro && <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center" }}><input type="checkbox" name="onlyFirst" style={{ width: "auto" }} /> Import only the first {FREE_LIMITS.peers} peers (free plan)</label>}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Keys stay as they are: nothing changes on the server or the devices. Imported peers keep their private key on their device, so new client files are issued only after you rotate a peer's keys here.</p>
      {state?.error && <div className="err">{state.error}</div>}
      <button className="btn ghost" type="submit" disabled={pending}>{pending ? "Importing" : "Import wg0.conf"}</button>
    </form>
  );
}
