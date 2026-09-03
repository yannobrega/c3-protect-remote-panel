import { desc, eq, isNotNull, max } from "drizzle-orm";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { auditEvents, companies, devices, remoteSessions } from "@/db/schema";
import { encryptCredential, generateSshPassword } from "@/lib/credentials";
import { buildRouterScript } from "@/lib/router-script";

const IP_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const SAFE_USER_PATTERN = /^[a-zA-Z0-9._@-]{1,64}$/;

export async function GET() {
  const user = await requirePermission("view");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({
      id: devices.id,
      companyId: devices.companyId,
      rbName: devices.rbName,
      clientName: companies.tradeName,
      companyLegalName: companies.legalName,
      companyTaxId: companies.taxId,
      companyHasContract: companies.hasContract,
      managementIp: devices.managementIp,
      sstpUser: devices.sstpUser,
      sshUsername: devices.sshUsername,
      pendingSshPasswordCreatedAt: devices.pendingSshPasswordCreatedAt,
      status: devices.status,
      createdAt: devices.createdAt,
      updatedAt: devices.updatedAt,
    })
    .from(devices)
    .leftJoin(companies, eq(devices.companyId, companies.id))
    .orderBy(desc(devices.createdAt));

  const lastConnections = await db
    .select({
      deviceId: remoteSessions.deviceId,
      lastConnectionAt: max(remoteSessions.connectedAt),
    })
    .from(remoteSessions)
    .where(isNotNull(remoteSessions.connectedAt))
    .groupBy(remoteSessions.deviceId);
  const lastConnectionByDevice = new Map(
    lastConnections.map((row) => [row.deviceId, row.lastConnectionAt]),
  );

  return Response.json({
    devices: rows.map((device) => ({
      ...device,
      hasPendingSshRotation: Boolean(device.pendingSshPasswordCreatedAt),
      lastConnectionAt: lastConnectionByDevice.get(device.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await requirePermission("manage_devices");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const rbName = String(payload.rbName ?? "").trim();
    const companyId = Number(payload.companyId);
    const managementIp = String(payload.managementIp ?? "").trim();
    const sstpUser = String(payload.sstpUser ?? "").trim();

    if (!rbName || rbName.length > 80) {
      return Response.json({ error: "Informe um nome de RB válido." }, { status: 400 });
    }
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
    }
    if (!IP_PATTERN.test(managementIp)) {
      return Response.json({ error: "Informe um IPv4 válido." }, { status: 400 });
    }
    if (!SAFE_USER_PATTERN.test(sstpUser)) {
      return Response.json({ error: "O usuário SSTP contém caracteres inválidos." }, { status: 400 });
    }

    const sshUsername = "c3.remote";
    const sshPassword = generateSshPassword();
    const secret = await encryptCredential(sshPassword);
    const db = getDb();
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) {
      return Response.json(
        { error: "A empresa selecionada não existe." },
        { status: 400 },
      );
    }

    const [device] = await db
      .insert(devices)
      .values({
        companyId,
        rbName,
        clientName: company.tradeName,
        managementIp,
        sstpUser,
        sshUsername,
        sshPasswordEncrypted: secret.encrypted,
        sshPasswordIv: secret.iv,
        createdBy: user.email,
      })
      .returning({
        id: devices.id,
        companyId: devices.companyId,
        rbName: devices.rbName,
        managementIp: devices.managementIp,
        sstpUser: devices.sstpUser,
        sshUsername: devices.sshUsername,
        status: devices.status,
        createdAt: devices.createdAt,
        updatedAt: devices.updatedAt,
      });

    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "device.created",
      resourceType: "device",
      resourceId: String(device.id),
      summary: `${rbName} cadastrado para ${company.tradeName}`,
    });

    const script = buildRouterScript({
      rbName,
      sstpUser,
      sshUsername,
      sshPassword,
    });

    return Response.json(
      {
        device: {
          ...device,
          clientName: company.tradeName,
          companyLegalName: company.legalName,
          companyTaxId: company.taxId,
          companyHasContract: company.hasContract,
          hasPendingSshRotation: false,
          pendingSshPasswordCreatedAt: null,
          lastConnectionAt: null,
        },
        script,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar";
    if (message.toLowerCase().includes("unique") || message.includes("23505")) {
      return Response.json(
        { error: "O IP ou usuário SSTP já está cadastrado." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Não foi possível cadastrar o MikroTik." },
      { status: 500 },
    );
  }
}
