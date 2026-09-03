import { desc, eq } from "drizzle-orm";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { auditEvents, devices, remoteSessions } from "@/db/schema";
import { decryptCredential, deriveGatewayApiKey } from "@/lib/credentials";
import { fetchGateway } from "@/lib/gateway";

export async function GET() {
  const user = await requirePermission("view");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const rows = await getDb()
    .select()
    .from(remoteSessions)
    .orderBy(desc(remoteSessions.createdAt))
    .limit(100);

  return Response.json({ sessions: rows });
}

export async function PATCH(request: Request) {
  const user = await requirePermission("remote_access");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  const payload = (await request.json()) as Record<string, unknown>;
  const id = Number(payload.id);
  const status = String(payload.status ?? "");
  const reason = String(payload.reason ?? "").trim().slice(0, 160);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Sessão inválida." }, { status: 400 });
  }
  if (!new Set(["connected", "ended", "failed"]).has(status)) {
    return Response.json({ error: "Estado de sessão inválido." }, { status: 400 });
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(remoteSessions)
    .where(eq(remoteSessions.id, id))
    .limit(1);
  if (!session) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }
  if (session.endedAt) return Response.json({ session });

  const now = new Date().toISOString();
  const ending = status === "ended" || status === "failed";
  const [updated] = await db
    .update(remoteSessions)
    .set({
      status,
      connectedAt: status === "connected" ? now : session.connectedAt,
      endedAt: ending ? now : null,
      endedReason: ending ? reason || null : null,
    })
    .where(eq(remoteSessions.id, id))
    .returning();

  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: status === "connected"
      ? "remote.session_connected"
      : "remote.session_ended",
    resourceType: "remote_session",
    resourceId: String(id),
    summary: status === "connected"
      ? `Sessão SSH conectada a ${session.deviceName}`
      : `Sessão SSH de ${session.deviceName} encerrada${reason ? `: ${reason}` : ""}`,
  });

  return Response.json({ session: updated });
}

export async function POST(request: Request) {
  const user = await requirePermission("remote_access");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const deviceId = Number(payload.deviceId);
    const cols = Number(payload.cols ?? 120);
    const rows = Number(payload.rows ?? 32);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return Response.json({ error: "MikroTik inválido." }, { status: 400 });
    }
    if (!Number.isInteger(cols) || cols < 20 || cols > 400) {
      return Response.json({ error: "Largura do terminal inválida." }, { status: 400 });
    }
    if (!Number.isInteger(rows) || rows < 5 || rows > 200) {
      return Response.json({ error: "Altura do terminal inválida." }, { status: 400 });
    }

    const db = getDb();
    const [device] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, deviceId))
      .limit(1);
    if (!device) {
      return Response.json({ error: "MikroTik não encontrado." }, { status: 404 });
    }

    const password = await decryptCredential(
      device.sshPasswordEncrypted,
      device.sshPasswordIv,
    );
    const gatewayKey = await deriveGatewayApiKey();
    const gatewayResponse = await fetchGateway("/v1/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${gatewayKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        deviceId: String(device.id),
        deviceName: device.rbName,
        host: device.managementIp,
        port: 22333,
        username: device.sshUsername,
        password,
        actorEmail: user.email,
        cols,
        rows,
      }),
    });

    const result = (await gatewayResponse.json()) as Record<string, unknown>;
    if (!gatewayResponse.ok) {
      const message = typeof result.error === "string"
        ? result.error
        : "O Gateway recusou a sessão.";
      return Response.json({ error: message }, { status: 502 });
    }

    const [sessionRecord] = await db
      .insert(remoteSessions)
      .values({
        gatewaySessionId: String(result.sessionId),
        deviceId: device.id,
        deviceName: device.rbName,
        clientName: device.clientName,
        managementIp: device.managementIp,
        actorEmail: user.email,
        status: "pending",
      })
      .returning({ id: remoteSessions.id });

    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "remote.session_created",
      resourceType: "device",
      resourceId: String(device.id),
      summary: `Sessão SSH criada para ${device.rbName}`,
    });

    return Response.json({
      recordId: sessionRecord.id,
      sessionId: result.sessionId,
      token: result.token,
      websocketUrl: result.websocketUrl,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message.includes("OperationError")) {
      return Response.json(
        { error: "Não foi possível descriptografar a credencial da RB." },
        { status: 500 },
      );
    }
    return Response.json(
      { error: "Não foi possível iniciar o acesso remoto." },
      { status: 500 },
    );
  }
}
