import { desc } from "drizzle-orm";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { getDb } from "@/db";
import { auditEvents, companies } from "@/db/schema";
import { isValidTaxId, onlyDigits } from "@/lib/tax-id";

export async function GET() {
  const user = await requirePermission("view");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select()
    .from(companies)
    .orderBy(desc(companies.createdAt));
  return Response.json({ companies: rows });
}

export async function POST(request: Request) {
  const user = await requirePermission("manage_devices");
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const legalName = String(payload.legalName ?? "").trim();
    const tradeName = String(payload.tradeName ?? "").trim();
    const taxId = onlyDigits(String(payload.taxId ?? ""));
    const hasContract = payload.hasContract === true;

    if (!legalName || legalName.length > 160) {
      return Response.json({ error: "Informe a razão social." }, { status: 400 });
    }
    if (!tradeName || tradeName.length > 120) {
      return Response.json({ error: "Informe o nome fantasia." }, { status: 400 });
    }
    if (!isValidTaxId(taxId)) {
      return Response.json({ error: "Informe um CNPJ ou CPF válido." }, { status: 400 });
    }

    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({
        legalName,
        tradeName,
        taxId,
        hasContract,
        createdBy: user.email,
      })
      .returning();

    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "company.created",
      resourceType: "company",
      resourceId: String(company.id),
      summary: `${tradeName} cadastrado`,
    });

    return Response.json({ company }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cadastrar";
    if (message.toLowerCase().includes("unique") || message.includes("23505")) {
      return Response.json(
        { error: "Este CNPJ/CPF já está cadastrado." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Não foi possível cadastrar a empresa." },
      { status: 500 },
    );
  }
}
