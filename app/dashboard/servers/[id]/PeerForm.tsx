"use client";

import { useActionState } from "react";
import { addPeer, type ActionState } from "../../../actions";

export function PeerForm({ serverId }: { serverId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addPeer, undefined);
  const v = state?.values ?? {};
  return (
    <form className="stack" action={action} style={{ maxWidth: 620 }}>
      <input type="hidden" name="serverId" value={serverId} />
      <label>Device name<input name="name" placeholder="Laptop, iPhone, office router" required maxLength={60} defaultValue={v.name} /></label>
      <div className="row">
        <label>Routing
          <select name="mode" defaultValue={v.mode ?? "full"}>
            <option value="full">Full tunnel: all traffic through the VPN</option>
            <option value="split">Split tunnel: only the VPN subnet</option>
          </select>
        </label>
        <label>PersistentKeepalive (seconds, 25 behind NAT)<input name="keepalive" type="number" defaultValue={v.keepalive ?? 25} min={0} max={600} /></label>
      </div>
      {state?.error && <div className="err">{state.error}</div>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Generating keys" : "Add peer"}</button>
    </form>
  );
}
