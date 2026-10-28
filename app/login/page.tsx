import type { Metadata } from "next";
import LoginCard from "@/components/LoginCard";

export const metadata: Metadata = { title: "Sign in · Homebase" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  return <LoginCard next={next} />;
}
