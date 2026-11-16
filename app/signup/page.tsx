import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";
import { recordHit } from "@/lib/stats";
import { FREE_LIMITS, PRO_PRICE_EUR, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = { title: "Create a free account" };
export const dynamic = "force-dynamic";

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string; peers?: string }> }) {
  const { next, peers: rawPeers } = await searchParams;
  if (await currentUser()) redirect(next === "import" ? "/dashboard#import" : "/dashboard");
  await recordHit(next === "import" ? "/signup:import" : "/signup");
  if (next !== "import") return <AuthForm mode="signup" next={next ?? ""} />;
  // Arriving from the checker: the wg0.conf waits in this tab and fills the import form right after signup.
  const peers = Math.max(0, Math.min(9999, Number.parseInt(rawPeers ?? "", 10) || 0));
  const intro = peers > 0
    ? `Your wg0.conf (${peers} peer${peers === 1 ? "" : "s"}) is kept in this tab and fills the import form as soon as the account exists. Keys and IPs stay as they are.`
    : "Your wg0.conf is kept in this tab and fills the import form as soon as the account exists. Keys and IPs stay as they are.";
  const plan = peers > FREE_LIMITS.peers
    ? `Your new account imports all ${peers} peers: Pro limits are lifted for ${TRIAL_DAYS} days, no card required. They stay afterwards; adding more then needs Pro (${PRO_PRICE_EUR} EUR/month, cancel anytime).`
    : `Free for ${FREE_LIMITS.servers} server and ${FREE_LIMITS.peers} peers, no card required.`;
  return <AuthForm mode="signup" next="import" title="Import your wg0.conf" intro={`${intro} ${plan}`} />;
}
