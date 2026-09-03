import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mantém a rotação SSH em duas etapas", async () => {
  const source = await readFile("app/api/devices/manage/route.ts", "utf8");
  assert.match(source, /pendingSshPasswordEncrypted/);
  assert.match(source, /action === "confirm-rotation"/);
  assert.match(source, /commandId: "system-overview"/);
  assert.match(source, /sshPasswordEncrypted: device\.pendingSshPasswordEncrypted/);
});

test("scripts administrativos preservam acesso e usam escaping", async () => {
  const source = await readFile("lib/router-script.ts", "utf8");
  assert.match(source, /buildSshRotationScript/);
  assert.match(source, /\/ip service set ssh disabled=no port=22333/);
  assert.match(source, /buildDeviceUpdateScript/);
  assert.match(source, /routerOsString\(input\.rbName\)/);
});

test("script padrão habilita WebFig somente pela rede de suporte", async () => {
  const source = await readFile("lib/router-script.ts", "utf8");
  assert.match(source, /ACCEPT WEBFIG/);
  assert.match(source, /dst-port=1080/);
  assert.match(source, /set www address=172\.18\.18\.0\/32,172\.17\.17\.0\/32 disabled=no port=1080/);
});

test("bootstrap PostgreSQL mantém a rotação opcional", async () => {
  const bootstrap = await readFile("scripts/bootstrap.mjs", "utf8");
  assert.match(bootstrap, /pending_ssh_password_encrypted TEXT,/);
  assert.match(bootstrap, /pending_ssh_password_created_at TIMESTAMPTZ,/);
  assert.doesNotMatch(bootstrap, /pending_ssh_password_encrypted TEXT NOT NULL/);
});
