import { assertSameOrigin, destroySession } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await assertSameOrigin(request))) {
    return Response.json({ error: "Origem inválida" }, { status: 403 });
  }
  await destroySession();
  return Response.json({ ok: true });
}
