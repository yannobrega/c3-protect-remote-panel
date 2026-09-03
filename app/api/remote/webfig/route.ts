import { eq } from "drizzle-orm";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { auditEvents, devices } from "@/db/schema";
import { decryptCredential, deriveGatewayApiKey } from "@/lib/credentials";
import { fetchGateway } from "@/lib/gateway";

export async function POST(request: Request) {
  const user = await requirePermission("remote_access");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const deviceId = Number(payload.deviceId);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return Response.json({ error: "MikroTik inválido." }, { status: 400 });
    }

    const db = getDb();
    const [device] = await db.select().from(devices)
      .where(eq(devices.id, deviceId)).limit(1);
    if (!device) {
      return Response.json({ error: "MikroTik não encontrado." }, { status: 404 });
    }

    const password = await decryptCredential(
      device.sshPasswordEncrypted,
      device.sshPasswordIv,
    );
    const gatewayKey = await deriveGatewayApiKey();
    const gatewayResponse = await fetchGateway("/v1/webfig-sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${gatewayKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        deviceId: String(device.id),
        deviceName: device.rbName,
        host: device.managementIp,
        port: 1080,
        username: device.sshUsername,
        password,
        actorEmail: user.email,
      }),
    });
    const result = (await gatewayResponse.json()) as Record<string, unknown>;
    if (!gatewayResponse.ok || typeof result.url !== "string") {
      return Response.json({
        error: typeof result.error === "string"
          ? result.error
          : "O Gateway recusou a sessão WebFig.",
      }, { status: 502 });
    }

    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "remote.webfig_session_created",
      resourceType: "device",
      resourceId: String(device.id),
      summary: `Sessão WebFig criada para ${device.rbName}`,
    });

    return Response.json({
      sessionId: result.sessionId,
      url: result.url,
      expiresAt: result.expiresAt,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível iniciar o WebFig." },
      { status: 502 },
    );
  }
}
