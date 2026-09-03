import { and, eq, inArray } from "drizzle-orm";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { auditEvents, companies, devices, remoteSessions } from "@/db/schema";
import {
  decryptCredential,
  deriveGatewayApiKey,
  encryptCredential,
  generateSshPassword,
} from "@/lib/credentials";
import { fetchGateway } from "@/lib/gateway";
import {
  buildDeviceUpdateScript,
  buildRouterScript,
  buildSshRotationScript,
} from "@/lib/router-script";

const IP_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const SAFE_USER_PATTERN = /^[a-zA-Z0-9._@-]{1,64}$/;

async function findDevice(id: number) {
  const [device] = await getDb()
    .select()
    .from(devices)
    .where(eq(devices.id, id))
    .limit(1);
  return device;
}

function validId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request) {
  const user = await requirePermission("manage_devices");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = validId(payload.id);
    const companyId = validId(payload.companyId);
    const rbName = String(payload.rbName ?? "").trim();
    const managementIp = String(payload.managementIp ?? "").trim();
    const sstpUser = String(payload.sstpUser ?? "").trim();
    if (!id) return Response.json({ error: "MikroTik inválido." }, { status: 400 });
    if (!rbName || rbName.length > 80) {
      return Response.json({ error: "Informe um nome de RB válido." }, { status: 400 });
    }
    if (!companyId) {
      return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
    }
    if (!IP_PATTERN.test(managementIp)) {
      return Response.json({ error: "Informe um IPv4 válido." }, { status: 400 });
    }
    if (!SAFE_USER_PATTERN.test(sstpUser)) {
      return Response.json({ error: "O usuário SSTP contém caracteres inválidos." }, { status: 400 });
    }

    const db = getDb();
    const [current, company] = await Promise.all([
      findDevice(id),
      db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
        .then((rows) => rows[0]),
    ]);
    if (!current) return Response.json({ error: "MikroTik não encontrado." }, { status: 404 });
    if (!company) return Response.json({ error: "Empresa não encontrada." }, { status: 400 });

    const now = new Date().toISOString();
    const [updated] = await db
      .update(devices)
      .set({
        companyId,
        clientName: company.tradeName,
        rbName,
        managementIp,
        sstpUser,
        updatedAt: now,
      })
      .where(eq(devices.id, id))
      .returning();

    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "device.updated",
      resourceType: "device",
      resourceId: String(id),
      summary: `${current.rbName} atualizado para ${rbName}`,
    });

    const routerSyncRequired =
      current.rbName !== rbName || current.sstpUser !== sstpUser;
    return Response.json({
      device: {
        id: updated.id,
        companyId: updated.companyId,
        rbName: updated.rbName,
        clientName: company.tradeName,
        companyLegalName: company.legalName,
        companyTaxId: company.taxId,
        companyHasContract: company.hasContract,
        managementIp: updated.managementIp,
        sstpUser: updated.sstpUser,
        sshUsername: updated.sshUsername,
        status: updated.status,
        createdAt: updated.createdAt,
        pendingSshPasswordCreatedAt: updated.pendingSshPasswordCreatedAt,
        hasPendingSshRotation: Boolean(updated.pendingSshPasswordCreatedAt),
      },
      routerSyncRequired,
      syncScript: routerSyncRequired
        ? buildDeviceUpdateScript({ rbName, sstpUser })
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique") || message.includes("23505")) {
      return Response.json(
        { error: "O IP ou usuário SSTP já está cadastrado." },
        { status: 409 },
      );
    }
    return Response.json({ error: "Não foi possível atualizar o MikroTik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("manage_devices");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = validId(payload.id);
    const action = String(payload.action ?? "");
    if (!id) return Response.json({ error: "MikroTik inválido." }, { status: 400 });
    const device = await findDevice(id);
    if (!device) return Response.json({ error: "MikroTik não encontrado." }, { status: 404 });
    const db = getDb();

    if (action === "regenerate-script") {
      const password = await decryptCredential(
        device.sshPasswordEncrypted,
        device.sshPasswordIv,
      );
      await db.insert(auditEvents).values({
        actorEmail: user.email,
        action: "device.script_regenerated",
        resourceType: "device",
        resourceId: String(id),
        summary: `Script completo regenerado para ${device.rbName}`,
      });
      return Response.json({
        script: buildRouterScript({
          rbName: device.rbName,
          sstpUser: device.sstpUser,
          sshUsername: device.sshUsername,
          sshPassword: password,
        }),
      });
    }

    if (action === "rotate-ssh") {
      let password: string;
      let pendingSince = device.pendingSshPasswordCreatedAt;
      let existing = true;
      if (
        device.pendingSshPasswordEncrypted &&
        device.pendingSshPasswordIv &&
        device.pendingSshPasswordCreatedAt
      ) {
        password = await decryptCredential(
          device.pendingSshPasswordEncrypted,
          device.pendingSshPasswordIv,
        );
      } else {
        password = generateSshPassword();
        const secret = await encryptCredential(password);
        pendingSince = new Date().toISOString();
        existing = false;
        await db
          .update(devices)
          .set({
            pendingSshPasswordEncrypted: secret.encrypted,
            pendingSshPasswordIv: secret.iv,
            pendingSshPasswordCreatedAt: pendingSince,
            updatedAt: pendingSince,
          })
          .where(eq(devices.id, id));
        await db.insert(auditEvents).values({
          actorEmail: user.email,
          action: "device.ssh_rotation_started",
          resourceType: "device",
          resourceId: String(id),
          summary: `Rotação SSH iniciada para ${device.rbName}`,
        });
      }
      return Response.json({
        script: buildSshRotationScript({
          rbName: device.rbName,
          sshUsername: device.sshUsername,
          sshPassword: password,
        }),
        pendingSince,
        existing,
      });
    }

    if (action === "confirm-rotation") {
      if (
        !device.pendingSshPasswordEncrypted ||
        !device.pendingSshPasswordIv ||
        !device.pendingSshPasswordCreatedAt
      ) {
        return Response.json({ error: "Não existe rotação pendente." }, { status: 409 });
      }
      const pendingPassword = await decryptCredential(
        device.pendingSshPasswordEncrypted,
        device.pendingSshPasswordIv,
      );
      const gatewayKey = await deriveGatewayApiKey();
      const gatewayResponse = await fetchGateway("/v1/commands", {
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
          password: pendingPassword,
          actorEmail: user.email,
          commandId: "system-overview",
        }),
      });
      const result = (await gatewayResponse.json()) as { error?: string };
      if (!gatewayResponse.ok) {
        return Response.json(
          { error: result.error ?? "A nova senha ainda não foi aceita pela RB." },
          { status: 502 },
        );
      }

      const now = new Date().toISOString();
      await db
        .update(devices)
        .set({
          sshPasswordEncrypted: device.pendingSshPasswordEncrypted,
          sshPasswordIv: device.pendingSshPasswordIv,
          pendingSshPasswordEncrypted: null,
          pendingSshPasswordIv: null,
          pendingSshPasswordCreatedAt: null,
          updatedAt: now,
        })
        .where(eq(devices.id, id));
      await db.insert(auditEvents).values({
        actorEmail: user.email,
        action: "device.ssh_rotation_completed",
        resourceType: "device",
        resourceId: String(id),
        summary: `Nova credencial SSH validada para ${device.rbName}`,
      });
      return Response.json({ activated: true });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch {
    return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requirePermission("manage_devices");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = validId(payload.id);
    const confirmation = String(payload.confirmation ?? "");
    if (!id) return Response.json({ error: "MikroTik inválido." }, { status: 400 });
    const device = await findDevice(id);
    if (!device) return Response.json({ error: "MikroTik não encontrado." }, { status: 404 });
    if (confirmation !== device.rbName) {
      return Response.json({ error: "Digite o nome exato da RB para confirmar." }, { status: 400 });
    }

    const db = getDb();
    const [activeSession] = await db
      .select({ id: remoteSessions.id })
      .from(remoteSessions)
      .where(and(
        eq(remoteSessions.deviceId, id),
        inArray(remoteSessions.status, ["pending", "connected"]),
      ))
      .limit(1);
    if (activeSession) {
      return Response.json(
        { error: "Finalize a sessão SSH ativa antes de excluir esta RB." },
        { status: 409 },
      );
    }

    await db
      .update(remoteSessions)
      .set({ deviceId: null })
      .where(eq(remoteSessions.deviceId, id));
    await db.delete(devices).where(eq(devices.id, id));
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "device.deleted",
      resourceType: "device",
      resourceId: String(id),
      summary: `${device.rbName} removido do C3 Protect Remote`,
    });
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "Não foi possível excluir o MikroTik." }, { status: 500 });
  }
}
