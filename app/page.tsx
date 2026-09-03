import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RemoteDashboard } from "./remote-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <RemoteDashboard
      operatorName={user.name}
      operatorEmail={user.email}
      operatorRole={user.role}
    />
  );
}
