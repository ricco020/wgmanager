"use client";

import { useActionState } from "react";
import { login, signup, type ActionState } from "./actions";

export function AuthForm({ mode, next }: { mode: "signup" | "login"; next: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mode === "signup" ? signup : login, undefined);
  return (
    <div style={{ maxWidth: 460, margin: "60px auto" }}>
      <h1>{mode === "signup" ? "Create your free account" : "Log in"}</h1>
      <p className="muted">{mode === "signup" ? "1 server and 3 peers, free, no card required." : "Welcome back."}</p>
      <form className="stack" action={action}>
        <input type="hidden" name="next" value={next} />
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password (10 characters minimum)<input name="password" type="password" required minLength={10} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
        {state?.error && <div className="err">{state.error}</div>}
        <button className="btn" type="submit" disabled={pending}>{pending ? "One moment" : mode === "signup" ? "Create account" : "Log in"}</button>
      </form>
      <p className="muted" style={{ marginTop: 20 }}>
        {mode === "signup" ? <>Already registered? <a href="/login">Log in</a>.</> : <>No account yet? <a href="/signup">Start free</a>.</>}
      </p>
      {mode === "signup" && <p className="muted" style={{ fontSize: 13 }}>By creating an account you accept the <a href="/terms">terms</a>. Your email is used for login and billing only.</p>}
    </div>
  );
}
