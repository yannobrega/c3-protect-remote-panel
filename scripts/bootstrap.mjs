import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scrypt = promisify(scryptCallback);
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "yan.nobrega@c3support.com.br").trim().toLowerCase();
const adminName = (process.env.BOOTSTRAP_ADMIN_NAME || "Yan Nobrega").trim();
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";

if (!databaseUrl) throw new Error("DATABASE_URL não configurada");

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users (active);

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions (token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      legal_name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      has_contract BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_tax_id ON companies (tax_id);
    CREATE INDEX IF NOT EXISTS idx_companies_trade_name ON companies (trade_name);
    CREATE INDEX IF NOT EXISTS idx_companies_has_contract ON companies (has_contract);

    CREATE TABLE IF NOT EXISTS devices (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id),
      rb_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      management_ip TEXT NOT NULL,
      sstp_user TEXT NOT NULL,
      ssh_username TEXT NOT NULL DEFAULT 'c3.remote',
      ssh_password_encrypted TEXT NOT NULL,
      ssh_password_iv TEXT NOT NULL,
      pending_ssh_password_encrypted TEXT,
      pending_ssh_password_iv TEXT,
      pending_ssh_password_created_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_management_ip ON devices (management_ip);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_sstp_user ON devices (sstp_user);
    CREATE INDEX IF NOT EXISTS idx_devices_client_name ON devices (client_name);
    CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);

    CREATE TABLE IF NOT EXISTS remote_sessions (
      id SERIAL PRIMARY KEY,
      gateway_session_id TEXT NOT NULL,
      device_id INTEGER REFERENCES devices(id),
      device_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      management_ip TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      connected_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      ended_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_sessions_gateway_id ON remote_sessions (gateway_session_id);
    CREATE INDEX IF NOT EXISTS idx_remote_sessions_device_id ON remote_sessions (device_id);
    CREATE INDEX IF NOT EXISTS idx_remote_sessions_status ON remote_sessions (status);
    CREATE INDEX IF NOT EXISTS idx_remote_sessions_created_at ON remote_sessions (created_at);

    CREATE TABLE IF NOT EXISTS audit_events (
      id SERIAL PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events (resource_type, resource_id);
  `);

  await sql`DELETE FROM auth_sessions WHERE expires_at <= NOW()`;
  const existing = await sql`SELECT id FROM users WHERE email = ${adminEmail} LIMIT 1`;
  if (!existing.length) {
    if (adminPassword.length < 12) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD deve ter pelo menos 12 caracteres no primeiro deploy");
    }
    const passwordHash = await hashPassword(adminPassword);
    await sql`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES (${adminName}, ${adminEmail}, ${passwordHash}, 'admin', TRUE)
    `;
    console.log(`[bootstrap] administrador inicial criado: ${adminEmail}`);
  } else {
    console.log(`[bootstrap] banco pronto; administrador existente: ${adminEmail}`);
  }
} finally {
  await sql.end();
}
