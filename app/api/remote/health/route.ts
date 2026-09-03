import { requirePermission } from "@/lib/auth";
import { fetchGateway } from "@/lib/gateway";

export async function GET() {
  const user = await requirePermission("view");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const response = await fetchGateway("/health");
    if (!response.ok) throw new Error("gateway unavailable");
    const health = (await response.json()) as Record<string, unknown>;
    return Response.json({ online: health.status === "ok" });
  } catch {
    return Response.json({ online: false });
  }
}
