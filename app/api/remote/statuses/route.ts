import { asc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { devices } from "@/db/schema";
import { deriveGatewayApiKey } from "@/lib/credentials";
import { fetchGateway } from "@/lib/gateway";

type ProbeResult = {
  id?: string;
  online?: boolean;
  latencyMs?: number | null;
  error?: string | null;
};

export async function GET() {
  const user = await requirePermission("view");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const targets = await getDb()
      .select({
        id: devices.id,
        host: devices.managementIp,
      })
      .from(devices)
      .orderBy(asc(devices.id));

    if (!targets.length) {
      return Response.json({ checkedAt: new Date().toISOString(), statuses: {} });
    }

    const gatewayKey = await deriveGatewayApiKey();
    const response = await fetchGateway("/v1/probes", {
      method: "POST",
      headers: {
        authorization: `Bearer ${gatewayKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        targets: targets.map((target) => ({
          id: String(target.id),
          host: target.host,
          port: 22333,
        })),
      }),
    });
    const data = (await response.json()) as {
      checkedAt?: string;
      results?: ProbeResult[];
      error?: string;
    };
    if (!response.ok || !Array.isArray(data.results)) {
      return Response.json(
        { error: data.error ?? "O Gateway não oferece verificação de status." },
        { status: 502 },
      );
    }

    const statuses = Object.fromEntries(
      data.results
        .filter((result) => result.id)
        .map((result) => [
          String(result.id),
          {
            online: result.online === true,
            latencyMs: typeof result.latencyMs === "number" ? result.latencyMs : null,
            error: result.error ?? null,
          },
        ]),
    );

    return Response.json({
      checkedAt: data.checkedAt ?? new Date().toISOString(),
      statuses,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível verificar os MikroTiks." },
      { status: 502 },
    );
  }
}
