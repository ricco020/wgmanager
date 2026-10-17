"use client";

import { useActionState } from "react";
import { createServer, type ActionState } from "../actions";

export function ServerForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createServer, undefined);
  return (
    <form className="stack" action={action} style={{ maxWidth: 620 }}>
      <label>Name<input name="name" placeholder="Hetzner Falkenstein" required maxLength={60} /></label>
      <div className="row">
        <label>Public endpoint (hostname or IP)<input name="endpoint" placeholder="vpn.example.com" required /></label>
        <label>UDP port<input name="port" type="number" defaultValue={51820} min={1} max={65535} required /></label>
      </div>
      <div className="row">
        <label>Tunnel subnet (CIDR)<input name="subnet" defaultValue="10.8.0.0/24" required /></label>
        <label>DNS pushed to clients<input name="dns" defaultValue="1.1.1.1" required /></label>
      </div>
      <label>MTU (optional, 1280 to 1500; try 1420 behind PPPoE or CGNAT)<input name="mtu" type="number" min={1280} max={1500} placeholder="leave empty for default" /></label>
      {state?.error && <div className="err">{state.error}</div>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Generating keys" : "Create server"}</button>
    </form>
  );
}
