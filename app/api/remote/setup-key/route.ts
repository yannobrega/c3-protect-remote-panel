import { requirePermission } from "@/lib/auth";
import { deriveGatewayApiKey } from "@/lib/credentials";

export async function GET() {
  const user = await requirePermission("settings");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  return Response.json(
    { key: await deriveGatewayApiKey() },
    { headers: { "cache-control": "no-store" } },
  );
}
