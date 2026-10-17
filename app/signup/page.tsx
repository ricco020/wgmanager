import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";
import { recordHit } from "@/lib/stats";

export const metadata: Metadata = { title: "Create a free account" };
export const dynamic = "force-dynamic";

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  await recordHit("/signup");
  return <AuthForm mode="signup" next={next ?? ""} />;
}
