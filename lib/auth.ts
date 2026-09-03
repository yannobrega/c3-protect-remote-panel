import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db";
import { authSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "c3_remote_session";
export type UserRole = "admin" | "operator" | "viewer";
export type AppUser = { id: number; name: string; email: string; role: UserRole };
export type Permission = "view" | "remote_access" | "manage_devices" | "manage_users" | "settings";

const permissions: Record<UserRole, Permission[]> = {
  admin: ["view", "remote_access", "manage_devices", "manage_users", "settings"],
  operator: ["view", "remote_access", "manage_devices"],
  viewer: ["view"],
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(authSessions).innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.tokenHash, tokenHash(token)), gt(authSessions.expiresAt, new Date().toISOString()), eq(users.active, true))).limit(1);
  if (!row || !["admin", "operator", "viewer"].includes(row.role)) return null;
  return { ...row, role: row.role as UserRole };
}

export async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  return user && permissions[user.role].includes(permission) ? user : null;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const requestHeaders = await headers();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await getDb().insert(authSessions).values({ userId, tokenHash: tokenHash(token), expiresAt: expiresAt.toISOString(), ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenHash(token)));
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export async function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
