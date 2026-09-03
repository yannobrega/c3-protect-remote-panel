import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sessões usam cookie HttpOnly e token armazenado como hash", async () => {
  const source = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: "strict"/);
});

test("login limita tentativas e bloqueia temporariamente", async () => {
  const source = await readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  assert.match(source, /attempts >= 5/);
  assert.match(source, /15 \* 60_000/);
  assert.doesNotMatch(source, /passwordHash[^\n]*Response\.json/);
});

test("administrador inicial é criado sem sobrescrever sua senha", async () => {
  const source = await readFile(new URL("../scripts/bootstrap.mjs", import.meta.url), "utf8");
  assert.match(source, /yan\.nobrega@c3support\.com\.br/);
  assert.match(source, /if \(!existing\.length\)/);
  assert.doesNotMatch(source, /UPDATE users SET password_hash/);
});

test("rotas sensíveis exigem permissão e mesma origem", async () => {
  for (const path of [
    "../app/api/users/route.ts",
    "../app/api/devices/manage/route.ts",
    "../app/api/remote/webfig/route.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requirePermission/);
    assert.match(source, /assertSameOrigin/);
  }
});

test("chave explícita do gateway não depende da chave das credenciais", async () => {
  const source = await readFile(new URL("../lib/credentials.ts", import.meta.url), "utf8");
  assert.match(source, /process\.env\.GATEWAY_API_KEY/);
  assert.match(source, /if \(configuredKey\) return configuredKey/);
});
