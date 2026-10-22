import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next === "import" || next === "pro" ? next : "";
  if (await currentUser()) redirect(safe === "import" ? "/dashboard#import" : "/dashboard");
  return <AuthForm mode="login" next={safe} />;
}
