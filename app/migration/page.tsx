import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { MigrationClient } from "./migration-client";

export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  const user = await requirePermission("settings");
  if (!user) redirect("/");
  return <MigrationClient />;
}
