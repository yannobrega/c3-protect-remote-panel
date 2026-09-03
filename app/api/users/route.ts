import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, authSessions, users } from "@/db/schema";
import { assertSameOrigin, requirePermission } from "@/lib/auth";
import { hashPassword, validPassword } from "@/lib/password";

const roles = new Set(["admin", "operator", "viewer"]);

export async function GET() {
  const actor = await requirePermission("manage_users");
  if (!actor) return Response.json({ error: "Não autorizado" }, { status: 403 });
  const rows = await getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users).orderBy(asc(users.name));
  return Response.json({ users: rows });
}

export async function POST(request: Request) {
  const actor = await requirePermission("manage_users");
  if (!actor) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });
  const payload = await request.json() as Record<string, unknown>;
  const name = String(payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const role = String(payload.role ?? "viewer");
  if (name.length < 2 || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || !roles.has(role) || !validPassword(password)) return Response.json({ error: "Preencha os dados e use uma senha com pelo menos 12 caracteres." }, { status: 400 });
  try {
    const [created] = await getDb().insert(users).values({ name, email, passwordHash: await hashPassword(password), role }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt });
    await getDb().insert(auditEvents).values({ actorEmail: actor.email, action: "user.created", resourceType: "user", resourceId: String(created.id), summary: `${created.name} cadastrado como ${role}` });
    return Response.json({ user: created }, { status: 201 });
  } catch { return Response.json({ error: "Este e-mail já está cadastrado." }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("manage_users");
  if (!actor) return Response.json({ error: "Não autorizado" }, { status: 403 });
  if (!(await assertSameOrigin(request))) return Response.json({ error: "Origem inválida" }, { status: 403 });
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id); const role = String(payload.role ?? ""); const active = payload.active; const password = String(payload.password ?? "");
  if (!Number.isInteger(id) || id <= 0 || (role && !roles.has(role)) || (active !== undefined && typeof active !== "boolean") || (password && !validPassword(password))) return Response.json({ error: "Alteração inválida." }, { status: 400 });
  if (id === actor.id && active === false) return Response.json({ error: "Você não pode desativar seu próprio usuário." }, { status: 409 });
  if (id === actor.id && role && role !== "admin") return Response.json({ error: "Você não pode remover seu próprio perfil de administrador." }, { status: 409 });
  const values: { role?: string; active?: boolean; passwordHash?: string; failedLoginCount?: number; lockedUntil?: null; updatedAt: string } = { updatedAt: new Date().toISOString() };
  if (role) values.role = role; if (typeof active === "boolean") values.active = active;
  if (password) { values.passwordHash = await hashPassword(password); values.failedLoginCount = 0; values.lockedUntil = null; }
  const [updated] = await getDb().update(users).set(values).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt });
  if (!updated) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (password || active === false) await getDb().delete(authSessions).where(eq(authSessions.userId, id));
  await getDb().insert(auditEvents).values({ actorEmail: actor.email, action: "user.updated", resourceType: "user", resourceId: String(id), summary: `${updated.name} atualizado` });
  return Response.json({ user: updated });
}
