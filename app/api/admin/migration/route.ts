import { asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, companies, devices, remoteSessions } from "@/db/schema";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { encryptCredential } from "@/lib/credentials";

type ExportCompany = {
  id: number;
  legalName: string;
  tradeName: string;
  taxId: string;
  hasContract: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type ExportDevice = {
  id: number;
  companyId: number | null;
  rbName: string;
  clientName: string;
  managementIp: string;
  sstpUser: string;
  sshUsername: string;
  sshPassword: string;
  pendingSshPassword: string | null;
  pendingSshPasswordCreatedAt: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type ExportSession = {
  gatewaySessionId: string;
  deviceId: number | null;
  deviceName: string;
  clientName: string;
  managementIp: string;
  actorEmail: string;
  status: string;
  connectedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  createdAt: string;
};

type MigrationExport = {
  format: string;
  version: number;
  companies: ExportCompany[];
  devices: ExportDevice[];
  remoteSessions: ExportSession[];
};

function migrationSource() {
  const base = process.env.MIGRATION_SOURCE_URL?.trim() || "https://access.c3protect.com.br";
  const url = new URL(base);
  if (url.protocol !== "https:") throw new Error("MIGRATION_SOURCE_URL must use HTTPS");
  return new URL("/api/migration/export", url).toString();
}

function isMigrationExport(value: unknown): value is MigrationExport {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<MigrationExport>;
  return data.format === "c3-protect-remote-migration" && data.version === 1 &&
    Array.isArray(data.companies) && Array.isArray(data.devices) &&
    Array.isArray(data.remoteSessions);
}

export async function POST(request: Request) {
  const actor = await requirePermission("settings");
  if (!actor) return Response.json({ error: "Não autorizado." }, { status: 403 });
  if (!(await assertSameOrigin(request))) {
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  }

  const token = process.env.MIGRATION_EXPORT_TOKEN?.trim() || process.env.GATEWAY_API_KEY?.trim();
  if (!token || token.length < 32) {
    return Response.json({ error: "A chave temporária de migração não foi configurada." }, { status: 503 });
  }

  try {
    const response = await fetch(migrationSource(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(process.env.MIGRATION_SOURCE_BYPASS_TOKEN?.trim()
          ? { "OAI-Sites-Authorization": `Bearer ${process.env.MIGRATION_SOURCE_BYPASS_TOKEN.trim()}` }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      return Response.json(
        {
          error: response.status === 401 || response.status === 403
            ? "O painel antigo bloqueou a chamada. Confira a chave de acesso temporária."
            : `O painel antigo não liberou a exportação (HTTP ${response.status}).`,
        },
        { status: 502 },
      );
    }
    const payload: unknown = await response.json();
    if (!isMigrationExport(payload)) {
      return Response.json({ error: "O arquivo recebido do painel antigo é inválido." }, { status: 502 });
    }
    if (payload.companies.length > 10_000 || payload.devices.length > 25_000 || payload.remoteSessions.length > 100_000) {
      return Response.json({ error: "A exportação excede o limite seguro." }, { status: 413 });
    }

    const db = getDb();
    const companyMap = new Map<number, number>();
    let companiesImported = 0;
    let devicesImported = 0;
    let sessionsImported = 0;

    for (const company of payload.companies) {
      if (!company.taxId || !company.legalName || !company.tradeName) continue;
      const [existing] = await db.select({ id: companies.id }).from(companies)
        .where(eq(companies.taxId, company.taxId)).limit(1);
      let currentId = existing?.id;
      if (currentId) {
        await db.update(companies).set({
          legalName: company.legalName,
          tradeName: company.tradeName,
          hasContract: Boolean(company.hasContract),
          updatedAt: company.updatedAt || new Date().toISOString(),
        }).where(eq(companies.id, currentId));
      } else {
        const [created] = await db.insert(companies).values({
          legalName: company.legalName,
          tradeName: company.tradeName,
          taxId: company.taxId,
          hasContract: Boolean(company.hasContract),
          createdBy: company.createdBy || actor.email,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
        }).returning({ id: companies.id });
        currentId = created.id;
      }
      companyMap.set(company.id, currentId);
      companiesImported += 1;
    }

    const deviceMap = new Map<number, number>();
    for (const device of payload.devices) {
      const companyId = device.companyId ? companyMap.get(device.companyId) ?? null : null;
      if (!device.rbName || !device.managementIp || !device.sstpUser || !device.sshPassword) continue;
      const currentSecret = await encryptCredential(device.sshPassword);
      const pendingSecret = device.pendingSshPassword
        ? await encryptCredential(device.pendingSshPassword)
        : null;
      const [existing] = await db.select({ id: devices.id }).from(devices)
        .where(or(eq(devices.managementIp, device.managementIp), eq(devices.sstpUser, device.sstpUser))).limit(1);
      const values = {
        companyId,
        rbName: device.rbName,
        clientName: device.clientName,
        managementIp: device.managementIp,
        sstpUser: device.sstpUser,
        sshUsername: device.sshUsername || "c3.remote",
        sshPasswordEncrypted: currentSecret.encrypted,
        sshPasswordIv: currentSecret.iv,
        pendingSshPasswordEncrypted: pendingSecret?.encrypted ?? null,
        pendingSshPasswordIv: pendingSecret?.iv ?? null,
        pendingSshPasswordCreatedAt: device.pendingSshPasswordCreatedAt,
        status: device.status || "pending",
        createdBy: device.createdBy || actor.email,
        updatedAt: device.updatedAt || new Date().toISOString(),
      };
      let currentId = existing?.id;
      if (currentId) {
        await db.update(devices).set(values).where(eq(devices.id, currentId));
      } else {
        const [created] = await db.insert(devices).values({
          ...values,
          createdAt: device.createdAt,
        }).returning({ id: devices.id });
        currentId = created.id;
      }
      deviceMap.set(device.id, currentId);
      devicesImported += 1;
    }

    for (const session of payload.remoteSessions) {
      if (!session.gatewaySessionId) continue;
      const [existing] = await db.select({ id: remoteSessions.id }).from(remoteSessions)
        .where(eq(remoteSessions.gatewaySessionId, session.gatewaySessionId)).limit(1);
      if (existing) continue;
      await db.insert(remoteSessions).values({
        gatewaySessionId: session.gatewaySessionId,
        deviceId: session.deviceId ? deviceMap.get(session.deviceId) ?? null : null,
        deviceName: session.deviceName,
        clientName: session.clientName,
        managementIp: session.managementIp,
        actorEmail: session.actorEmail,
        status: session.status,
        connectedAt: session.connectedAt,
        endedAt: session.endedAt,
        endedReason: session.endedReason,
        createdAt: session.createdAt,
      });
      sessionsImported += 1;
    }

    await db.insert(auditEvents).values({
      actorEmail: actor.email,
      action: "migration.completed",
      resourceType: "system",
      resourceId: "legacy-d1",
      summary: `${companiesImported} empresas, ${devicesImported} MikroTiks e ${sessionsImported} sessões importados`,
    });

    return Response.json({ companiesImported, devicesImported, sessionsImported });
  } catch {
    return Response.json({ error: "Não foi possível concluir a migração." }, { status: 500 });
  }
}
