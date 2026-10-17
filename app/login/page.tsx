import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function Login() {
  if (await currentUser()) redirect("/app");
  return <AuthForm mode="login" next="" />;
}
