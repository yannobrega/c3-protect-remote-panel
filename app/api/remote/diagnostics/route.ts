import { eq } from "drizzle-orm";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { auditEvents, devices } from "@/db/schema";
import { decryptCredential, deriveGatewayApiKey } from "@/lib/credentials";
import { fetchGateway } from "@/lib/gateway";

const COMMAND_IDS = new Set([
  "system-overview",
  "ping",
  "traceroute",
  "dns",
  "interfaces",
  "ip-addresses",
  "routes",
  "dhcp-leases",
  "neighbors",
  "firewall",
  "sstp",
  "logs",
  "connections",
  "ppp-sessions",
  "internet-test",
  "run-backup",
  "restart-sstp",
]);

type GatewayCommandResult = {
  commandId?: string;
  output?: string;
  exitCode?: number | null;
  durationMs?: number;
  error?: string;
};

function parseKeyValues(value: string) {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.match(/^\s*([a-z0-9-]+):\s*(.*?)\s*$/i))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1].toLowerCase(), match[2]]),
  );
}

function readTemperature(health: string) {
  for (const sensor of ["cpu-temperature", "board-temperature", "temperature"]) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*(?:\\d+\\s+)?${sensor}\\s*:?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*(?:°?C)?`,
      "i",
    );
    const match = health.match(pattern);
    if (match) return `${match[1].replace(",", ".")} °C`;
  }
  return null;
}

function parseOverview(output: string) {
  const [resource = "", health = ""] = output
    .split("===HEALTH===")
    .map((section) => section.replace("===RESOURCE===", "").trim());
  const fields = parseKeyValues(resource);
  return {
    model: fields["board-name"] ?? fields.platform ?? "Não informado",
    uptime: fields.uptime ?? "Não informado",
    cpuLoad: fields["cpu-load"] ?? "Não informado",
    temperature: readTemperature(health),
    version: fields.version ?? "Não informado",
    architecture: fields["architecture-name"] ?? "Não informado",
    cpu: fields.cpu ?? "Não informado",
    totalMemory: fields["total-memory"] ?? "Não informado",
    freeMemory: fields["free-memory"] ?? "Não informado",
  };
}

async function runCommand(deviceId: number, commandId: string, actorEmail: string) {
  const db = getDb();
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);
  if (!device) return { error: "MikroTik não encontrado.", status: 404 } as const;

  const password = await decryptCredential(
    device.sshPasswordEncrypted,
    device.sshPasswordIv,
  );
  const gatewayKey = await deriveGatewayApiKey();
  const response = await fetchGateway("/v1/commands", {
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
      actorEmail,
      commandId,
    }),
  });
  const result = (await response.json()) as GatewayCommandResult;
  if (!response.ok || typeof result.output !== "string") {
    return {
      error: result.error ?? "O Gateway não conseguiu consultar o MikroTik.",
      status: response.status === 504 ? 504 : 502,
    } as const;
  }

  await db.insert(auditEvents).values({
    actorEmail,
    action: "remote.command_executed",
    resourceType: "device",
    resourceId: String(device.id),
    summary: `Comando ${commandId} executado em ${device.rbName}`,
  });
  return { result, device } as const;
}

export async function GET(request: Request) {
  const user = await requirePermission("remote_access");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const deviceId = Number(new URL(request.url).searchParams.get("deviceId"));
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    return Response.json({ error: "MikroTik inválido." }, { status: 400 });
  }

  try {
    const command = await runCommand(deviceId, "system-overview", user.email);
    if ("error" in command) {
      return Response.json({ error: command.error }, { status: command.status });
    }
    return Response.json({
      overview: parseOverview(command.result.output ?? ""),
      durationMs: command.result.durationMs ?? null,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar os dados do MikroTik." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("remote_access");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const deviceId = Number(payload.deviceId);
    const commandId = String(payload.commandId ?? "");
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return Response.json({ error: "MikroTik inválido." }, { status: 400 });
    }
    if (commandId === "system-overview" || !COMMAND_IDS.has(commandId)) {
      return Response.json({ error: "Comando não autorizado." }, { status: 400 });
    }

    const command = await runCommand(deviceId, commandId, user.email);
    if ("error" in command) {
      return Response.json({ error: command.error }, { status: command.status });
    }
    return Response.json({
      commandId,
      output: command.result.output,
      exitCode: command.result.exitCode ?? null,
      durationMs: command.result.durationMs ?? null,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível executar o comando no MikroTik." },
      { status: 502 },
    );
  }
}
