import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Create a free account" };
export const dynamic = "force-dynamic";

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={next ?? ""} />;
}
