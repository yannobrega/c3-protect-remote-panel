import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { assertSameOrigin, createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  if (!await assertSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const payload = await request.json() as Record<string, unknown>;
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const locked = user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
  const valid = user?.active && !locked ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    if (user && !locked) {
      const attempts = user.failedLoginCount + 1;
      await db.update(users).set({ failedLoginCount: attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
    }
    return Response.json({ error: locked ? "Acesso bloqueado temporariamente." : "E-mail ou senha incorretos." }, { status: 401 });
  }
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  await createSession(user.id);
  await db.insert(auditEvents).values({ actorEmail: user.email, action: "auth.login", resourceType: "user", resourceId: String(user.id), summary: `${user.name} entrou no painel` });
  return Response.json({ ok: true });
}
